use serde::Serialize;
use std::fs;
use std::io::Write as IoWrite;
use std::path::Path;
use std::time::SystemTime;

/// Tauri command: Reads a file's contents as a UTF-8 string.
///
/// # Arguments
/// * `path` - The absolute path of the file to read.
///
/// # Returns
/// The file contents as a String.
#[tauri::command]
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

/// Tauri command: Reads a file, returning at most `max_bytes` from the end.
///
/// For large files (e.g., multi-MB JSONL transcripts), this avoids sending
/// the full content through Tauri's JSON-based IPC which would freeze the UI.
///
/// Tauri command: Writes content to a file at the given path.
/// Creates the file if it doesn't exist, overwrites if it does.
/// Uses atomic write (write to temp then rename) to prevent data loss.
///
/// # Arguments
/// * `path` - The absolute path of the file to write.
/// * `content` - The string content to write.
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
        }
    }

    // Atomic write: write to a temporary file in the same directory, then rename.
    // This prevents data loss if the process crashes mid-write.
    let tmp_path = file_path.with_extension("gdown-tmp");

    let mut tmp_file = fs::File::create(&tmp_path)
        .map_err(|e| format!("Failed to create temp file '{}': {}", tmp_path.display(), e))?;

    tmp_file.write_all(content.as_bytes()).map_err(|e| {
        // Clean up temp file on write failure
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to write to temp file: {}", e)
    })?;

    tmp_file.sync_all().map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to sync file: {}", e)
    })?;

    // Rename temp file to target (atomic on same filesystem)
    fs::rename(&tmp_path, file_path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to rename temp file to '{}': {}", path, e)
    })?;

    Ok(())
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

    let duration = modified
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?;

    Ok(duration.as_millis() as u64)
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

/// Recursively reads a directory tree starting from `dir_path` and returns the
/// file/folder structure as a JSON-serializable tree.
///
/// Hidden files/folders (starting with `.`) are excluded by default.
/// Only markdown and common text files are included; all directories are traversed.
fn read_dir_recursive(dir_path: &Path, max_depth: u32) -> Result<Vec<FileNode>, String> {
    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory '{}': {}", dir_path.display(), e))?;

    let mut nodes: Vec<FileNode> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/folders
        if file_name.starts_with('.') {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata for '{}': {}", path.display(), e))?;

        if metadata.is_dir() {
            let children = if max_depth > 0 {
                read_dir_recursive(&path, max_depth - 1)?
            } else {
                Vec::new()
            };
            nodes.push(FileNode {
                name: file_name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children: Some(children),
            });
        } else if metadata.is_file() {
            let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase());

            // Include markdown files and common text files
            let include = matches!(
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
            );

            if include {
                nodes.push(FileNode {
                    name: file_name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    children: None,
                });
            }
        }
    }

    // Sort: directories first, then alphabetically (case-insensitive)
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(nodes)
}

/// Tauri command: Opens a folder path and returns its recursive directory tree as JSON.
///
/// # Arguments
/// * `path` - The absolute path of the folder to read.
///
/// # Returns
/// A `FileNode` representing the root folder with its full recursive tree.
#[tauri::command]
pub fn read_directory_tree(path: String, max_depth: Option<u32>) -> Result<FileNode, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path '{}' does not exist", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path '{}' is not a directory", path));
    }

    let depth = max_depth.unwrap_or(10);
    let children = read_dir_recursive(dir_path, depth)?;

    let root_name = dir_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    Ok(FileNode {
        name: root_name,
        path,
        is_dir: true,
        children: Some(children),
    })
}

