import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import {
  resolvePlayableTrack,
  throwSoundCloudError
} from '../../helpers/soundcloud';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

// every listener fires this when their player ends: the expect guard makes
// the race harmless, only the first one actually advances the party
const musicNextRoute = protectedProcedure
  .input(
    z.object({
      expectTrackId: z.number().int().positive().optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
    const current = runtime.getMusicState();

    invariant(current?.current, {
      code: 'NOT_FOUND',
      message: 'No active listening party'
    });

    if (
      input.expectTrackId !== undefined &&
      current.current.trackId !== input.expectTrackId
    ) {
      return;
    }

    const [next, ...rest] = current.queue;

    try {
      if (!next) {
        runtime.clearMusicState();

        publishMusicState(channelId, undefined);

        return;
      }

      const playable = await resolvePlayableTrack(next);

      const music = {
        current: playable,
        queue: rest,
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

export { musicNextRoute };
