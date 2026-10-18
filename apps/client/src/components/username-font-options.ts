import { UsernameFont } from '@draevix/shared';

export type TUsernameFontOption = {
  value: UsernameFont;
  // translated label key, or a raw label for proper font names
  labelKey?: string;
  label?: string;
};

// single source for every font picker (admin nickname picker, own bio
// picker): system stacks first, then the bundled families
export const USERNAME_FONT_OPTIONS: TUsernameFontOption[] = [
  { value: UsernameFont.DEFAULT, labelKey: 'usernameFontDefault' },
  { value: UsernameFont.MONO, labelKey: 'usernameFontMono' },
  { value: UsernameFont.SERIF, labelKey: 'usernameFontSerif' },
  { value: UsernameFont.ROUNDED, labelKey: 'usernameFontRounded' },
  { value: UsernameFont.MONTSERRAT, label: 'Montserrat' },
  { value: UsernameFont.RUBIK, label: 'Rubik' },
  { value: UsernameFont.LOBSTER, label: 'Lobster' },
  { value: UsernameFont.PRESS_START_2P, label: 'Press Start 2P' },
  { value: UsernameFont.RUSSO_ONE, label: 'Russo One' },
  { value: UsernameFont.CAVEAT, label: 'Caveat' },
  { value: UsernameFont.EXO_2, label: 'Exo 2' },
  { value: UsernameFont.PLAYFAIR_DISPLAY, label: 'Playfair Display' },
  { value: UsernameFont.INTER, label: 'Inter' },
  { value: UsernameFont.GOLOS_TEXT, label: 'Golos Text' },
  { value: UsernameFont.PT_SERIF, label: 'PT Serif' },
  { value: UsernameFont.JETBRAINS_MONO, label: 'JetBrains Mono' },
  { value: UsernameFont.NUNITO, label: 'Nunito' }
];
