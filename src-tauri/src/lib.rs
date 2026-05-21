use serde::Serialize;

#[derive(Serialize)]
struct ShellOutput {
    stdout: String,
    stderr: String,
    code: i32,
}

#[tauri::command]
fn run_shell(command: String, cwd: String) -> Result<ShellOutput, String> {
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&command)
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(ShellOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code().unwrap_or(-1),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![run_shell])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
