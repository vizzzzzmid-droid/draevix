import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import {
  resolvePlayableTrack,
  throwSoundCloudError
} from '../../helpers/soundcloud';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

// stream urls are signed and short-lived: a stale player re-resolves the
// current track without moving the shared position or stealing control
const musicRefreshRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
  const current = runtime.getMusicState();

  invariant(current?.current, {
    code: 'NOT_FOUND',
    message: 'No active listening party'
  });

  try {
    const playable = await resolvePlayableTrack(current.current);

    const music = {
      ...current,
      current: { ...current.current, mp3Url: playable.mp3Url }
    };

    runtime.setMusicState(music);

    publishMusicState(channelId, music);
  } catch (error) {
    throw throwSoundCloudError(error);
  }
});

export { musicRefreshRoute };
