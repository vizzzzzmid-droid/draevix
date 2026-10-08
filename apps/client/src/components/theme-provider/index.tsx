import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';
import {
  getPresetTheme,
  isPresetThemeId,
  PRESET_THEME_VAR_KEYS,
  type TPresetThemeId
} from '@/helpers/themes';
import { useCallback, useEffect, useState } from 'react';
import { ThemeProviderContext, type Theme } from './theme-context';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: LocalStorageKey;
};

const applyTheme = (theme: Theme) => {
  const root = window.document.documentElement;

  root.classList.remove('light', 'dark');
  root.removeAttribute('data-theme');

  for (const key of PRESET_THEME_VAR_KEYS) {
    root.style.removeProperty(key);
  }

  if (isPresetThemeId(theme)) {
    // presets are all dark moods: keep the dark class so dark: variants and
    // hardcoded dark surfaces stay consistent, then paint over the variables
    root.classList.add('dark');
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = 'dark';

    const vars = getPresetTheme(theme as TPresetThemeId).vars;

    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    return;
  }

  root.style.colorScheme = '';

  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
      .matches
      ? 'dark'
      : 'light';

    root.classList.add(systemTheme);
    return;
  }

  root.classList.add(theme);
};

function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = LocalStorageKey.VITE_UI_THEME,
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (getLocalStorageItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleSetTheme = useCallback(
    (next: Theme) => {
      setLocalStorageItem(storageKey, next);
      setTheme(next);
    },
    [storageKey]
  );

  const value = {
    theme,
    setTheme: handleSetTheme
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export { ThemeProvider };
export type { Theme };
