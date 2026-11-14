use serde::Serialize;
use std::fs;
use std::io::Write as IoWrite;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

/// Tauri command: Reads a file's contents as a UTF-8 string.
///
/// # Arguments
/// * `path` - The absolute path of the file to read.
///
/// # Returns
/// The file contents as a String.
#[tauri::command(async)]
pub fn read_file(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File '{}' does not exist", path));
    }

    if !file_path.is_file() {
        return Err(format!("Path '{}' is not a file", path));
    }

    fs::read_to_string(file_path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
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
#[tauri::command(async)]
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

/// Atomically replace `path` with `bytes`: write a uniquely named hidden temp
/// file in the same directory, fsync it, then rename it over the target. The
/// temp name is claimed with `create_new`, so overlapping writes (commands run
/// off the main thread) never share a temp file. It is removed on any failure.
/// A symlink is written through (the link survives) and the replaced file's
/// permission bits are kept. Returns the written file's modified time, read
/// from the open handle so a later external write cannot leak in.
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<u64, String> {
    let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let dir = match target.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };

    // Short and independent of the target name, so long file names still fit.
    let (tmp_path, mut tmp_file) = loop {
        let candidate = dir.join(format!(
            ".leaf-{}-{}.tmp",
            std::process::id(),
            TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => break (candidate, file),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => {
                return Err(format!(
                    "Failed to create temp file '{}': {}",
                    candidate.display(),
                    e
                ))
            }
        }
    };

    let result = (|| -> std::io::Result<SystemTime> {
        tmp_file.write_all(bytes)?;
        if let Ok(existing) = fs::metadata(&target) {
            tmp_file.set_permissions(existing.permissions())?;
        }
        tmp_file.sync_all()?;
        let modified = tmp_file.metadata()?.modified()?;
        // Rename is atomic on the same filesystem.
        fs::rename(&tmp_path, &target)?;
        Ok(modified)
    })();

    let modified = result.map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to write '{}': {}", target.display(), e)
    })?;
    millis_since_epoch(modified)
}

fn millis_since_epoch(time: SystemTime) -> Result<u64, String> {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .map_err(|e| format!("System time error: {}", e))
}

/// Tauri command: Returns the last modified time of a file as milliseconds since UNIX epoch.
/// Used for external change detection.
#[tauri::command(async)]
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

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') {
            continue;
        }

        let entry_path = entry.path();
        let metadata = entry.metadata().map_err(|e| {
            format!(
                "Failed to read metadata for '{}': {}",
                entry_path.display(),
                e
            )
        })?;

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
#[tauri::command(async)]
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
#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn resolve_file_path(path: String, base_dir: Option<String>) -> Result<ResolveResult, String> {
    if path.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let expanded = if path.starts_with('~') {
        let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
        if path == "~" {
            home
        } else {
            home.join(&path[2..])
        }
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
    fn test_concurrent_writes_sharing_a_stem_keep_their_own_bytes() {
        // Commands run off the main thread, so an autosave of notes.md and an
        // HTML export to notes.html can overlap in the same directory.
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
