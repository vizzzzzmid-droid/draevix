import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import {
  resolvePlayableTrack,
  throwMusicError,
  zTrackInput
} from '../../helpers/music';
import { protectedProcedure } from '../../utils/trpc';

const musicPlayRoute = protectedProcedure
  .input(
    z.object({
      track: zTrackInput
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

    return await runtime.runMusicExclusive(async () => {
      try {
        const current = await resolvePlayableTrack(input.track);
        const previous = runtime.getMusicState();

        const music = {
          current: { ...current, addedByUserId: ctx.user.id },
          queue: previous?.queue ?? [],
          playing: true,
          positionSec: 0,
          updatedAt: Date.now(),
          controllerUserId: ctx.user.id,
          repeatMode: previous?.repeatMode ?? ('off' as const),
          shuffle: previous?.shuffle ?? false
        };

        runtime.setMusicState(music);

        publishMusicState(channelId, music);
      } catch (error) {
        throw throwMusicError(error);
      }
    });
  });

export { musicPlayRoute };
