import { isTauri } from './get-file-url';

// OS-level notification, returns true when one was actually shown.
// on desktop the tauri plugin posts a native toast and needs no browser
// permission (which, once denied, can never be re-requested). everywhere
// else falls back to the Web Notification API when permission is granted.
const sendSystemNotification = async (
  title: string,
  body: string,
  icon?: string
): Promise<boolean> => {
  if (isTauri()) {
    try {
      const {
        sendNotification,
        isPermissionGranted,
        requestPermission
      } = await import('@tauri-apps/plugin-notification');

      let granted = await isPermissionGranted();

      if (!granted) {
        granted = (await requestPermission()) === 'granted';
      }

      if (granted) {
        sendNotification({ title, body });
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon });
    return true;
  }

  return false;
};

export { sendSystemNotification };
