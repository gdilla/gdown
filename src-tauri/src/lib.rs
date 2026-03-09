mod commands;

use commands::export::{
    check_pandoc, export_document, export_save_dialog, get_export_config, get_export_formats,
};
use commands::fs::{
    copy_image_to_assets, get_file_modified_time, read_directory_shallow, read_directory_tree,
    read_file, write_file, write_image_to_assets,
};
use commands::session::{load_session_state, save_session_state};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, RunEvent};

/// Supported markdown/text file extensions for file-open events.
const SUPPORTED_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "mdwn", "mdtxt", "txt"];

/// Check if a file path has a supported markdown/text extension.
fn is_supported_file(path: &str) -> bool {
    let path = PathBuf::from(path);
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str()),
        None => false,
    }
}

/// Extract valid file paths from CLI arguments.
fn extract_file_paths_from_args() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            let path = PathBuf::from(&arg);
            let abs_path = if path.is_absolute() {
                path
            } else {
                std::env::current_dir().ok()?.join(&path)
            };
            if abs_path.is_file() && is_supported_file(abs_path.to_str()?) {
                Some(abs_path.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect()
}

/// Extract file paths from macOS open-file URLs.
fn extract_file_paths_from_urls(urls: &[url::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|u| {
            if u.scheme() == "file" {
                u.to_file_path().ok().and_then(|p| {
                    let path_str = p.to_string_lossy().to_string();
                    if p.is_file() && is_supported_file(&path_str) {
                        Some(path_str)
                    } else {
                        None
                    }
                })
            } else {
                None
            }
        })
        .collect()
}

/// Emit file paths to the frontend for opening in tabs.
fn emit_open_files(app_handle: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("open-files", paths);
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app
        .dialog()
        .file()
        .set_title("Open Folder")
        .blocking_pick_folder();
    match folder {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
async fn open_file_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app
        .dialog()
        .file()
        .set_title("Open File")
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd"])
        .add_filter("Text", &["txt", "text", "rst", "org"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    match file {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
async fn save_file_dialog(
    app: tauri::AppHandle,
    default_name: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Save As")
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter("Text", &["txt"])
        .add_filter("All Files", &["*"]);
    if let Some(name) = default_name {
        dialog = dialog.set_file_name(&name);
    }
    let file = dialog.blocking_save_file();
    match file {
        Some(path) => {
            let path_str = path.to_string();
            if !path_str.contains('.') {
                Ok(Some(format!("{}.md", path_str)))
            } else {
                Ok(Some(path_str))
            }
        }
        None => Ok(None),
    }
}

struct PendingOpenFiles(Mutex<Vec<String>>);

#[tauri::command]
fn get_pending_open_files(state: tauri::State<'_, PendingOpenFiles>) -> Vec<String> {
    let mut pending = state.0.lock().unwrap();
    std::mem::take(&mut *pending)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli_file_paths = extract_file_paths_from_args();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpenFiles(Mutex::new(cli_file_paths)))
        .invoke_handler(tauri::generate_handler![
            greet,
            read_directory_tree,
            read_directory_shallow,
            read_file,
            write_file,
            get_file_modified_time,
            open_folder_dialog,
            open_file_dialog,
            save_file_dialog,
            get_pending_open_files,
            save_session_state,
            load_session_state,
            copy_image_to_assets,
            write_image_to_assets,
            check_pandoc,
            get_export_formats,
            get_export_config,
            export_document,
            export_save_dialog,
        ])
        .setup(|app| {
            let new_file = MenuItemBuilder::with_id("new_file", "New")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let open_file = MenuItemBuilder::with_id("open_file", "Open...")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let open_folder = MenuItemBuilder::with_id("open_folder", "Open Folder...")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(app)?;
            let save_file = MenuItemBuilder::with_id("save_file", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let save_as = MenuItemBuilder::with_id("save_as", "Save As...")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let export_item = MenuItemBuilder::with_id("export", "Export...")
                .accelerator("CmdOrCtrl+Shift+E")
                .build(app)?;
            let toggle_sidebar = MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar")
                .accelerator("CmdOrCtrl+\\")
                .build(app)?;
            let close_tab = MenuItemBuilder::with_id("close_tab", "Close Tab")
                .accelerator("CmdOrCtrl+W")
                .build(app)?;
            let toggle_source_mode =
                MenuItemBuilder::with_id("toggle_source_mode", "Source Code Mode")
                    .accelerator("CmdOrCtrl+/")
                    .build(app)?;
            let toggle_outline =
                MenuItemBuilder::with_id("toggle_outline", "Outline")
                    .accelerator("CmdOrCtrl+Shift+1")
                    .build(app)?;
            let toggle_focus_mode = MenuItemBuilder::with_id("toggle_focus_mode", "Focus Mode")
                .accelerator("F8")
                .build(app)?;
            let toggle_typewriter_mode =
                MenuItemBuilder::with_id("toggle_typewriter_mode", "Typewriter Mode")
                    .accelerator("F9")
                    .build(app)?;
            let next_tab = MenuItemBuilder::with_id("next_tab", "Next Tab")
                .accelerator("CmdOrCtrl+Shift+]")
                .build(app)?;
            let prev_tab = MenuItemBuilder::with_id("prev_tab", "Previous Tab")
                .accelerator("CmdOrCtrl+Shift+[")
                .build(app)?;
            let open_preferences = MenuItemBuilder::with_id("open_preferences", "Preferences...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;
            let clear_recent = MenuItemBuilder::with_id("clear_recent", "Clear Recent Files")
                .build(app)?;

            let open_recent_menu = SubmenuBuilder::new(app, "Open Recent")
                .item(&clear_recent)
                .build()?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_file)
                .item(&open_file)
                .item(&open_folder)
                .item(&open_recent_menu)
                .separator()
                .item(&close_tab)
                .separator()
                .item(&save_file)
                .item(&save_as)
                .separator()
                .item(&export_item)
                .separator()
                .quit()
                .build()?;

            let theme_light = CheckMenuItemBuilder::with_id("theme-light", "Light").build(app)?;
            let theme_dark = CheckMenuItemBuilder::with_id("theme-dark", "Dark").build(app)?;
            let theme_system = CheckMenuItemBuilder::with_id("theme-system", "System (Auto)").build(app)?;
            let theme_solarized_light = CheckMenuItemBuilder::with_id("theme-solarized-light", "Solarized Light").build(app)?;
            let theme_solarized_dark = CheckMenuItemBuilder::with_id("theme-solarized-dark", "Solarized Dark").build(app)?;
            let theme_github = CheckMenuItemBuilder::with_id("theme-github", "GitHub").build(app)?;

            let themes_menu = SubmenuBuilder::new(app, "Themes")
                .item(&theme_light)
                .item(&theme_dark)
                .item(&theme_system)
                .separator()
                .item(&theme_solarized_light)
                .item(&theme_solarized_dark)
                .item(&theme_github)
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&toggle_source_mode)
                .separator()
                .item(&toggle_sidebar)
                .item(&toggle_outline)
                .separator()
                .item(&toggle_focus_mode)
                .item(&toggle_typewriter_mode)
                .separator()
                .item(&next_tab)
                .item(&prev_tab)
                .separator()
                .fullscreen()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            // App menu (macOS standard: first menu = app name)
            let app_menu = SubmenuBuilder::new(app, "gdown")
                .about(None)
                .separator()
                .item(&open_preferences)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&themes_menu)
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                let id = event.id().0.as_str();
                match id {
                    "new_file" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-new-file", ());
                        }
                    }
                    "open_file" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-open-file", ());
                        }
                    }
                    "open_folder" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-open-folder", ());
                        }
                    }
                    "save_file" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-save-file", ());
                        }
                    }
                    "save_as" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-save-as", ());
                        }
                    }
                    "export" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-export", ());
                        }
                    }
                    "close_tab" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-close-tab", ());
                        }
                    }
                    "toggle_sidebar" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-toggle-sidebar", ());
                        }
                    }
                    "toggle_source_mode" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-toggle-source-mode", ());
                        }
                    }
                    "toggle_outline" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-toggle-outline", ());
                        }
                    }
                    "toggle_focus_mode" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-toggle-focus-mode", ());
                        }
                    }
                    "toggle_typewriter_mode" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-toggle-typewriter-mode", ());
                        }
                    }
                    "next_tab" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-next-tab", ());
                        }
                    }
                    "prev_tab" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-prev-tab", ());
                        }
                    }
                    "open_preferences" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-open-preferences", ());
                        }
                    }
                    "clear_recent" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-clear-recent", ());
                        }
                    }
                    id if id.starts_with("theme-") => {
                        let theme = id.strip_prefix("theme-").unwrap_or("light");
                        let theme_value = match theme {
                            "system" => "auto",
                            other => other,
                        };
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-set-theme", theme_value);
                        }
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Opened { urls } = &event {
            let paths = extract_file_paths_from_urls(urls);
            if !paths.is_empty() {
                emit_open_files(app_handle, paths.clone());
                if let Some(state) = app_handle.try_state::<PendingOpenFiles>() {
                    let mut pending = state.0.lock().unwrap();
                    pending.extend(paths);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_supported_file() {
        assert!(is_supported_file("/path/to/file.md"));
        assert!(is_supported_file("/path/to/file.markdown"));
        assert!(is_supported_file("/path/to/file.mdown"));
        assert!(is_supported_file("/path/to/file.mkd"));
        assert!(is_supported_file("/path/to/file.mdwn"));
        assert!(is_supported_file("/path/to/file.mdtxt"));
        assert!(is_supported_file("/path/to/file.txt"));
        assert!(is_supported_file("/path/to/file.MD"));
        assert!(is_supported_file("/path/to/file.Markdown"));
        assert!(!is_supported_file("/path/to/file.rs"));
        assert!(!is_supported_file("/path/to/file.html"));
        assert!(!is_supported_file("/path/to/file.pdf"));
        assert!(!is_supported_file("/path/to/file"));
    }

    #[test]
    fn test_extract_file_paths_from_urls_non_file_scheme() {
        let url = url::Url::parse("https://example.com/test.md").unwrap();
        let paths = extract_file_paths_from_urls(&[url]);
        assert!(paths.is_empty());
    }
}
