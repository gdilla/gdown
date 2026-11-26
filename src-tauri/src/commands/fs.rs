use serde::Serialize;
use std::fs;
use std::io::Write as IoWrite;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

/// Tauri command: Reads a file's contents as a UTF-8 string.
///
/// # Arguments
/// * `path` - The absolute path of the file to read.
/// * `max_bytes` - A larger file is refused before it is read, with a message
///   meant for the user. The frontend passes the editor's open-size limit, both
///   when opening a document and when re-reading one that changed on disk.
///
/// # Returns
/// The file contents as a String.
#[tauri::command]
pub fn read_file(path: String, max_bytes: u64) -> Result<String, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File '{}' does not exist", path));
    }

    if !file_path.is_file() {
        return Err(format!("Path '{}' is not a file", path));
    }

    let size = fs::metadata(file_path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?
        .len();
    let megabytes = |bytes: u64| format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0));
    if size > max_bytes {
        return Err(format!(
            "'{}' is too large to open ({}; Leaf opens text files up to {}).",
            file_path.file_name().unwrap_or_default().to_string_lossy(),
            megabytes(size),
            megabytes(max_bytes)
        ));
    }

    // Bound the read as well: the file can grow between the check and here.
    let bytes = read_at_most(file_path, max_bytes)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "'{}' is too large to open (Leaf opens text files up to {}).",
            file_path.file_name().unwrap_or_default().to_string_lossy(),
            megabytes(max_bytes)
        ));
    }
    String::from_utf8(bytes).map_err(|_| {
        format!(
            "Failed to read file '{}': stream did not contain valid UTF-8",
            path
        )
    })
}

/// Reads at most `max_bytes + 1` bytes, so the caller can tell "over the limit"
/// from "exactly at it" without ever holding more than that.
fn read_at_most(path: &Path, max_bytes: u64) -> std::io::Result<Vec<u8>> {
    use std::io::Read;
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Tauri command: Writes content to a file at the given path.
/// Creates the file if it doesn't exist, overwrites if it does.
/// Uses atomic write (write to temp then rename) to prevent data loss.
///
/// # Arguments
/// * `path` - The absolute path of the file to write.
/// * `content` - The string content to write.
///
/// # Returns
/// The written file's modified time (ms since UNIX epoch), the same unit as
/// `get_file_modified_time`, for use as the external-change baseline.
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<u64, String> {
    let file_path = Path::new(&path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
        }
    }

    atomic_write(file_path, content.as_bytes())
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Where a write to `path` should land so a symlink at `path` survives: follow
/// the link chain (relative targets against the link's own directory) to the
/// final target, which need not exist yet. A path that is not a symlink, or does
/// not exist, is its own target; symlinked parent directories are left for the
/// OS to traverse. A loop (or over 40 hops) is an error.
pub(crate) fn resolve_write_target(path: &Path) -> Result<PathBuf, String> {
    let mut current = path.to_path_buf();
    for _ in 0..40 {
        match fs::read_link(&current) {
            Ok(target) => {
                let base = current.parent().unwrap_or(Path::new(""));
                current = base.join(target);
            }
            // Not a symlink (or missing): this is where the bytes go.
            Err(_) => return Ok(current),
        }
    }
    Err(format!(
        "Too many levels of symbolic links: '{}'",
        path.display()
    ))
}

/// Atomically replace `path` with `bytes`: write a uniquely named hidden temp
/// file in the same directory, fsync it, then rename it over the target. The
/// temp name is claimed with `create_new`, so it never collides with another
/// write's temp file or a real file. It is removed on any failure.
/// A symlink is written through (the link survives) and the replaced file's
/// permission bits are kept (best effort). Returns the conflict baseline mtime
/// (see `baseline_mtime`).
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<u64, String> {
    let target = resolve_write_target(path)?;
    let dir = match target.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };

    let existing = fs::metadata(&target).ok();
    let (tmp_path, tmp_file) = create_temp_file(dir, existing.is_some())?;

    let result = (|mut tmp_file: fs::File| -> std::io::Result<SystemTime> {
        // Set the final mode before any content lands in the temp file. Best
        // effort: some volumes (SMB/NAS, FUSE) reject chmod, and that must not
        // fail the save; the temp file then stays 0600.
        if let Some(existing) = &existing {
            if let Err(e) = tmp_file.set_permissions(existing.permissions()) {
                eprintln!(
                    "Leaf: could not keep permissions of '{}': {}",
                    target.display(),
                    e
                );
            }
        }
        tmp_file.write_all(bytes)?;
        tmp_file.sync_all()?;
        let ours = WrittenFile::of(&tmp_file.metadata()?)?;
        close_and_rename(tmp_file, &ours, &tmp_path, &target)
    })(tmp_file);

    let modified = result.map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to write '{}': {}", target.display(), e)
    })?;
    millis_since_epoch(modified)
}

