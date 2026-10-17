import { cn } from '@/lib/utils';
import {
  USERNAME_FONT_STACKS,
  UsernameEffect,
  UsernameFont
} from '@draevix/shared';
import type { ReactNode } from 'react';
import { memo } from 'react';

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

const asFont = (font: string | null | undefined): UsernameFont =>
  font && (Object.values(UsernameFont) as string[]).includes(font)
    ? (font as UsernameFont)
    : UsernameFont.DEFAULT;

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

// Particle effects (fire/frost/gold) need a positioned wrapper around the
// text. Layout classes from the caller (flex-1, text size/color) belong on
// that wrapper so flex rows keep working — but the wrapper must stay
// overflow-visible, because embers and snowflakes intentionally fly outside
// its box. Text truncation therefore moves to the inner text span, which
// otherwise inherits everything normally.
const TRUNCATE_TOKEN = /(^|\s)truncate(\s|$)/;

// styled nickname: admin-assigned effect plus font. unknown values coming
// from the server fall back to plain text, never to an arbitrary class
const Username = memo(({ name, effect, font, className }: TUsernameProps) => {
  const validEffect = asEffect(effect);
  const validFont = asFont(font);
  const fontStyle =
    validFont === UsernameFont.DEFAULT
      ? undefined
      : { fontFamily: USERNAME_FONT_STACKS[validFont] };
  // the caller asked for ellipsis: the inner text span (not the particle
  // wrapper) is the element that actually clips
  const truncate = TRUNCATE_TOKEN.test(className ?? '');

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
    <span
      className={cn('username-fx', fxClass, 'min-w-0', className)}
      style={{ overflow: 'visible' }}
    >
      {text}
      {particles}
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
