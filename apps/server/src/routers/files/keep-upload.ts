import { Permission } from '@draevix/shared';
import { z } from 'zod';
import { keepFile } from '../../db/mutations/files';
import { fileManager } from '../../helpers/file-manager';
import { protectedProcedure } from '../../utils/trpc';

const keepUploadRoute = protectedProcedure
  .input(
    z.object({
      tempFileId: z.string().min(1)
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.UPLOAD_FILES);

    const saved = await fileManager.saveFile(input.tempFileId, ctx.user.id);

    await keepFile(saved.id);

    return { fileId: saved.id };
  });

export { keepUploadRoute };
