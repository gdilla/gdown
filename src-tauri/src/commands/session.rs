use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const SESSION_FILE_NAME: &str = "session.json";

/// Resolve the path to the session file in the Tauri app data directory.
/// Creates the directory if it doesn't exist.
fn session_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;

    // Ensure directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| {
            format!(
                "Failed to create app data directory '{}': {}",
                app_data_dir.display(),
                e
            )
        })?;
    }

    Ok(app_data_dir.join(SESSION_FILE_NAME))
}

/// Tauri command: Save session state as a JSON string to the app data directory.
///
/// The frontend serializes the session data (open tabs, active tab index,
/// sidebar folder path, scroll positions) into a JSON string and passes it here.
/// We write it atomically to prevent data loss on crash.
#[tauri::command(async)]
pub fn save_session_state(app: tauri::AppHandle, state: String) -> Result<(), String> {
    let file_path = session_file_path(&app)?;

    super::fs::atomic_write(&file_path, state.as_bytes()).map(|_| ())
}

/// Tauri command: Load session state from the app data directory.
///
/// Returns the raw JSON string, or null if no session file exists.
/// The frontend is responsible for parsing and validating the data.
#[tauri::command(async)]
pub fn load_session_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file_path = session_file_path(&app)?;

    if !file_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&file_path).map_err(|e| {
        format!(
            "Failed to read session file '{}': {}",
            file_path.display(),
            e
        )
    })?;

    // Return None for empty files
    if content.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(content))
}

#[cfg(test)]
mod tests {
    // Session commands require a Tauri AppHandle, so integration-level testing
    // is more appropriate. The logic is straightforward file I/O that is
    // covered by the atomic write pattern already tested in fs.rs.
}
