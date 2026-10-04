import { ProfileEffect } from '@draevix/shared';
import { memo, type ComponentType } from 'react';
import { SnowEffect } from './snow';

const PROFILE_EFFECT_RENDERERS: Record<ProfileEffect, ComponentType> = {
  [ProfileEffect.SNOW]: SnowEffect
};

type TProfileEffectOverlayProps = {
  effect: ProfileEffect;
};

// covers the whole card but never intercepts clicks; the parent needs
// relative positioning, rounding is inherited from the card
const ProfileEffectOverlay = memo(({ effect }: TProfileEffectOverlayProps) => {
  const Renderer = PROFILE_EFFECT_RENDERERS[effect];

  if (!Renderer) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <Renderer />
    </div>
  );
});

ProfileEffectOverlay.displayName = 'ProfileEffectOverlay';

export { PROFILE_EFFECT_RENDERERS, ProfileEffectOverlay };
