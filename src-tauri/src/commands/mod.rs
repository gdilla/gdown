pub mod ai_files;
pub mod export;
pub mod fs;
pub mod session;

#[cfg(test)]
mod tests {
    /// Commands that run off the main thread (`#[tauri::command(async)]` or an
    /// `async fn`). Only long-running work belongs here: Pandoc, the export
    /// Save dialog, the recursive AI-file walk, and large folder listings.
    ///
    /// Short file commands (read/write/mtime/image/session/path) must stay
    /// synchronous. The frontend relies on them being serialised on the main
    /// thread: the quit handshake assumes nothing can be edited during its
    /// final writes, tabs opened together must open in order, and the
    /// save/conflict logic assumes one write at a time.
    const ASYNC_COMMANDS: &[&str] = &[
        "check_pandoc",
        "export_document",
        "export_save_dialog",
        "find_instruction_files",
        "open_file_dialog",
        "open_folder_dialog",
        "read_directory_shallow",
        "save_file_dialog",
    ];

    const SYNC_COMMANDS: &[&str] = &[
        "allow_exit",
        "cancel_exit",
        "copy_image_to_assets",
        "find_claude_project_dir",
        "get_export_config",
        "get_export_formats",
        "get_file_modified_time",
        "get_pending_open_files",
        "list_files_with_mtime",
        "load_session_state",
        "read_file",
        "resolve_file_path",
        "save_session_state",
        "write_file",
        "write_image_to_assets",
    ];

    /// (name, runs off the main thread) for every `#[tauri::command]` in `source`.
    fn commands_in(source: &str) -> Vec<(String, bool)> {
        let lines: Vec<&str> = source.lines().collect();
        lines
            .windows(2)
            .filter(|pair| pair[0].trim_start().starts_with("#[tauri::command"))
            .map(|pair| {
                let signature = pair[1].trim_start();
                let name = signature
                    .split("fn ")
                    .nth(1)
                    .and_then(|rest| rest.split('(').next())
                    .unwrap_or_default()
                    .to_string();
                let is_async = pair[0].contains("(async)") || signature.contains("async fn ");
                (name, is_async)
            })
            .collect()
    }

    #[test]
    fn test_only_long_running_commands_leave_the_main_thread() {
        let mut found: Vec<(String, bool)> = [
            include_str!("ai_files.rs"),
            include_str!("export.rs"),
            include_str!("fs.rs"),
            include_str!("session.rs"),
            include_str!("../lib.rs"),
        ]
        .iter()
        .flat_map(|source| commands_in(source))
        .collect();
        found.sort();
        let names = |is_async: bool| -> Vec<&str> {
            found
                .iter()
                .filter(|(_, a)| *a == is_async)
                .map(|(n, _)| n.as_str())
                .collect()
        };

        assert_eq!(names(true), ASYNC_COMMANDS, "async commands changed");
        assert_eq!(names(false), SYNC_COMMANDS, "sync commands changed");
    }
}
