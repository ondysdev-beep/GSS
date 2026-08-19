use std::fs;
use std::path::{Path, PathBuf};

/// Extensions GSS legitimately reads/writes today (project files + export
/// formats). Rejecting anything else is defense-in-depth: these commands
/// are reachable from any JS `invoke()` call in the webview, not only from
/// the native save/open dialogs that currently apply their own filters —
/// this validates that assumption instead of relying on it (audit R-11).
const ALLOWED_EXTENSIONS: &[&str] = &["gss", "json", "csv", "cs", "gd", "ts"];

fn validate_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Empty file path.".to_string());
    }
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext {
        Some(e) if ALLOWED_EXTENSIONS.contains(&e.as_str()) => Ok(()),
        Some(e) => Err(format!("Unsupported file extension: .{}", e)),
        None => Err("File path has no extension.".to_string()),
    }
}

/// Read a .gss file from disk. Returns file contents as string.
#[tauri::command]
pub async fn open_file(path: String) -> Result<String, String> {
    validate_path(&path)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read '{}': {}", path, e))
}

/// Write content to a file path on disk.
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write '{}': {}", path, e))
}
