import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicSetShuffleRoute = protectedProcedure
  .input(
    z.object({
      shuffled: z.boolean()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
    const current = runtime.getMusicState();

    invariant(current, {
      code: 'NOT_FOUND',
      message: 'No active listening party'
    });

    const music = { ...current, shuffle: input.shuffled };

    runtime.setMusicState(music);

    publishMusicState(channelId, music);
  });

export { musicSetShuffleRoute };
