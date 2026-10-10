import { cn } from '@/lib/utils';
import {
  USERNAME_FONT_STACKS,
  UsernameEffect,
  UsernameFont
} from '@draevix/shared';
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

// styled nickname: admin-assigned effect plus font. unknown values coming
// from the server fall back to plain text, never to an arbitrary class
const Username = memo(({ name, effect, font, className }: TUsernameProps) => {
  const validEffect = asEffect(effect);
  const validFont = asFont(font);

  const text = (
    <span
      className={cn(
        validEffect && USERNAME_EFFECT_CLASS[validEffect],
        className
      )}
      style={
        validFont === UsernameFont.DEFAULT
          ? undefined
          : { fontFamily: USERNAME_FONT_STACKS[validFont] }
      }
    >
      {name}
    </span>
  );

  if (validEffect === UsernameEffect.FIRE) {
    return (
      <span className="username-fx username-fx-fire">
        {text}
        {Array.from({ length: FIRE_PARTICLES }).map((_, index) => (
          <i key={index} aria-hidden="true" />
        ))}
      </span>
    );
  }

  if (validEffect === UsernameEffect.FROST) {
    return (
      <span className="username-fx username-fx-frost">
        {text}
        {Array.from({ length: FROST_PARTICLES }).map((_, index) => (
          <i key={index} aria-hidden="true">
            {SNOWFLAKE}
          </i>
        ))}
      </span>
    );
  }

  if (validEffect === UsernameEffect.GOLD) {
    return (
      <span className="username-fx username-fx-gold">
        {text}
        <i style={{ left: '8%' }} aria-hidden="true">
          {SPARKLE}
        </i>
        <i style={{ left: '52%', top: '1.1em' }} aria-hidden="true">
          {SPARKLE}
        </i>
        <i style={{ left: '88%' }} aria-hidden="true">
          {SPARKLE}
        </i>
      </span>
    );
  }

  return text;
});

Username.displayName = 'Username';

export { Username };
