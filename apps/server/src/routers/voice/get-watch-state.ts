import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { protectedProcedure } from '../../utils/trpc';

const getWatchStateRoute = protectedProcedure.query(async ({ ctx }) => {
  const { runtime } = await getCurrentVoiceRuntime(ctx);

  return { watch: runtime.getWatchState() };
});

export { getWatchStateRoute };
