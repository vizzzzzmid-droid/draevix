import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicQueueClearRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
  const current = runtime.getMusicState();

  invariant(current, {
    code: 'NOT_FOUND',
    message: 'No active listening party'
  });

  const music = { ...current, queue: [] };

  runtime.setMusicState(music);

  publishMusicState(channelId, music);
});

export { musicQueueClearRoute };
