import { isTauri } from '@/helpers/get-file-url';
import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  checkForAppUpdate,
  getAppVersion,
  installAppUpdate,
  type TAppUpdateInfo
} from './updater';

export const useAppUpdate = () => {
  const { t } = useTranslation('settings');
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    void getAppVersion().then((appVersion) => {
      if (appVersion) setVersion(appVersion);
    });
  }, []);

  const install = useCallback(
    async (_info: TAppUpdateInfo) => {
      setInstalling(true);

      const toastId = toast.loading(t('appUpdateDownloading', { percent: 0 }));
      let lastPercent = -1;

      try {
        await installAppUpdate((downloaded, total) => {
          const percent = total
            ? Math.min(99, Math.round((downloaded / total) * 100))
            : 0;

          if (percent !== lastPercent) {
            lastPercent = percent;
            toast.loading(t('appUpdateDownloading', { percent }), {
              id: toastId
            });
          }
        });
      } catch {
        setInstalling(false);
        toast.error(t('failedInstallAppUpdate'), { id: toastId });
      }
    },
    [t]
  );

  const promptInstall = useCallback(
    (info: TAppUpdateInfo) => {
      toast(t('appUpdateAvailable', { version: info.version }), {
        duration: 60000,
        action: {
          label: t('appUpdateInstall'),
          onClick: () => void install(info)
        },
        cancel: {
          label: t('appUpdateLater'),
          onClick: () =>
            setLocalStorageItem(
              LocalStorageKey.SKIPPED_APP_UPDATE_VERSION,
              info.version
            )
        }
      });
    },
    [install, t]
  );

  // silent drops every negative outcome (offline, no update, desktop-only
  // API missing): only a real update interrupts the user, unless the check
  // was explicitly requested from settings
  const checkNow = useCallback(
    async (options?: { silent?: boolean; respectSkip?: boolean }) => {
      if (!isTauri() || checking || installing) return;

      const silent = options?.silent ?? false;
      const respectSkip = options?.respectSkip ?? true;

      setChecking(true);

      try {
        const info = await checkForAppUpdate();

        if (!info) {
          if (!silent) toast.success(t('appUpToDate'));
          return;
        }

        if (
          respectSkip &&
          getLocalStorageItem(LocalStorageKey.SKIPPED_APP_UPDATE_VERSION) ===
            info.version
        ) {
          return;
        }

        promptInstall(info);
      } catch {
        if (!silent) toast.error(t('failedCheckAppUpdate'));
      } finally {
        setChecking(false);
      }
    },
    [checking, installing, promptInstall, t]
  );

  return { version, checking, installing, checkNow, promptInstall };
};
