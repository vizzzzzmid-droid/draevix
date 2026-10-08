import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { protectedProcedure } from '../../utils/trpc';

const getMusicStateRoute = protectedProcedure.query(async ({ ctx }) => {
  const { runtime } = await getCurrentVoiceRuntime(ctx);

  return { music: runtime.getMusicState() };
});

export { getMusicStateRoute };
