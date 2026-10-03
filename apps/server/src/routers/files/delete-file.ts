import { isEmptyMessage } from '@draevix/shared';
import { z } from 'zod';
import { removeFile } from '../../db/mutations/files';
import { deleteMessage } from '../../db/mutations/messages';
import { publishMessage } from '../../db/publishers';
import { getFileById, getFilesByMessageId } from '../../db/queries/files';
import { getMessageByFileId } from '../../db/queries/messages';
import { assertChannelAccess } from '../../helpers/assert-channel-access';
import { assertCanModifyMessage } from '../../helpers/load-message-for-write';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const deleteFileRoute = protectedProcedure
  .input(z.object({ fileId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const message = await getMessageByFileId(input.fileId);

    if (!message) {
      // uploads kept outside of chat have no message to moderate through,
      // only the owner can drop them and the answer stays not found either way
      const file = await getFileById(input.fileId);

      invariant(file, {
        code: 'NOT_FOUND',
        message: 'File not found'
      });
      invariant(file.userId !== null && file.userId === ctx.user.id, {
        code: 'NOT_FOUND',
        message: 'File not found'
      });

      await removeFile(file.id);

      return;
    }

    await assertChannelAccess(ctx, message.channelId);

    await assertCanModifyMessage(ctx, message, 'delete this file');

    await removeFile(input.fileId);

    publishMessage(message.id, message.channelId, 'update');

    const files = await getFilesByMessageId(message.id);

    if (isEmptyMessage(message.content) && files.length == 0) {
      await deleteMessage({
        id: message.id,
        channelId: message.channelId,
        parentMessageId: message.parentMessageId
      });
    }
  });

export { deleteFileRoute };
