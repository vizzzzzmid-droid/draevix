#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod system_audio;

use system_audio::SystemAudioState;

fn main() {
    // NOTE: do NOT set --use-fake-ui-for-media-stream here. It auto-approves
    // every media request without any UI, which silently breaks screen-share
    // source picking (no monitor/window choice, window capture fails with
    // "Could not start video source"). WebView2 shows its own permission
    // prompt once per profile instead, then remembers the grant.
    tauri::Builder::default()
        .manage(SystemAudioState::default())
        .invoke_handler(tauri::generate_handler![
            system_audio::system_audio_start,
            system_audio::system_audio_poll,
            system_audio::system_audio_stop,
            system_audio::system_audio_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running draevix desktop");
}