/// Close our temp file, rename it over `target`, and return the conflict baseline
/// mtime. The writer is closed before the final stat: filesystems that set the
/// mtime at close (SMB/NFS) would otherwise change it after the baseline was chosen.
/// `ours` was captured from the open handle, so a replacement is still recognised.
fn close_and_rename<W>(
    writer: W,
    ours: &WrittenFile,
    tmp_path: &Path,
    target: &Path,
) -> std::io::Result<SystemTime> {
    drop(writer);
    // Rename is atomic on the same filesystem.
    fs::rename(tmp_path, target)?;
    let on_disk = fs::metadata(target)
        .ok()
        .and_then(|m| WrittenFile::of(&m).ok());
    Ok(baseline_mtime(ours, on_disk.as_ref()))
}

/// Claim a short, hidden, unique temp file in `dir` with `create_new`. The name is
/// independent of the target name, so long file names still fit. A temp file that
/// will replace an existing file starts as 0600, so that file's content is never
/// readable more widely than it already was; a brand-new file gets the default mode.
fn create_temp_file(dir: &Path, private: bool) -> Result<(PathBuf, fs::File), String> {
    loop {
        let candidate = dir.join(format!(
            ".leaf-{}-{}.tmp",
            std::process::id(),
            TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(if private { 0o600 } else { 0o666 })
            .open(&candidate)
        {
            Ok(file) => return Ok((candidate, file)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => {
                return Err(format!(
                    "Failed to create temp file '{}': {}",
                    candidate.display(),
                    e
                ))
            }
        }
    }
}

/// Identity and mtime of a file, to recognise the file we wrote after the rename.
struct WrittenFile {
    dev: u64,
    ino: u64,
    len: u64,
    modified: SystemTime,
}

impl WrittenFile {
    fn of(meta: &fs::Metadata) -> std::io::Result<Self> {
        Ok(Self {
            dev: meta.dev(),
            ino: meta.ino(),
            len: meta.len(),
            modified: meta.modified()?,
        })
    }
}

/// The conflict baseline for a file just renamed into place: the mtime the final
/// path reports, if it still holds our file (same inode and length), because that is
/// what later `get_file_modified_time` calls see (SMB/NFS may set it at close).
/// Otherwise the file was replaced after the rename, so keep our handle's mtime and
/// let the change surface as a conflict.
fn baseline_mtime(ours: &WrittenFile, on_disk: Option<&WrittenFile>) -> SystemTime {
    match on_disk {
        Some(d) if (d.dev, d.ino, d.len) == (ours.dev, ours.ino, ours.len) => d.modified,
        _ => ours.modified,
    }
}

fn millis_since_epoch(time: SystemTime) -> Result<u64, String> {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .map_err(|e| format!("System time error: {}", e))
}

/// Tauri command: Returns the last modified time of a file as milliseconds since UNIX epoch.
/// Used for external change detection.
#[tauri::command]
pub fn get_file_modified_time(path: String) -> Result<u64, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File '{}' does not exist", path));
    }

    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to read metadata for '{}': {}", path, e))?;

    let modified = metadata
        .modified()
        .map_err(|e| format!("Failed to get modified time for '{}': {}", path, e))?;

    millis_since_epoch(modified)
}

/// Represents a single node (file or directory) in the file tree.
#[derive(Debug, Clone, Serialize)]
pub struct FileNode {
    /// The display name of the file or directory.
    pub name: String,
    /// The full absolute path.
    pub path: String,
    /// Whether this node is a directory.
    pub is_dir: bool,
    /// Child nodes (only populated for directories).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

/// Whether a file belongs in the sidebar's supported document/image set.
fn is_supported_file(path: &Path) -> bool {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase());
    matches!(
        ext.as_deref(),
        Some("md")
            | Some("markdown")
            | Some("mdown")
            | Some("mkd")
            | Some("txt")
            | Some("text")
            | Some("rst")
            | Some("adoc")
            | Some("org")
            | Some("json")
            | Some("yaml")
            | Some("yml")
            | Some("toml")
            | Some("html")
            | Some("htm")
            | Some("css")
            | Some("js")
            | Some("ts")
            | Some("xml")
            | Some("csv")
            | Some("png")
            | Some("jpg")
            | Some("jpeg")
            | Some("gif")
            | Some("bmp")
            | Some("svg")
            | Some("webp")
            | Some("ico")
            | Some("tiff")
            | Some("tif")
    )
}

/// Tauri command: Lists only the immediate children of a directory (non-recursive).
/// Useful for lazy-loading large directory trees.
#[tauri::command(async)]
pub fn read_directory_shallow(path: String) -> Result<Vec<FileNode>, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path '{}' does not exist", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path '{}' is not a directory", path));
    }

    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory '{}': {}", path, e))?;

    let mut nodes: Vec<FileNode> = Vec::new();

    // Skip entries that cannot be read (including broken symlinks) instead of
    // failing the whole listing.
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') {
            continue;
        }

        let entry_path = entry.path();
        // Follow symlinks so linked files and folders are classified by their target.
        let Ok(metadata) = fs::metadata(&entry_path) else {
            continue;
        };

        if metadata.is_dir() {
            nodes.push(FileNode {
                name: file_name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: true,
                children: None, // Not populated in shallow mode
            });
        } else if metadata.is_file() && is_supported_file(&entry_path) {
            nodes.push(FileNode {
                name: file_name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
            });
        }
    }

    // Sort: directories first, then alphabetically
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(nodes)
}

