#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod system_audio;

use system_audio::SystemAudioState;

fn main() {
    // webview2 asks for mic/camera on every fresh profile through its own ui and
    // tauri exposes no handler for it, so grant the default devices up front.
    // this only affects our own origin inside the app window.
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--use-fake-ui-for-media-stream",
    );

    tauri::Builder::default()
        .manage(SystemAudioState::default())
        .invoke_handler(tauri::generate_handler![
            system_audio::system_audio_start,
            system_audio::system_audio_poll,
            system_audio::system_audio_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running draevix desktop");
}
