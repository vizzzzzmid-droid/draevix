#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // webview2 asks for mic/camera on every fresh profile through its own ui and
    // tauri exposes no handler for it, so grant the default devices up front.
    // this only affects our own origin inside the app window.
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--use-fake-ui-for-media-stream",
    );

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running draevix desktop");
}