/// Supported image file extensions.
const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "tiff", "tif",
];

/// Check if a file path has a supported image extension.
fn is_image_file(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()),
        None => false,
    }
}

/// Create a new, uniquely named file in the target directory and return its name.
/// Tries `stem.ext`, then `stem_1.ext`, `stem_2.ext`, etc. The name is claimed with
/// `create_new`, so concurrent callers can never receive the same file.
fn create_unique_file(
    target_dir: &Path,
    stem: &str,
    extension: &str,
) -> Result<(String, fs::File), String> {
    let ts = || {
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    };
    for counter in 0..=10001u32 {
        let candidate = match counter {
            0 => format!("{}.{}", stem, extension),
            // Fallback to timestamp after 10000 collisions
            10001 => format!("{}_{}.{}", stem, ts(), extension),
            n => format!("{}_{}.{}", stem, n, extension),
        };
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target_dir.join(&candidate))
        {
            Ok(file) => return Ok((candidate, file)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => {
                return Err(format!(
                    "Failed to create '{}': {}",
                    target_dir.join(&candidate).display(),
                    e
                ))
            }
        }
    }
    Err(format!(
        "No free file name for '{}.{}' in '{}'",
        stem,
        extension,
        target_dir.display()
    ))
}

/// Resolve the assets directory for a given document, creating it if needed.
fn resolve_assets_dir(document_path: &Path) -> Result<std::path::PathBuf, String> {
    let doc_dir = document_path.parent().ok_or_else(|| {
        format!(
            "Cannot determine parent directory of '{}'",
            document_path.display()
        )
    })?;
    let assets_dir = doc_dir.join("assets");

    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir).map_err(|e| {
            format!(
                "Failed to create assets directory '{}': {}",
                assets_dir.display(),
                e
            )
        })?;
    }

    Ok(assets_dir)
}

/// Tauri command: Copies an image file to an `assets` folder relative to a given document path.
///
/// Creates the `assets` directory if it doesn't exist.
/// If a file with the same name already exists, appends `_1`, `_2`, etc. to avoid collisions.
///
/// # Arguments
/// * `image_path` - The absolute path of the source image file.
/// * `document_path` - The absolute path of the current document. The `assets` folder is created
///   as a sibling to this file.
///
/// # Returns
/// The relative path from the document to the copied image (e.g., `assets/photo.png`).
#[tauri::command]
pub fn copy_image_to_assets(image_path: String, document_path: String) -> Result<String, String> {
    let img_path = Path::new(&image_path);

    if !img_path.exists() {
        return Err(format!("Image file '{}' does not exist", image_path));
    }

    if !img_path.is_file() {
        return Err(format!("Image path '{}' is not a file", image_path));
    }

    if !is_image_file(img_path) {
        return Err(format!(
            "File '{}' is not a supported image format. Supported: {:?}",
            image_path, IMAGE_EXTENSIONS
        ));
    }

    let assets_dir = resolve_assets_dir(Path::new(&document_path))?;

    // Determine target file name with deduplication
    let stem = img_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "image".to_string());
    let extension = img_path
        .extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "png".to_string());

    let (target_name, placeholder) = create_unique_file(&assets_dir, &stem, &extension)?;
    drop(placeholder);
    let target_path = assets_dir.join(&target_name);

    // Copy the image file over the claimed placeholder
    fs::copy(img_path, &target_path).map_err(|e| {
        let _ = fs::remove_file(&target_path);
        format!(
            "Failed to copy image '{}' to '{}': {}",
            image_path,
            target_path.display(),
            e
        )
    })?;

    // Return the relative path from the document's directory
    Ok(format!("assets/{}", target_name))
}