/// Tauri command: Lists only the immediate children of a directory (non-recursive).
/// Useful for lazy-loading large directory trees.
#[tauri::command]
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
        } else if metadata.is_file() {
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

/// Generate a deduplicated filename in the target directory.
/// If `target_dir/stem.ext` already exists, tries `stem_1.ext`, `stem_2.ext`, etc.
fn deduplicate_filename(target_dir: &Path, stem: &str, extension: &str) -> String {
    let candidate = format!("{}.{}", stem, extension);
    if !target_dir.join(&candidate).exists() {
        return candidate;
    }

    let mut counter = 1u32;
    loop {
        let candidate = format!("{}_{}.{}", stem, counter, extension);
        if !target_dir.join(&candidate).exists() {
            return candidate;
        }
        counter += 1;
        if counter > 10000 {
            // Fallback to timestamp to guarantee uniqueness
            let ts = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            return format!("{}_{}.{}", stem, ts, extension);
        }
    }
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

    let target_name = deduplicate_filename(&assets_dir, &stem, &extension);
    let target_path = assets_dir.join(&target_name);

    // Copy the image file
    fs::copy(img_path, &target_path).map_err(|e| {
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

    let target_name = deduplicate_filename(&assets_dir, &stem, &ext);
    let target_path = assets_dir.join(&target_name);

    // Write the image bytes to the file
    let mut file = fs::File::create(&target_path).map_err(|e| {
        format!(
            "Failed to create image file '{}': {}",
            target_path.display(),
            e
        )
    })?;

    file.write_all(&image_bytes).map_err(|e| {
        let _ = fs::remove_file(&target_path);
        format!("Failed to write image data: {}", e)
    })?;

    file.sync_all()
        .map_err(|e| format!("Failed to sync image file: {}", e))?;

    // Return the relative path from the document's directory
    Ok(format!("assets/{}", target_name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_read_directory_tree_basic() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // Create structure:
        // root/
        //   notes/
        //     sub.md
        //   hello.md
        //   .hidden.md  (should be excluded)
        //   image.png   (should be excluded - not a text file)
        fs::create_dir(root.join("notes")).unwrap();
        fs::File::create(root.join("notes/sub.md"))
            .unwrap()
            .write_all(b"sub")
            .unwrap();
        fs::File::create(root.join("hello.md"))
            .unwrap()
            .write_all(b"# Hello")
            .unwrap();
        fs::File::create(root.join(".hidden.md"))
            .unwrap()
            .write_all(b"hidden")
            .unwrap();
        fs::File::create(root.join("image.png"))
            .unwrap()
            .write_all(b"png")
            .unwrap();

        let result = read_directory_tree(root.to_string_lossy().to_string()).unwrap();

        assert!(result.is_dir);
        let children = result.children.unwrap();
        // Should have: notes/ directory and hello.md (hidden and png excluded)
        assert_eq!(children.len(), 2);
        // Directories come first
        assert_eq!(children[0].name, "notes");
        assert!(children[0].is_dir);
        assert_eq!(children[1].name, "hello.md");
        assert!(!children[1].is_dir);

        // Check nested
        let notes_children = children[0].children.as_ref().unwrap();
        assert_eq!(notes_children.len(), 1);
        assert_eq!(notes_children[0].name, "sub.md");
    }

    #[test]
    fn test_read_directory_tree_nonexistent() {
        let result = read_directory_tree("/nonexistent/path/12345".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn test_read_directory_tree_file_path() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::File::create(&file_path).unwrap();

        let result = read_directory_tree(file_path.to_string_lossy().to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a directory"));
    }

    #[test]
    fn test_read_directory_shallow() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        fs::create_dir(root.join("subdir")).unwrap();
        fs::File::create(root.join("subdir/nested.md")).unwrap();
        fs::File::create(root.join("top.md")).unwrap();

        let result = read_directory_shallow(root.to_string_lossy().to_string()).unwrap();

        assert_eq!(result.len(), 2);
        let subdir = result.iter().find(|n| n.name == "subdir").unwrap();
        assert!(subdir.is_dir);
        assert!(subdir.children.is_none()); // shallow = no children populated
    }

    #[test]
    fn test_sorting_dirs_first() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        fs::File::create(root.join("zebra.md")).unwrap();
        fs::create_dir(root.join("alpha")).unwrap();
        fs::File::create(root.join("apple.md")).unwrap();
        fs::create_dir(root.join("beta")).unwrap();

        let result = read_directory_tree(root.to_string_lossy().to_string()).unwrap();
        let children = result.children.unwrap();

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
    fn test_deduplicate_filename_no_conflict() {
        let dir = tempdir().unwrap();
        let result = deduplicate_filename(dir.path(), "photo", "png");
        assert_eq!(result, "photo.png");
    }

    #[test]
    fn test_deduplicate_filename_with_conflicts() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // Create photo.png
        fs::File::create(root.join("photo.png")).unwrap();
        let result = deduplicate_filename(root, "photo", "png");
        assert_eq!(result, "photo_1.png");

        // Create photo_1.png too
        fs::File::create(root.join("photo_1.png")).unwrap();
        let result = deduplicate_filename(root, "photo", "png");
        assert_eq!(result, "photo_2.png");
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
}
