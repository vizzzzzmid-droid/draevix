// Visual effects an admin can attach to a user's profile card.
// The registry on the client maps each member to its renderer, so adding a
// new effect is: extend this enum, add the renderer, done. Stored as plain
// text on the user row, null means no effect.
export enum ProfileEffect {
  SNOW = 'snow',
  SPARKS = 'sparks',
  GLOW_PARTICLES = 'glow-particles',
  SAKURA = 'sakura'
}
