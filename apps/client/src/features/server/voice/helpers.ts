import type { TWatchState } from '@draevix/shared';

// the server stamps every control action, so a player estimates where the
// shared position is now instead of freezing on the last announced one
const getWatchPositionSec = (
  watch: TWatchState,
  nowMs: number = Date.now()
): number => {
  if (!watch.playing) return watch.positionSec;

  return watch.positionSec + (nowMs - watch.updatedAt) / 1000;
};

export { getWatchPositionSec };
