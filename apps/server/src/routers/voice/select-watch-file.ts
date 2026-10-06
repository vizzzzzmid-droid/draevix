import { z } from 'zod';
import { publishWatchState } from '../../db/publishers';
import { getFileById } from '../../db/queries/files';
import { isLibraryFile } from '../../db/queries/library';
import { getMessageByFileId } from '../../db/queries/messages';
import { getSettings } from '../../db/queries/server';
import { assertChannelAccess } from '../../helpers/assert-channel-access';
import { signFile } from '../../helpers/files-crypto';
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

    // the file has to come from chat the caller can actually see, be their own
    // upload, or sit in the server video library. never trust a bare id,
    // nothing usable leaks either way
    const message = await getMessageByFileId(file.id);
    let visible = file.userId !== null && file.userId === ctx.user.id;

    if (!visible && (await isLibraryFile(file.id))) {
      visible = true;
    }

    if (!visible && message?.channelId) {
      try {
        await assertChannelAccess(ctx, message.channelId);
        visible = true;
      } catch {
        // not visible to the caller
      }
    }

    invariant(visible, { code: 'NOT_FOUND', message: 'File not found' });

    const { storageSignedUrlsEnabled, storageSignedUrlsTtlSeconds } =
      await getSettings();
    const signed = signFile(
      file,
      storageSignedUrlsEnabled,
      storageSignedUrlsTtlSeconds
    );

    invariant(signed, { code: 'NOT_FOUND', message: 'File not found' });

    const watch = {
      file: {
        id: signed.id,
        name: signed.name,
        originalName: signed.originalName,
        mimeType: signed.mimeType,
        _accessToken: signed._accessToken,
        _accessTokenExpiresAt: signed._accessTokenExpiresAt
      },
      rutube: null,
      playing: true,
      positionSec: 0,
      updatedAt: Date.now(),
      controllerUserId: ctx.user.id
    };

    runtime.setWatchState(watch);

    publishWatchState(channelId, watch);
  });

export { selectWatchFileRoute };
