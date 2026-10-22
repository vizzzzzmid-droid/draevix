import { StreamKind } from '@draevix/shared';
import { z } from 'zod';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { protectedProcedure } from '../../utils/trpc';

const closeConsumerRoute = protectedProcedure
  .input(
    z.object({
      remoteId: z.number(),
      kind: z.enum([StreamKind.SCREEN, StreamKind.SCREEN_AUDIO]),
      consumerId: z.string().optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime } = await getCurrentVoiceRuntime(ctx);

    runtime.closeConsumer(
      ctx.user.id,
      input.remoteId,
      input.kind,
      input.consumerId
    );
  });

export { closeConsumerRoute };
