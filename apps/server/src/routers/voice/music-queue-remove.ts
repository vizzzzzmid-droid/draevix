import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicQueueRemoveRoute = protectedProcedure
  .input(
    z.object({
      index: z.number().int().min(0).max(499)
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
    const current = runtime.getMusicState();

    invariant(current, {
      code: 'NOT_FOUND',
      message: 'No active listening party'
    });

    invariant(input.index < current.queue.length, {
      code: 'NOT_FOUND',
      message: 'Queue entry not found'
    });

    const music = {
      ...current,
      queue: current.queue.filter((_, i) => i !== input.index)
    };

    runtime.setMusicState(music);

    publishMusicState(channelId, music);
  });

export { musicQueueRemoveRoute };
