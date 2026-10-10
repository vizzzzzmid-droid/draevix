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

// styled nickname: admin-assigned effect plus font. unknown values coming
// from the server fall back to plain text, never to an arbitrary class
const Username = memo(({ name, effect, font, className }: TUsernameProps) => {
  const validEffect = asEffect(effect);
  const validFont = asFont(font);

  return (
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
});

Username.displayName = 'Username';

export { Username };
