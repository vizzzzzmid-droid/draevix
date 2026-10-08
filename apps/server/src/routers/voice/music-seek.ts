import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicSeekRoute = protectedProcedure
  .input(
    z.object({
      positionSec: z.number().min(0).max(86400)
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
    const current = runtime.getMusicState();

    invariant(current?.current, {
      code: 'NOT_FOUND',
      message: 'No active listening party'
    });

    const music = {
      ...current,
      positionSec: input.positionSec,
      updatedAt: Date.now(),
      controllerUserId: ctx.user.id
    };

    runtime.setMusicState(music);

    publishMusicState(channelId, music);
  });

export { musicSeekRoute };