/// Tauri command: Writes raw image bytes to an `assets` folder relative to a document.
///
/// This is used when pasting images from the clipboard or handling dropped files
/// where we have raw image data rather than an existing file path on disk.
///
/// # Arguments
/// * `image_bytes` - The raw image data as a byte vector (Tauri serializes JS arrays to Vec<u8>).
/// * `document_path` - The absolute path of the current document.
/// * `file_name` - The desired file name for the image (e.g., `pasted-image-1234.png`).
///
/// # Returns
/// The relative path from the document to the saved image (e.g., `assets/pasted-image-1234.png`).
#[tauri::command]
pub fn write_image_to_assets(
    image_bytes: Vec<u8>,
    document_path: String,
    file_name: String,
) -> Result<String, String> {
    let assets_dir = resolve_assets_dir(Path::new(&document_path))?;

    // Determine target file name with deduplication
    let path_buf = Path::new(&file_name);
    let stem = path_buf
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "image".to_string());
    let ext = path_buf
        .extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "png".to_string());

    let (target_name, mut file) = create_unique_file(&assets_dir, &stem, &ext)?;
    let target_path = assets_dir.join(&target_name);

    file.write_all(&image_bytes).map_err(|e| {
        let _ = fs::remove_file(&target_path);
        format!("Failed to write image data: {}", e)
    })?;

    file.sync_all()
        .map_err(|e| format!("Failed to sync image file: {}", e))?;

    // Return the relative path from the document's directory
    Ok(format!("assets/{}", target_name))
}

/// Result of resolving a file path.
#[derive(Debug, Clone, Serialize)]
pub struct ResolveResult {
    pub canonical_path: String,
    pub exists: bool,
    pub is_file: bool,
}

