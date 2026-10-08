import type { TPresetThemeId } from '@/helpers/themes';
import { createContext, useContext } from 'react';

type Theme = 'dark' | 'light' | 'system' | TPresetThemeId;

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const useTheme = () => useContext(ThemeProviderContext);

export { initialState, ThemeProviderContext, useTheme };
export type { Theme, ThemeProviderState };
