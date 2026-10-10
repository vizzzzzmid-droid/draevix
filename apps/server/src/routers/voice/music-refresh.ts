import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { resolvePlayableTrack, throwMusicError } from '../../helpers/music';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

// stream urls are signed and short-lived: a stale player re-resolves the
// current track without moving the shared position or stealing control
const musicRefreshRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

  return await runtime.runMusicExclusive(async () => {
    const current = runtime.getMusicState();

    invariant(current?.current, {
      code: 'NOT_FOUND',
      message: 'No active listening party'
    });

    const refreshing = current.current;

    try {
      const playable = await resolvePlayableTrack(refreshing);

      // the party may have moved on (or stopped) while resolving: never
      // write a fresh url onto a different track or resurrect a stopped one
      const fresh = runtime.getMusicState();

      if (fresh?.current?.trackId !== refreshing.trackId) return;

      const music = {
        ...current,
        current: { ...current.current, mp3Url: playable.mp3Url }
      };

      runtime.setMusicState(music);

      publishMusicState(channelId, music);
    } catch (error) {
      throw throwMusicError(error);
    }
  });
});

export { musicRefreshRoute };
