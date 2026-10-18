// Visual styles an admin can attach to a user's nickname.
// Mirrors statics/profile-effects.ts: adding a new effect is extend the enum,
// add the renderer (a css class on the client), done. Stored as plain text on
// the user row, null means no effect / default font.
export enum UsernameEffect {
  FIRE = 'fire',
  FROST = 'frost',
  NEON = 'neon',
  RAINBOW = 'rainbow',
  GOLD = 'gold'
}

export enum UsernameFont {
  DEFAULT = 'default',
  MONO = 'mono',
  SERIF = 'serif',
  ROUNDED = 'rounded',
  MONTSERRAT = 'montserrat',
  RUBIK = 'rubik',
  LOBSTER = 'lobster',
  PRESS_START_2P = 'press-start-2p',
  RUSSO_ONE = 'russo-one',
  CAVEAT = 'caveat',
  EXO_2 = 'exo-2',
  PLAYFAIR_DISPLAY = 'playfair-display',
  INTER = 'inter',
  GOLOS_TEXT = 'golos-text',
  PT_SERIF = 'pt-serif',
  JETBRAINS_MONO = 'jetbrains-mono',
  NUNITO = 'nunito'
}

// system stacks on purpose: zero downloads, identical render on web,
// desktop and any future client
export const USERNAME_FONT_STACKS: Record<UsernameFont, string> = {
  [UsernameFont.DEFAULT]: 'inherit',
  [UsernameFont.MONO]:
    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  [UsernameFont.SERIF]: 'Georgia, "Times New Roman", serif',
  [UsernameFont.ROUNDED]:
    '"Segoe UI Rounded", "SF Rounded", "Hiragino Maru Gothic ProN", Quicksand, "Comfortaa", "Segoe UI", sans-serif',
  // bundled fontsource families below: the client lazy-loads their css on
  // first use, the stacks stay readable when a font is missing or blocked
  [UsernameFont.MONTSERRAT]: 'Montserrat, Verdana, sans-serif',
  [UsernameFont.RUBIK]: 'Rubik, Verdana, sans-serif',
  [UsernameFont.LOBSTER]: 'Lobster, "Comic Sans MS", cursive',
  [UsernameFont.PRESS_START_2P]: '"Press Start 2P", monospace',
  [UsernameFont.RUSSO_ONE]: '"Russo One", "Arial Black", sans-serif',
  [UsernameFont.CAVEAT]: 'Caveat, cursive',
  [UsernameFont.EXO_2]: '"Exo 2", Verdana, sans-serif',
  [UsernameFont.PLAYFAIR_DISPLAY]: '"Playfair Display", Georgia, serif',
  [UsernameFont.INTER]: 'Inter, system-ui, sans-serif',
  [UsernameFont.GOLOS_TEXT]: '"Golos Text", system-ui, sans-serif',
  [UsernameFont.PT_SERIF]: '"PT Serif", Georgia, serif',
  [UsernameFont.JETBRAINS_MONO]: '"JetBrains Mono", Consolas, monospace',
  [UsernameFont.NUNITO]: 'Nunito, Verdana, sans-serif'
};

// everything except the four system stacks ships with the app and needs an
// explicit css import on first use (see ensureBundledFontLoaded client-side)
export type TBundledUsernameFont = Exclude<
  UsernameFont,
  | UsernameFont.DEFAULT
  | UsernameFont.MONO
  | UsernameFont.SERIF
  | UsernameFont.ROUNDED
>;

// unknown values coming from the server fall back to plain text, never to an
// arbitrary class or font stack
const parseUsernameFont = (font: string | null | undefined): UsernameFont =>
  font && (Object.values(UsernameFont) as string[]).includes(font)
    ? (font as UsernameFont)
    : UsernameFont.DEFAULT;

export { parseUsernameFont };
