import { Permission } from '@draevix/shared';
import { z } from 'zod';
import { keepFile } from '../../db/mutations/files';
import { addLibraryEntry } from '../../db/mutations/library';
import { isLibraryFile } from '../../db/queries/library';
import { getSettings } from '../../db/queries/server';
import { fileManager } from '../../helpers/file-manager';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const addLibraryRoute = protectedProcedure
  .input(
    z.object({
      tempFileId: z.string().min(1)
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { watchLibraryLocked } = await getSettings();

    if (watchLibraryLocked) {
      await ctx.needsPermission(Permission.MANAGE_SETTINGS);
    } else {
      await ctx.needsPermission(Permission.UPLOAD_FILES);
    }

    const saved = await fileManager.saveFile(input.tempFileId, ctx.user.id);

    invariant(saved.mimeType.startsWith('video/'), {
      code: 'BAD_REQUEST',
      message: 'Only video files can be added to the library'
    });

    invariant(!(await isLibraryFile(saved.id)), {
      code: 'CONFLICT',
      message: 'This file is already in the library'
    });

    await keepFile(saved.id);

    const entry = await addLibraryEntry(saved.id, ctx.user.id);

    return { entry };
  });

export { addLibraryRoute };
