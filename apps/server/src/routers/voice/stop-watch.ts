import { publishWatchState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const stopWatchRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

  invariant(runtime.getWatchState(), {
    code: 'NOT_FOUND',
    message: 'No active watch party'
  });

  runtime.clearWatchState();

  publishWatchState(channelId, undefined);
});

export { stopWatchRoute };
