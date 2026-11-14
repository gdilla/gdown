use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

/// File info with modification time, returned from list_files_with_mtime.
#[derive(Debug, Clone, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub modified_at: u64,
}

/// Convert an absolute project path to the Claude projects directory name.
/// Claude uses the convention: replace `/` with `-`, retaining the leading `-`.
fn project_path_to_claude_dir_name(project_path: &str) -> String {
    project_path.replace('/', "-")
}

/// Tauri command: Checks if a Claude project directory exists for the given project path.
///
/// Looks up `~/.claude/projects/<dir-name>/` where `<dir-name>` is the project path
/// with `/` replaced by `-`.
///
/// Returns `Some(path)` if the directory exists, `None` otherwise.
#[tauri::command(async)]
pub fn find_claude_project_dir(project_path: String) -> Result<Option<String>, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    let dir_name = project_path_to_claude_dir_name(&project_path);
    let claude_dir = home.join(".claude").join("projects").join(&dir_name);

    if claude_dir.is_dir() {
        Ok(Some(claude_dir.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Tauri command: Lists files in a directory with their modification times, sorted newest first.
///
/// Returns an empty vec if the directory does not exist.
#[tauri::command(async)]
pub fn list_files_with_mtime(dir_path: String) -> Result<Vec<FileInfo>, String> {
    let path = Path::new(&dir_path);

    if !path.is_dir() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory '{}': {}", dir_path, e))?;

    let mut files: Vec<FileInfo> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        if !metadata.is_file() {
            continue;
        }

        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        files.push(FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            modified_at,
        });
    }

    // Sort newest first
    files.sort_by_key(|a| std::cmp::Reverse(a.modified_at));

    Ok(files)
}

/// Directory levels below the project root searched for instruction files.
const MAX_INSTRUCTION_DEPTH: usize = 8;

/// Tauri command: Finds instruction files (CLAUDE.md, AGENTS.md) in the project tree
/// and checks ~/.claude/CLAUDE.md.
///
/// Walks the project directory recursively, skipping hidden directories.
#[tauri::command(async)]
pub fn find_instruction_files(project_path: String) -> Result<Vec<String>, String> {
    let mut results: Vec<String> = Vec::new();

    // Check ~/.claude/CLAUDE.md
    if let Some(home) = dirs::home_dir() {
        let global_claude = home.join(".claude").join("CLAUDE.md");
        if global_claude.is_file() {
            results.push(global_claude.to_string_lossy().to_string());
        }
    }

    // Walk project tree
    let root = Path::new(&project_path);
    if root.is_dir() {
        walk_for_instruction_files(root, 0, &mut results);
    }

    Ok(results)
}

/// Walk a directory for CLAUDE.md and AGENTS.md files, skipping hidden dirs,
/// `node_modules`, `target`, symlinks (no cycles) and unreadable entries,
/// and stopping `MAX_INSTRUCTION_DEPTH` levels below the root.
fn walk_for_instruction_files(dir: &Path, depth: usize, results: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') {
            continue;
        }
        // `file_type` does not follow symlinks.
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            if depth < MAX_INSTRUCTION_DEPTH && file_name != "node_modules" && file_name != "target"
            {
                walk_for_instruction_files(&entry.path(), depth + 1, results);
            }
        } else if file_type.is_file() && (file_name == "CLAUDE.md" || file_name == "AGENTS.md") {
            results.push(entry.path().to_string_lossy().to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_project_path_to_claude_dir_name() {
        assert_eq!(
            project_path_to_claude_dir_name("/Users/test/projects/my-app"),
            "-Users-test-projects-my-app"
        );
        assert_eq!(
            project_path_to_claude_dir_name("/home/user/code"),
            "-home-user-code"
        );
    }

    #[test]
    fn test_list_files_with_mtime_nonexistent() {
        let result = list_files_with_mtime("/nonexistent/path/12345".to_string()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_files_with_mtime_basic() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        fs::File::create(root.join("file_a.md"))
            .unwrap()
            .write_all(b"a")
            .unwrap();
        fs::File::create(root.join("file_b.md"))
            .unwrap()
            .write_all(b"b")
            .unwrap();
        // Create a subdirectory (should be excluded from results)
        fs::create_dir(root.join("subdir")).unwrap();

        let result = list_files_with_mtime(root.to_string_lossy().to_string()).unwrap();
        assert_eq!(result.len(), 2);
        // Both should have non-zero modified_at
        assert!(result[0].modified_at > 0);
    }

    #[test]
    fn test_find_instruction_files_in_project() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // Create CLAUDE.md at root
        fs::File::create(root.join("CLAUDE.md"))
            .unwrap()
            .write_all(b"# Root")
            .unwrap();

        // Create nested CLAUDE.md
        fs::create_dir_all(root.join("src").join("components")).unwrap();
        fs::File::create(root.join("src").join("CLAUDE.md"))
            .unwrap()
            .write_all(b"# Src")
            .unwrap();

        // Create AGENTS.md
        fs::File::create(root.join("AGENTS.md"))
            .unwrap()
            .write_all(b"# Agents")
            .unwrap();

        // Create hidden dir with CLAUDE.md (should be skipped)
        fs::create_dir(root.join(".hidden")).unwrap();
        fs::File::create(root.join(".hidden").join("CLAUDE.md"))
            .unwrap()
            .write_all(b"# Hidden")
            .unwrap();

        // Create node_modules with CLAUDE.md (should be skipped)
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::File::create(root.join("node_modules").join("CLAUDE.md"))
            .unwrap()
            .write_all(b"# Modules")
            .unwrap();

        let result = find_instruction_files(root.to_string_lossy().to_string()).unwrap();

        // Should find: possibly ~/.claude/CLAUDE.md + root/CLAUDE.md + root/AGENTS.md + root/src/CLAUDE.md
        // Filter out the global one for this test
        let project_files: Vec<&String> = result
            .iter()
            .filter(|p| p.starts_with(&root.to_string_lossy().to_string()))
            .collect();

        assert_eq!(project_files.len(), 3);
        assert!(project_files
            .iter()
            .any(|p| p.ends_with("CLAUDE.md") && !p.contains("src")));
        assert!(project_files.iter().any(|p| p.ends_with("AGENTS.md")));
        assert!(project_files
            .iter()
            .any(|p| p.contains("src") && p.ends_with("CLAUDE.md")));
    }

    fn project_results(root: &Path) -> Vec<String> {
        let prefix = root.to_string_lossy().to_string();
        find_instruction_files(prefix.clone())
            .unwrap()
            .into_iter()
            .filter(|p| p.starts_with(&prefix))
            .collect()
    }

    #[test]
    fn test_find_instruction_files_stops_at_depth_cap() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let mut at_cap = root.to_path_buf();
        for i in 0..MAX_INSTRUCTION_DEPTH {
            at_cap = at_cap.join(format!("d{}", i));
        }
        let below_cap = at_cap.join("deeper");
        fs::create_dir_all(&below_cap).unwrap();
        fs::write(at_cap.join("CLAUDE.md"), "# at cap").unwrap();
        fs::write(below_cap.join("CLAUDE.md"), "# below cap").unwrap();

        let found = project_results(root);
        assert_eq!(
            found,
            vec![at_cap.join("CLAUDE.md").to_string_lossy().to_string()]
        );
    }

    #[test]
    fn test_find_instruction_files_skips_unreadable_dir() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempdir().unwrap();
        let root = dir.path();
        let locked = root.join("locked");
        fs::create_dir_all(locked.join("inner")).unwrap();
        fs::create_dir(root.join("open")).unwrap();
        fs::write(root.join("open").join("AGENTS.md"), "# open").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

        let result = find_instruction_files(root.to_string_lossy().to_string());
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();

        let found = result.expect("an unreadable directory must not abort the scan");
        assert!(found.iter().any(|p| p.ends_with("open/AGENTS.md")));
    }

    #[test]
    fn test_find_instruction_files_does_not_follow_symlinked_dirs() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("CLAUDE.md"), "# root").unwrap();
        std::os::unix::fs::symlink(root, root.join("loop")).unwrap();

        assert_eq!(project_results(root).len(), 1);
    }
}
