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
  ROUNDED = 'rounded'
}

// system stacks on purpose: zero downloads, identical render on web,
// desktop and any future client
export const USERNAME_FONT_STACKS: Record<UsernameFont, string> = {
  [UsernameFont.DEFAULT]: 'inherit',
  [UsernameFont.MONO]:
    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  [UsernameFont.SERIF]: 'Georgia, "Times New Roman", serif',
  [UsernameFont.ROUNDED]:
    '"Segoe UI Rounded", "SF Rounded", "Hiragino Maru Gothic ProN", Quicksand, "Comfortaa", "Segoe UI", sans-serif'
};
