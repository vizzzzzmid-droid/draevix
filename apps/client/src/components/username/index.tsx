import {
  ensureBundledFontLoaded,
  isBundledUsernameFont
} from '@/helpers/bundled-fonts';
import { cn } from '@/lib/utils';
import {
  USERNAME_FONT_STACKS,
  UsernameEffect,
  UsernameFont,
  parseUsernameFont
} from '@draevix/shared';
import type { ReactNode } from 'react';
import { memo, useEffect } from 'react';

const USERNAME_EFFECT_CLASS: Record<UsernameEffect, string> = {
  [UsernameEffect.FIRE]: 'username-effect-fire',
  [UsernameEffect.FROST]: 'username-effect-frost',
  [UsernameEffect.NEON]: 'username-effect-neon',
  [UsernameEffect.RAINBOW]: 'username-effect-rainbow',
  [UsernameEffect.GOLD]: 'username-effect-gold'
};

const asEffect = (effect: string | null | undefined): UsernameEffect | null =>
  effect && (Object.values(UsernameEffect) as string[]).includes(effect)
    ? (effect as UsernameEffect)
    : null;

type TUsernameProps = {
  name: string;
  effect?: string | null;
  font?: string | null;
  className?: string;
};

// fire licks upward with small flame tongues, frost is orbited by falling
// snowflakes: particles are pure css in em units, so they scale with any
// nickname size. counts are fixed per effect, positions come from nth-child
const FIRE_PARTICLES = 6;
const FROST_PARTICLES = 7;

// U+2744 snowflake forced into text presentation by U+FE0E: renders as a
// glyph, never as an emoji
const SNOWFLAKE = '❄︎';

// four-pointed star (U+2726) in text presentation, used for gold glints
const SPARKLE = '✦︎';

// Particle effects (fire/frost/gold) need three layers:
// - outer: flex-row layout (grows via the caller's flex-1, pushes row
//   icons right). Must stay overflow-visible so particles can escape.
// - particle box: shrink-wrapped to the text width (capped at 100%), the
//   positioned ancestor for the particles, so `left: X%` always spreads
//   them over the nickname itself and never over the whole row.
// - text span: the only element that clips (ellipsis), so truncation never
//   touches the particles.
const TRUNCATE_TOKEN = /(^|\s)truncate(\s|$)/;

// styled nickname: admin-assigned effect plus font. unknown values coming
// from the server fall back to plain text, never to an arbitrary class
const Username = memo(({ name, effect, font, className }: TUsernameProps) => {
  const validEffect = asEffect(effect);
  const validFont = parseUsernameFont(font);

  // bundled families ship with the app: kick off their css on first use so
  // every nickname renders identically everywhere, with the stack as fallback
  useEffect(() => {
    if (isBundledUsernameFont(validFont)) {
      ensureBundledFontLoaded(validFont).catch(() => {
        // the fallback stack in USERNAME_FONT_STACKS covers this
      });
    }
  }, [validFont]);
  const fontStyle =
    validFont === UsernameFont.DEFAULT
      ? undefined
      : { fontFamily: USERNAME_FONT_STACKS[validFont] };
  // the caller asked for ellipsis: the inner text span (not the particle
  // box) is the element that actually clips
  const truncate = TRUNCATE_TOKEN.test(className ?? '');
  // `truncate` on the outer would clip escaping particles via its
  // overflow-hidden: layout/size/color classes pass through, truncation
  // is re-applied on the inner text span instead
  const outerClassName = (className ?? '')
    .split(/\s+/)
    .filter((token) => token !== '' && token !== 'truncate')
    .join(' ');

  const text = (
    <span
      className={cn(
        validEffect && USERNAME_EFFECT_CLASS[validEffect],
        truncate && 'block truncate'
      )}
      style={fontStyle}
    >
      {name}
    </span>
  );

  const fxWrapper = (fxClass: string, particles: ReactNode) => (
    <span className={cn('min-w-0', outerClassName)}>
      <span className={cn('username-fx', fxClass, 'max-w-full')}>
        {text}
        {particles}
      </span>
    </span>
  );

  if (validEffect === UsernameEffect.FIRE) {
    return fxWrapper(
      'username-fx-fire',
      Array.from({ length: FIRE_PARTICLES }).map((_, index) => (
        <i key={index} aria-hidden="true" />
      ))
    );
  }

  if (validEffect === UsernameEffect.FROST) {
    return fxWrapper(
      'username-fx-frost',
      Array.from({ length: FROST_PARTICLES }).map((_, index) => (
        <i key={index} aria-hidden="true">
          {SNOWFLAKE}
        </i>
      ))
    );
  }

  if (validEffect === UsernameEffect.GOLD) {
    return fxWrapper(
      'username-fx-gold',
      <>
        <i style={{ left: '8%' }} aria-hidden="true">
          {SPARKLE}
        </i>
        <i style={{ left: '52%', top: '1.1em' }} aria-hidden="true">
          {SPARKLE}
        </i>
        <i style={{ left: '88%' }} aria-hidden="true">
          {SPARKLE}
        </i>
      </>
    );
  }

  return (
    <span
      className={cn(
        validEffect && USERNAME_EFFECT_CLASS[validEffect],
        className
      )}
      style={fontStyle}
    >
      {name}
    </span>
  );
});

Username.displayName = 'Username';

export { Username };
