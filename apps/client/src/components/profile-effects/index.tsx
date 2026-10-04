import { ProfileEffect } from '@draevix/shared';
import { memo, type ComponentType } from 'react';
import { GlowParticlesEffect } from './glow-particles';
import { SakuraEffect } from './sakura';
import { SnowEffect } from './snow';
import { SparksEffect } from './sparks';

const PROFILE_EFFECT_RENDERERS: Record<ProfileEffect, ComponentType> = {
  [ProfileEffect.SNOW]: SnowEffect,
  [ProfileEffect.SPARKS]: SparksEffect,
  [ProfileEffect.GLOW_PARTICLES]: GlowParticlesEffect,
  [ProfileEffect.SAKURA]: SakuraEffect
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