#[tauri::command]
pub fn resolve_file_path(path: String, base_dir: Option<String>) -> Result<ResolveResult, String> {
    if path.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let home = || dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string());
    // Only `~` and `~/...` mean home; `~name` is an ordinary relative name.
    let expanded = if path == "~" {
        home()?
    } else if let Some(rest) = path.strip_prefix("~/") {
        home()?.join(rest)
    } else {
        let p = PathBuf::from(&path);
        if p.is_absolute() {
            p
        } else {
            let base = base_dir
                .map(PathBuf::from)
                .or_else(dirs::home_dir)
                .unwrap_or_else(|| PathBuf::from("/"));
            base.join(&path)
        }
    };

    let exists = expanded.exists();
    let is_file = expanded.is_file();

    let canonical = if exists {
        expanded.canonicalize().unwrap_or(expanded)
    } else {
        expanded
    };

    Ok(ResolveResult {
        canonical_path: canonical.to_string_lossy().to_string(),
        exists,
        is_file,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::tempdir;

    fn s(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }

    #[test]
    fn test_read_file_refuses_a_file_over_the_limit_without_reading_it() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("data.csv");
        fs::write(&file, "0123456789").unwrap();

        // At the limit the file is read.
        assert_eq!(read_file(s(&file), 10).unwrap(), "0123456789");
        assert!(read_file(s(&file), 9).is_err());

        // The read itself is bounded too, for a file that grows after the check.
        assert_eq!(read_at_most(&file, 4).unwrap().len(), 5);

        // Over it, the user-facing message names the file and both sizes.
        let big = dir.path().join("big.csv");
        fs::File::create(&big)
            .unwrap()
            .set_len(22 * 1024 * 1024 + 700 * 1024)
            .unwrap();
        assert_eq!(
            read_file(s(&big), 4 * 1024 * 1024).unwrap_err(),
            "'big.csv' is too large to open (22.7 MB; Leaf opens text files up to 4.0 MB)."
        );
    }

    fn dir_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn test_write_file_through_symlink_keeps_the_link() {
        let dir = tempdir().unwrap();
        let real = dir.path().join("real.md");
        let link = dir.path().join("link.md");
        fs::write(&real, "old").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        write_file(s(&link), "new".into()).unwrap();

        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_to_string(&real).unwrap(), "new");
    }

    #[test]
    fn test_write_file_returns_the_written_files_modified_time() {
        let dir = tempdir().unwrap();
        let file = s(&dir.path().join("note.md"));

        let written: u64 = write_file(file.clone(), "x".into()).unwrap();

        assert_eq!(written, get_file_modified_time(file).unwrap());
    }

    #[test]
    fn test_write_file_through_dangling_chained_and_looping_links() {
        use std::os::unix::fs::symlink;
        let dir = tempdir().unwrap();
        let d = dir.path();

        // Dangling: the link survives and its named target is created.
        symlink("drafts/new.md", d.join("dangling.md")).unwrap();
        fs::create_dir(d.join("drafts")).unwrap();
        write_file(s(&d.join("dangling.md")), "first".into()).unwrap();
        assert!(fs::symlink_metadata(d.join("dangling.md"))
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read_to_string(d.join("drafts/new.md")).unwrap(),
            "first"
        );

        // Relative chain: both links survive, the final target is written.
        fs::write(d.join("real.md"), "old").unwrap();
        symlink("real.md", d.join("rel.md")).unwrap();
        symlink("rel.md", d.join("chain.md")).unwrap();
        write_file(s(&d.join("chain.md")), "second".into()).unwrap();
        assert!(fs::symlink_metadata(d.join("chain.md"))
            .unwrap()
            .file_type()
            .is_symlink());
        assert!(fs::symlink_metadata(d.join("rel.md"))
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_to_string(d.join("real.md")).unwrap(), "second");

        // Loop: a clean error; neither link is replaced.
        symlink("loop-b.md", d.join("loop-a.md")).unwrap();
        symlink("loop-a.md", d.join("loop-b.md")).unwrap();
        assert!(write_file(s(&d.join("loop-a.md")), "x".into()).is_err());
        assert!(fs::symlink_metadata(d.join("loop-a.md"))
            .unwrap()
            .file_type()
            .is_symlink());
        assert!(fs::symlink_metadata(d.join("loop-b.md"))
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[test]
    fn test_write_file_preserves_permissions() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("secret.md");
        fs::write(&file, "old").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).unwrap();

        write_file(s(&file), "new".into()).unwrap();

        let mode = fs::metadata(&file).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn test_temp_file_for_an_existing_file_starts_private() {
        let dir = tempdir().unwrap();
        let (private_path, _f) = create_temp_file(dir.path(), true).unwrap();
        let mode = fs::metadata(&private_path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "content must never sit in a wider temp file");
    }

    #[test]
    fn test_write_file_gives_a_new_file_the_default_mode() {
        let dir = tempdir().unwrap();
        let reference = dir.path().join("reference.md");
        fs::File::create(&reference).unwrap();
        let file = dir.path().join("new.md");

        write_file(s(&file), "x".into()).unwrap();

        let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&file), mode(&reference));
    }

    /// Test double for a filesystem that sets the mtime when the writer closes.
    struct SetsMtimeOnClose(fs::File, SystemTime);

    impl Drop for SetsMtimeOnClose {
        fn drop(&mut self) {
            self.0.set_modified(self.1).unwrap();
        }
    }

    #[test]
    fn test_baseline_is_sampled_after_the_writer_closes() {
        let dir = tempdir().unwrap();
        let (tmp_path, mut file) = create_temp_file(dir.path(), false).unwrap();
        file.write_all(b"saved").unwrap();
        let ours = WrittenFile::of(&file.metadata().unwrap()).unwrap();
        let closed_at = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(2_000_000_000);
        let target = dir.path().join("note.md");

        let baseline =
            close_and_rename(SetsMtimeOnClose(file, closed_at), &ours, &tmp_path, &target).unwrap();

        // What the next get_file_modified_time poll will see.
        assert_eq!(baseline, fs::metadata(&target).unwrap().modified().unwrap());
        assert_eq!(baseline, closed_at);
    }

    fn stamp(ino: u64, len: u64, secs: u64) -> WrittenFile {
        WrittenFile {
            dev: 1,
            ino,
            len,
            modified: SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(secs),
        }
    }

    #[test]
    fn test_baseline_prefers_the_final_paths_mtime_only_for_our_own_file() {
        let at = |secs| SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(secs);
        let ours = stamp(7, 4, 100);
        // SMB/NFS can set the mtime at close: same file, later stat differs.
        assert_eq!(baseline_mtime(&ours, Some(&stamp(7, 4, 105))), at(105));
        // Replaced by another file, or rewritten to a new length: keep ours.
        assert_eq!(baseline_mtime(&ours, Some(&stamp(8, 4, 105))), at(100));
        assert_eq!(baseline_mtime(&ours, Some(&stamp(7, 9, 105))), at(100));
        assert_eq!(baseline_mtime(&ours, None), at(100));
    }

    #[test]
    fn test_write_file_temp_name_never_touches_neighbours() {
        let dir = tempdir().unwrap();
        let bystander = dir.path().join("notes.gdown-tmp");
        fs::write(&bystander, "keep me").unwrap();

        write_file(s(&dir.path().join("notes.md")), "md".into()).unwrap();
        write_file(s(&dir.path().join("notes.txt")), "txt".into()).unwrap();

        assert_eq!(fs::read_to_string(&bystander).unwrap(), "keep me");
        assert_eq!(
            dir_names(dir.path()),
            vec!["notes.gdown-tmp", "notes.md", "notes.txt"]
        );
    }

    #[test]
    fn test_write_file_accepts_a_maximum_length_file_name() {
        let dir = tempdir().unwrap();
        // 255 bytes is the APFS/ext4 name limit; the temp name must not grow it.
        let file = dir.path().join(format!("{}.md", "a".repeat(252)));

        write_file(s(&file), "long".into()).unwrap();

        assert_eq!(fs::read_to_string(&file).unwrap(), "long");
    }

    #[test]
    fn test_write_file_failure_leaves_no_temp_file() {
        let dir = tempdir().unwrap();
        // Renaming a file over a non-empty directory fails after the temp file exists.
        let target = dir.path().join("folder.md");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("child"), "x").unwrap();

        assert!(write_file(s(&target), "content".into()).is_err());
        assert_eq!(dir_names(dir.path()), vec!["folder.md"]);
    }

    #[test]
    fn test_resolve_write_target_follows_symlinks_like_a_write_would() {
        use std::os::unix::fs::symlink;
        let dir = tempdir().unwrap();
        let d = dir.path();
        let resolve = |p: &Path| resolve_write_target(p);
        fs::write(d.join("real.md"), "x").unwrap();
        fs::create_dir(d.join("realdir")).unwrap();
        symlink(d.join("real.md"), d.join("abs-link.md")).unwrap();
        symlink("real.md", d.join("rel-link.md")).unwrap();
        symlink("rel-link.md", d.join("chain.md")).unwrap();
        symlink("not-yet.md", d.join("dangling.md")).unwrap();
        symlink("loop-b.md", d.join("loop-a.md")).unwrap();
        symlink("loop-a.md", d.join("loop-b.md")).unwrap();
        symlink(d.join("realdir"), d.join("linkdir")).unwrap();

        // Regular and missing files resolve to themselves.
        assert_eq!(resolve(&d.join("real.md")).unwrap(), d.join("real.md"));
        assert_eq!(resolve(&d.join("new.md")).unwrap(), d.join("new.md"));
        // Links (absolute, relative, chained) resolve to the final target.
        assert_eq!(resolve(&d.join("abs-link.md")).unwrap(), d.join("real.md"));
        assert_eq!(resolve(&d.join("rel-link.md")).unwrap(), d.join("real.md"));
        assert_eq!(resolve(&d.join("chain.md")).unwrap(), d.join("real.md"));
        // A dangling link resolves to the target it names, not to itself.
        assert_eq!(
            resolve(&d.join("dangling.md")).unwrap(),
            d.join("not-yet.md")
        );
        // A loop is an error, never the link itself.
        assert!(resolve(&d.join("loop-a.md")).is_err());
        // A file under a symlinked directory is reached through that directory.
        let under = resolve(&d.join("linkdir").join("f.md")).unwrap();
        fs::write(&under, "y").unwrap();
        assert_eq!(
            fs::read_to_string(d.join("realdir").join("f.md")).unwrap(),
            "y"
        );
        assert!(fs::symlink_metadata(d.join("linkdir"))
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[test]
    fn test_concurrent_writes_sharing_a_stem_keep_their_own_bytes() {
        // Two writes sharing a stem (notes.md, notes.html) must never share a
        // temp file, even if they overlap.
        let dir = tempdir().unwrap();
        let paths: Vec<String> = ["notes.md", "notes.html"]
            .iter()
            .map(|n| dir.path().join(n).to_string_lossy().to_string())
            .collect();
        for round in 0..50 {
            let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
            let handles: Vec<_> = paths
                .iter()
                .map(|p| {
                    let (p, barrier) = (p.clone(), barrier.clone());
                    std::thread::spawn(move || {
                        let body = format!("{}:{}", p, round).repeat(2000);
                        barrier.wait();
                        write_file(p.clone(), body.clone()).unwrap();
                        (p, body)
                    })
                })
                .collect();
            for h in handles {
                let (p, body) = h.join().unwrap();
                assert!(
                    fs::read_to_string(&p).unwrap() == body,
                    "{} got foreign bytes",
                    p
                );
            }
        }
        let mut names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["notes.html", "notes.md"]);
    }

    #[test]
    fn test_read_directory_shallow() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        fs::create_dir(root.join("subdir")).unwrap();
        fs::File::create(root.join("subdir/nested.md")).unwrap();
        fs::File::create(root.join("top.md")).unwrap();
        fs::File::create(root.join("binary.bin")).unwrap();

        let result = read_directory_shallow(root.to_string_lossy().to_string()).unwrap();

        assert_eq!(result.len(), 2);
        let subdir = result.iter().find(|n| n.name == "subdir").unwrap();
        assert!(subdir.is_dir);
        assert!(subdir.children.is_none()); // shallow = no children populated
        assert!(result.iter().all(|node| node.name != "binary.bin"));
    }

    #[test]
    fn test_read_directory_shallow_follows_symlinks_and_skips_broken_entries() {
        use std::os::unix::fs::symlink;
        let dir = tempdir().unwrap();
        let elsewhere = tempdir().unwrap();
        fs::create_dir(elsewhere.path().join("folder")).unwrap();
        fs::write(elsewhere.path().join("note.md"), "x").unwrap();
        let root = dir.path();
        fs::write(root.join("plain.md"), "x").unwrap();
        symlink(elsewhere.path().join("folder"), root.join("linked-folder")).unwrap();
        symlink(elsewhere.path().join("note.md"), root.join("linked.md")).unwrap();
        symlink(root.join("missing.md"), root.join("broken.md")).unwrap();

        let result =
            read_directory_shallow(s(root)).expect("one broken entry must not fail the listing");

        let listed: Vec<(&str, bool)> =
            result.iter().map(|n| (n.name.as_str(), n.is_dir)).collect();
        assert_eq!(
            listed,
            vec![
                ("linked-folder", true),
                ("linked.md", false),
                ("plain.md", false)
            ]
        );
    }

    #[test]
    fn test_sorting_dirs_first() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        fs::File::create(root.join("zebra.md")).unwrap();
        fs::create_dir(root.join("alpha")).unwrap();
        fs::File::create(root.join("apple.md")).unwrap();
        fs::create_dir(root.join("beta")).unwrap();

        let children = read_directory_shallow(root.to_string_lossy().to_string()).unwrap();

        // Dirs first (alpha, beta), then files (apple.md, zebra.md)
        assert_eq!(children[0].name, "alpha");
        assert_eq!(children[1].name, "beta");
        assert_eq!(children[2].name, "apple.md");
        assert_eq!(children[3].name, "zebra.md");
    }

    #[test]
    fn test_json_serialization() {
        let node = FileNode {
            name: "test".to_string(),
            path: "/tmp/test".to_string(),
            is_dir: true,
            children: Some(vec![FileNode {
                name: "file.md".to_string(),
                path: "/tmp/test/file.md".to_string(),
                is_dir: false,
                children: None,
            }]),
        };

        let json = serde_json::to_string(&node).unwrap();
        assert!(json.contains("\"name\":\"test\""));
        assert!(json.contains("\"is_dir\":true"));
        // File nodes should not have "children" key in JSON (skip_serializing_if)
        let child_json = serde_json::to_string(&node.children.unwrap()[0]).unwrap();
        assert!(!child_json.contains("children"));
    }

    // --- Image copy tests ---

    #[test]
    fn test_is_image_file() {
        assert!(is_image_file(Path::new("photo.png")));
        assert!(is_image_file(Path::new("photo.jpg")));
        assert!(is_image_file(Path::new("photo.jpeg")));
        assert!(is_image_file(Path::new("photo.gif")));
        assert!(is_image_file(Path::new("photo.bmp")));
        assert!(is_image_file(Path::new("photo.svg")));
        assert!(is_image_file(Path::new("photo.webp")));
        assert!(is_image_file(Path::new("photo.PNG"))); // case-insensitive
        assert!(!is_image_file(Path::new("file.md")));
        assert!(!is_image_file(Path::new("file.txt")));
        assert!(!is_image_file(Path::new("file")));
    }

    #[test]
    fn test_create_unique_file_no_conflict() {
        let dir = tempdir().unwrap();
        let (result, _) = create_unique_file(dir.path(), "photo", "png").unwrap();
        assert_eq!(result, "photo.png");
    }

    #[test]
    fn test_create_unique_file_with_conflicts() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // Create photo.png
        fs::File::create(root.join("photo.png")).unwrap();
        let (result, _) = create_unique_file(root, "photo", "png").unwrap();
        assert_eq!(result, "photo_1.png");

        // Create photo_1.png too
        fs::File::create(root.join("photo_1.png")).unwrap();
        let (result, _) = create_unique_file(root, "photo", "png").unwrap();
        assert_eq!(result, "photo_2.png");
    }

    #[test]
    fn test_concurrent_image_writes_never_share_a_name() {
        // Commands run off the main thread, so simultaneous pastes with the
        // same name must each get their own file.
        let dir = tempdir().unwrap();
        let doc = dir.path().join("doc.md").to_string_lossy().to_string();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(16));
        let handles: Vec<_> = (0..16u8)
            .map(|i| {
                let (doc, barrier) = (doc.clone(), barrier.clone());
                std::thread::spawn(move || {
                    barrier.wait();
                    let rel = write_image_to_assets(vec![i; 4096], doc, "p.png".into()).unwrap();
                    (i, rel)
                })
            })
            .collect();
        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        for (i, rel) in &results {
            assert_eq!(
                fs::read(dir.path().join(rel)).unwrap(),
                vec![*i; 4096],
                "{}",
                rel
            );
        }
    }

    #[test]
    fn test_copy_image_to_assets_basic() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // Create a source image file
        let img_path = root.join("source_image.png");
        fs::File::create(&img_path)
            .unwrap()
            .write_all(b"fake png data")
            .unwrap();

        // Create a document file
        let doc_path = root.join("notes").join("doc.md");
        fs::create_dir_all(root.join("notes")).unwrap();
        fs::File::create(&doc_path).unwrap();

        let result = copy_image_to_assets(
            img_path.to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(result, "assets/source_image.png");

        // Verify the assets dir was created and file was copied
        let copied = root.join("notes").join("assets").join("source_image.png");
        assert!(copied.exists());
        assert_eq!(fs::read_to_string(&copied).unwrap(), "fake png data");
    }

    #[test]
    fn test_copy_image_to_assets_creates_assets_dir() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let img_path = root.join("test.jpg");
        fs::File::create(&img_path)
            .unwrap()
            .write_all(b"jpg data")
            .unwrap();

        let doc_path = root.join("doc.md");
        fs::File::create(&doc_path).unwrap();

        assert!(!root.join("assets").exists());

        copy_image_to_assets(
            img_path.to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(root.join("assets").exists());
        assert!(root.join("assets").join("test.jpg").exists());
    }

    #[test]
    fn test_copy_image_to_assets_deduplication() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let img_path = root.join("photo.png");
        fs::File::create(&img_path)
            .unwrap()
            .write_all(b"img1")
            .unwrap();

        let doc_path = root.join("doc.md");
        fs::File::create(&doc_path).unwrap();

        // First copy
        let r1 = copy_image_to_assets(
            img_path.to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(r1, "assets/photo.png");

        // Second copy - should deduplicate
        let r2 = copy_image_to_assets(
            img_path.to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(r2, "assets/photo_1.png");

        // Third copy
        let r3 = copy_image_to_assets(
            img_path.to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(r3, "assets/photo_2.png");
    }

    #[test]
    fn test_copy_image_to_assets_nonexistent_source() {
        let dir = tempdir().unwrap();
        let doc_path = dir.path().join("doc.md");
        fs::File::create(&doc_path).unwrap();

        let result = copy_image_to_assets(
            "/nonexistent/image.png".to_string(),
            doc_path.to_string_lossy().to_string(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn test_copy_image_to_assets_non_image_file() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let txt_path = root.join("notes.txt");
        fs::File::create(&txt_path).unwrap();

        let doc_path = root.join("doc.md");
        fs::File::create(&doc_path).unwrap();

        let result = copy_image_to_assets(
            txt_path.to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a supported image format"));
    }

    #[test]
    fn test_copy_image_to_assets_directory_as_source() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let sub = root.join("subdir");
        fs::create_dir(&sub).unwrap();

        let doc_path = root.join("doc.md");
        fs::File::create(&doc_path).unwrap();

        let result = copy_image_to_assets(
            sub.to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a file"));
    }

    // --- resolve_file_path tests ---

    #[test]
    fn test_resolve_file_path_absolute() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("test.md");
        fs::File::create(&file).unwrap();

        let result = resolve_file_path(file.to_string_lossy().to_string(), None).unwrap();
        assert!(result.exists);
        assert!(result.is_file);
        assert_eq!(
            result.canonical_path,
            file.canonicalize().unwrap().to_string_lossy().to_string()
        );
    }

    #[test]
    fn test_resolve_file_path_nonexistent() {
        let result = resolve_file_path("/nonexistent/file.md".to_string(), None).unwrap();
        assert!(!result.exists);
        assert!(!result.is_file);
    }

    #[test]
    fn test_resolve_file_path_directory() {
        let dir = tempdir().unwrap();
        let result = resolve_file_path(dir.path().to_string_lossy().to_string(), None).unwrap();
        assert!(result.exists);
        assert!(!result.is_file);
    }

    #[test]
    fn test_resolve_file_path_empty() {
        let result = resolve_file_path("".to_string(), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty"));
    }

    #[test]
    fn test_resolve_file_path_tilde() {
        let result = resolve_file_path("~".to_string(), None).unwrap();
        assert!(result.exists);
        assert!(!result.is_file);
    }

    #[test]
    fn test_resolve_file_path_tilde_slash_and_tilde_names() {
        let home = dirs::home_dir().unwrap();
        let base = tempdir().unwrap();
        let base_str = Some(s(base.path()));

        let sub = resolve_file_path("~/leaf-nope.md".into(), None).unwrap();
        assert_eq!(sub.canonical_path, s(&home.join("leaf-nope.md")));

        // `~é` used to panic (byte slice mid-codepoint); `~foo` became $HOME/oo.
        let accented = resolve_file_path("~é".into(), base_str.clone()).unwrap();
        assert_eq!(accented.canonical_path, s(&base.path().join("~é")));
        let named = resolve_file_path("~foo".into(), base_str).unwrap();
        assert_eq!(named.canonical_path, s(&base.path().join("~foo")));
    }

    #[test]
    fn test_resolve_file_path_relative_with_base() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("doc.md");
        fs::File::create(&file).unwrap();

        let result = resolve_file_path(
            "doc.md".to_string(),
            Some(dir.path().to_string_lossy().to_string()),
        )
        .unwrap();
        assert!(result.exists);
        assert!(result.is_file);
    }
}
