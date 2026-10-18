import { publishMusicState } from '../db/publishers';
import type { VoiceRuntime } from '../runtimes/voice';
import { AudiusError } from './audius';
import { resolvePlayableTrack } from './music';
import { SoundCloudError } from './soundcloud';

// upstream per-track failures (removed, geo-blocked, dead link): the track
// itself is broken, so drop it and try the rest instead of erroring forever
// on the same entry. UPSTREAM blips still surface as errors
const isDeadTrackError = (error: unknown): boolean =>
  (error instanceof SoundCloudError || error instanceof AudiusError) &&
  (error.kind === 'NOT_FOUND' || error.kind === 'UNAVAILABLE');

type TAdvanceMusicArgs = {
  runtime: VoiceRuntime;
  channelId: number;
  actorUserId: number;
  expectTrackId: number | undefined;
  // the current track itself failed to resolve (refresh path): never try
  // to replay or wrap onto it, go straight for the queue
  skipCurrent: boolean;
  // jump-to-track advances in strict queue order: shuffling would scatter
  // the target, so the jump bypasses the random rotation
  ignoreShuffle?: boolean;
};

// moves the party past the current track (ended or dead). must be called
// while holding runMusicExclusive: resolving takes a network round trip,
// so the expect guard is re-checked on fresh state before every write,
// otherwise this overwrites whoever moved on meanwhile
const advanceMusicLocked = async ({
  runtime,
  channelId,
  actorUserId,
  expectTrackId,
  skipCurrent,
  ignoreShuffle = false
}: TAdvanceMusicArgs): Promise<void> => {
  const current = runtime.getMusicState();

  if (!current?.current) return;

  if (
    expectTrackId !== undefined &&
    current.current.trackId !== expectTrackId
  ) {
    return;
  }

  const stillExpected = (): boolean => {
    if (expectTrackId === undefined) return true;

    return runtime.getMusicState()?.current?.trackId === expectTrackId;
  };

  const commit = (
    playable: Awaited<ReturnType<typeof resolvePlayableTrack>>,
    addedByUserId: number | null,
    queue: typeof current.queue
  ): void => {
    if (!stillExpected()) return;

    const music = {
      ...current,
      current: { ...playable, addedByUserId },
      queue,
      playing: true,
      positionSec: 0,
      updatedAt: Date.now(),
      controllerUserId: actorUserId
    };

    runtime.setMusicState(music);

    publishMusicState(channelId, music);
  };

  // repeat-one replays the current track; a dead one falls through and the
  // queue advances instead of looping the same error forever
  if (!skipCurrent && current.repeatMode === 'one') {
    try {
      const playable = await resolvePlayableTrack(current.current);

      commit(playable, current.current.addedByUserId, current.queue);

      return;
    } catch (error) {
      if (!isDeadTrackError(error)) throw error;
    }
  }

  let pending = [...current.queue];

  if (current.shuffle && !ignoreShuffle && pending.length > 1) {
    const pick = Math.floor(Math.random() * pending.length);

    pending = [...pending.slice(pick), ...pending.slice(0, pick)];
  }

  // repeat-all rotates the queue instead of consuming it: the finished
  // track goes to the back, so the whole cycle repeats instead of just
  // the last track. the refresh path (skipCurrent) keeps consuming, a
  // dead current must never circle back into the queue
  const rotate = !skipCurrent && current.repeatMode === 'all';

  // a queued track can die between queueing and playing: drop dead entries
  // and keep advancing until something playable is left
  while (pending.length > 0) {
    const next = pending[0];
    if (!next) break;
    const rest = pending.slice(1);

    try {
      const playable = await resolvePlayableTrack(next);

      commit(
        playable,
        next.addedByUserId,
        rotate && current.current ? [...rest, current.current] : rest
      );

      return;
    } catch (error) {
      if (!isDeadTrackError(error)) throw error;
      if (!stillExpected()) return;

      pending = rest;
    }
  }

  // queue exhausted (or every queued track was dead): repeat-all wraps back
  // onto a live current track, otherwise the party stops
  if (!skipCurrent && current.repeatMode === 'all') {
    try {
      const playable = await resolvePlayableTrack(current.current);

      commit(playable, current.current.addedByUserId, pending);

      return;
    } catch (error) {
      if (!isDeadTrackError(error)) throw error;
    }
  }

  if (!stillExpected()) return;

  runtime.clearMusicState();

  publishMusicState(channelId, undefined);
};

export { advanceMusicLocked, isDeadTrackError };
