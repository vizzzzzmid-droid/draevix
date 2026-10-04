import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from './get-file-url';

// Tracks whether WE minimized the window for a share, so stopping the share
// never restores a window the user minimized themselves.
let minimizedByShare = false;

const minimizeAppWindowForShare = async (): Promise<void> => {
  if (!isTauri() || minimizedByShare) return;

  try {
    const win = getCurrentWindow();

    if (await win.isMinimized()) return;

    await win.minimize();
    minimizedByShare = true;
  } catch {
    // window controls are best effort: sharing must survive them failing
  }
};

const restoreAppWindowAfterShare = async (): Promise<void> => {
  if (!minimizedByShare) return;
  minimizedByShare = false;

  if (!isTauri()) return;

  try {
    await getCurrentWindow().unminimize();
  } catch {
    // ignore, same as above
  }
};

export { minimizeAppWindowForShare, restoreAppWindowAfterShare };
