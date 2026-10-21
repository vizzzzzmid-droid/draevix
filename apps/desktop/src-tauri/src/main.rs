#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod system_audio;

use system_audio::SystemAudioState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent
};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    // NOTE: do NOT set --use-fake-ui-for-media-stream here. It auto-approves
    // every media request without any UI, which silently breaks screen-share
    // source picking (no monitor/window choice, window capture fails with
    // "Could not start video source"). WebView2 shows its own permission
    // prompt once per profile instead, then remembers the grant.
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(SystemAudioState::default())
        .invoke_handler(tauri::generate_handler![
            system_audio::system_audio_start,
            system_audio::system_audio_poll,
            system_audio::system_audio_stop,
            system_audio::system_audio_info
        ])
        .setup(|app| {
            let open_item = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            TrayIconBuilder::new()
                .tooltip("Draevix")
                .icon(
                    app.default_window_icon()
                        .expect("missing default window icon")
                        .clone()
                )
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // the tray keeps voice calls alive, so closing only hides the window
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running draevix desktop");
}
