import { isTauri } from '@/helpers/get-file-url';
import { memo, useEffect, useRef } from 'react';
import { useAppUpdate } from './use-app-update';

const AUTO_CHECK_DELAY_MS = 15000;

// Silent update check shortly after launch, desktop app only. Only an
// actually available update produces UI; everything else stays quiet.
const AppUpdater = memo(() => {
  const { checkNow } = useAppUpdate();
  const checkRef = useRef(checkNow);

  checkRef.current = checkNow;

  useEffect(() => {
    if (!isTauri()) return;

    const timer = window.setTimeout(() => {
      void checkRef.current({ silent: true, respectSkip: true });
    }, AUTO_CHECK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
});

AppUpdater.displayName = 'AppUpdater';

export { AppUpdater };
