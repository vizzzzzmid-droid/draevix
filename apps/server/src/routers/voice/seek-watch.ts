import { z } from 'zod';
import { publishWatchState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const seekWatchRoute = protectedProcedure
  .input(
    z.object({
      positionSec: z.number().min(0).max(86400)
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

    const current = runtime.getWatchState();

    invariant(current, {
      code: 'NOT_FOUND',
      message: 'No active watch party'
    });

    const watch = {
      ...current,
      positionSec: input.positionSec,
      updatedAt: Date.now(),
      controllerUserId: ctx.user.id
    };

    runtime.setWatchState(watch);

    publishWatchState(channelId, watch);
  });

export { seekWatchRoute };
