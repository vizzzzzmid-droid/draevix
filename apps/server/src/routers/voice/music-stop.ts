import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicStopRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

  invariant(runtime.getMusicState()?.current, {
    code: 'NOT_FOUND',
    message: 'No active listening party'
  });

  runtime.clearMusicState();

  publishMusicState(channelId, undefined);
});

export { musicStopRoute };
