import { UsernameFont, type TBundledUsernameFont } from '@draevix/shared';

// bundled fontsource families, loaded lazily on first use so nobody pays
// for fonts they never see. every css file covers one subset + weight with
// a unicode-range, so the browser fetches only the glyphs it renders
const bundledFontCss = (font: TBundledUsernameFont): Promise<unknown>[] => {
  switch (font) {
    case UsernameFont.MONTSERRAT:
      return [
        import('@fontsource/montserrat/cyrillic-700.css'),
        import('@fontsource/montserrat/latin-700.css'),
        import('@fontsource/montserrat/cyrillic-800.css'),
        import('@fontsource/montserrat/latin-800.css')
      ];
    case UsernameFont.RUBIK:
      return [
        import('@fontsource/rubik/cyrillic-500.css'),
        import('@fontsource/rubik/latin-500.css'),
        import('@fontsource/rubik/cyrillic-700.css'),
        import('@fontsource/rubik/latin-700.css')
      ];
    case UsernameFont.LOBSTER:
      return [
        import('@fontsource/lobster/cyrillic-400.css'),
        import('@fontsource/lobster/latin-400.css')
      ];
    case UsernameFont.PRESS_START_2P:
      return [
        import('@fontsource/press-start-2p/cyrillic-400.css'),
        import('@fontsource/press-start-2p/latin-400.css')
      ];
    case UsernameFont.RUSSO_ONE:
      return [
        import('@fontsource/russo-one/cyrillic-400.css'),
        import('@fontsource/russo-one/latin-400.css')
      ];
    case UsernameFont.CAVEAT:
      return [
        import('@fontsource/caveat/cyrillic-500.css'),
        import('@fontsource/caveat/latin-500.css'),
        import('@fontsource/caveat/cyrillic-700.css'),
        import('@fontsource/caveat/latin-700.css')
      ];
    case UsernameFont.EXO_2:
      return [
        import('@fontsource/exo-2/cyrillic-700.css'),
        import('@fontsource/exo-2/latin-700.css'),
        import('@fontsource/exo-2/cyrillic-800.css'),
        import('@fontsource/exo-2/latin-800.css')
      ];
    case UsernameFont.PLAYFAIR_DISPLAY:
      return [
        import('@fontsource/playfair-display/cyrillic-700.css'),
        import('@fontsource/playfair-display/latin-700.css'),
        import('@fontsource/playfair-display/cyrillic-800.css'),
        import('@fontsource/playfair-display/latin-800.css')
      ];
    case UsernameFont.INTER:
      return [
        import('@fontsource/inter/cyrillic-400.css'),
        import('@fontsource/inter/latin-400.css'),
        import('@fontsource/inter/cyrillic-500.css'),
        import('@fontsource/inter/latin-500.css'),
        import('@fontsource/inter/cyrillic-700.css'),
        import('@fontsource/inter/latin-700.css')
      ];
    case UsernameFont.GOLOS_TEXT:
      return [
        import('@fontsource/golos-text/cyrillic-400.css'),
        import('@fontsource/golos-text/latin-400.css'),
        import('@fontsource/golos-text/cyrillic-500.css'),
        import('@fontsource/golos-text/latin-500.css'),
        import('@fontsource/golos-text/cyrillic-700.css'),
        import('@fontsource/golos-text/latin-700.css')
      ];
    case UsernameFont.PT_SERIF:
      return [
        import('@fontsource/pt-serif/cyrillic-400.css'),
        import('@fontsource/pt-serif/latin-400.css'),
        import('@fontsource/pt-serif/cyrillic-700.css'),
        import('@fontsource/pt-serif/latin-700.css')
      ];
    case UsernameFont.JETBRAINS_MONO:
      return [
        import('@fontsource/jetbrains-mono/cyrillic-400.css'),
        import('@fontsource/jetbrains-mono/latin-400.css'),
        import('@fontsource/jetbrains-mono/cyrillic-500.css'),
        import('@fontsource/jetbrains-mono/latin-500.css'),
        import('@fontsource/jetbrains-mono/cyrillic-700.css'),
        import('@fontsource/jetbrains-mono/latin-700.css')
      ];
    case UsernameFont.NUNITO:
      return [
        import('@fontsource/nunito/cyrillic-400.css'),
        import('@fontsource/nunito/latin-400.css'),
        import('@fontsource/nunito/cyrillic-700.css'),
        import('@fontsource/nunito/latin-700.css'),
        import('@fontsource/nunito/cyrillic-800.css'),
        import('@fontsource/nunito/latin-800.css')
      ];
    default: {
      const _exhaustive: never = font;

      throw new Error(`Unhandled bundled font: ${_exhaustive}`);
    }
  }
};

const SYSTEM_FONTS: ReadonlySet<UsernameFont> = new Set([
  UsernameFont.DEFAULT,
  UsernameFont.MONO,
  UsernameFont.SERIF,
  UsernameFont.ROUNDED
]);

const isBundledUsernameFont = (
  font: UsernameFont | null | undefined
): font is TBundledUsernameFont => !!font && !SYSTEM_FONTS.has(font);

const loadedFonts = new Set<TBundledUsernameFont>();
const pendingLoads = new Map<TBundledUsernameFont, Promise<void>>();

// idempotent: concurrent callers share one import, failures fall back to the
// stack's system fonts and may be retried on the next render
const ensureBundledFontLoaded = (font: TBundledUsernameFont): Promise<void> => {
  if (loadedFonts.has(font)) return Promise.resolve();

  const pending = pendingLoads.get(font);

  if (pending) return pending;

  const load = Promise.all(bundledFontCss(font))
    .then(() => {
      loadedFonts.add(font);
      pendingLoads.delete(font);
    })
    .catch(() => {
      pendingLoads.delete(font);
    });

  pendingLoads.set(font, load);

  return load;
};

// pickers preload the whole set so every preview renders in its own font
const ensureAllBundledFontsLoaded = (): Promise<void> => {
  const all = Object.values(UsernameFont).filter(isBundledUsernameFont);

  return Promise.all(all.map((font) => ensureBundledFontLoaded(font))).then(
    () => undefined
  );
};

export {
  ensureAllBundledFontsLoaded,
  ensureBundledFontLoaded,
  isBundledUsernameFont
};
