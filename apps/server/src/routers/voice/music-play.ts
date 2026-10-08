import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import {
  resolvePlayableTrack,
  throwSoundCloudError,
  zTrackInput
} from '../../helpers/soundcloud';
import { protectedProcedure } from '../../utils/trpc';

const musicPlayRoute = protectedProcedure
  .input(
    z.object({
      track: zTrackInput
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

    try {
      const current = await resolvePlayableTrack(input.track);
      const previous = runtime.getMusicState();

      const music = {
        current,
        queue: previous?.queue ?? [],
        playing: true,
        positionSec: 0,
        updatedAt: Date.now(),
        controllerUserId: ctx.user.id
      };

      runtime.setMusicState(music);

      publishMusicState(channelId, music);
    } catch (error) {
      throw throwSoundCloudError(error);
    }
  });

export { musicPlayRoute };
