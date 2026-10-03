import type { TWatchState } from '@draevix/shared';

// the server stamps every control action, so a player estimates where the
// shared position is now instead of freezing on the last announced one
const getWatchPositionSec = (
  watch: TWatchState,
  nowMs: number = Date.now()
): number => {
  if (!watch.playing) return watch.positionSec;

  // server and client clocks can disagree by a little (or the stamp can be
  // fresher than our receipt), never extrapolate backwards from the future
  const elapsedSec = Math.max(0, (nowMs - watch.updatedAt) / 1000);

  return watch.positionSec + elapsedSec;
};

export { getWatchPositionSec };
