import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicSetRepeatRoute = protectedProcedure
  .input(
    z.object({
      mode: z.enum(['off', 'all', 'one'])
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
    const current = runtime.getMusicState();

    invariant(current, {
      code: 'NOT_FOUND',
      message: 'No active listening party'
    });

    const music = { ...current, repeatMode: input.mode };

    runtime.setMusicState(music);

    publishMusicState(channelId, music);
  });

export { musicSetRepeatRoute };
