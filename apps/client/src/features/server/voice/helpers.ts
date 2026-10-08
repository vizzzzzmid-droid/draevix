import type { TMusicState, TWatchState } from '@draevix/shared';

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

const getMusicPositionSec = (
  music: TMusicState,
  nowMs: number = Date.now()
): number => {
  if (!music.playing) return music.positionSec;

  const elapsedSec = Math.max(0, (nowMs - music.updatedAt) / 1000);

  return music.positionSec + elapsedSec;
};

const formatMediaPosition = (totalSec: number): string => {
  const sec = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(sec / 60);
  const rest = sec % 60;

  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

export { formatMediaPosition, getMusicPositionSec, getWatchPositionSec };
