import { isTauri } from '@/helpers/get-file-url';

export type TAppUpdateInfo = {
  version: string;
  notes?: string | null;
  date?: string | null;
};

// Everything here is Tauri-only and dynamically imported, so the browser
// bundle and unit tests never touch the updater plugin.
const isUpdaterAvailable = (): boolean => isTauri();

export const getAppVersion = async (): Promise<string | null> => {
  if (!isUpdaterAvailable()) return null;

  try {
    const { getVersion } = await import('@tauri-apps/api/app');

    return await getVersion();
  } catch {
    return null;
  }
};

export const checkForAppUpdate = async (): Promise<TAppUpdateInfo | null> => {
  if (!isUpdaterAvailable()) return null;

  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();

  if (!update) return null;

  return { version: update.version, notes: update.body, date: update.date };
};

export const installAppUpdate = async (
  onProgress?: (downloaded: number, total?: number) => void
): Promise<void> => {
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();

  if (!update) return;

  let downloaded = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? undefined;
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress?.(downloaded, total);
    }
  });

  const { relaunch } = await import('@tauri-apps/plugin-process');

  await relaunch();
};
