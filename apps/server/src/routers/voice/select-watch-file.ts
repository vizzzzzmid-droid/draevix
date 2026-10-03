import { z } from 'zod';
import { publishWatchState } from '../../db/publishers';
import { getFileById } from '../../db/queries/files';
import { getMessageByFileId } from '../../db/queries/messages';
import { assertChannelAccess } from '../../helpers/assert-channel-access';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const selectWatchFileRoute = protectedProcedure
  .input(
    z.object({
      fileId: z.number().int().positive()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

    const file = await getFileById(input.fileId);

    invariant(file, { code: 'NOT_FOUND', message: 'File not found' });
    invariant(file.mimeType.startsWith('video/'), {
      code: 'BAD_REQUEST',
      message: 'Only video files can be watched together'
    });

    // the file has to come from chat the caller can actually see, never trust
    // a bare id. nothing usable leaks either way, the answer stays not found
    const message = await getMessageByFileId(file.id);
    let visible = false;

    if (message?.channelId) {
      try {
        await assertChannelAccess(ctx, message.channelId);
        visible = true;
      } catch {
        // not visible to the caller
      }
    }

    invariant(visible, { code: 'NOT_FOUND', message: 'File not found' });

    const watch = {
      fileId: file.id,
      playing: true,
      positionSec: 0,
      updatedAt: Date.now(),
      controllerUserId: ctx.user.id
    };

    runtime.setWatchState(watch);

    publishWatchState(channelId, watch);
  });

export { selectWatchFileRoute };
