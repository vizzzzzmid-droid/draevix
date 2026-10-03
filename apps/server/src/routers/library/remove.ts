import { Permission } from '@draevix/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { removeFile } from '../../db/mutations/files';
import { removeLibraryEntryByFileId } from '../../db/mutations/library';
import { isFileOrphaned } from '../../db/queries/files';
import { getLibraryEntryByFileId } from '../../db/queries/library';
import { getSettings } from '../../db/queries/server';
import { files as filesTable } from '../../db/schema';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const removeLibraryRoute = protectedProcedure
  .input(
    z.object({
      fileId: z.number().int().positive()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const entry = await getLibraryEntryByFileId(input.fileId);

    invariant(entry, { code: 'NOT_FOUND', message: 'Library entry not found' });

    const { watchLibraryLocked } = await getSettings();

    if (watchLibraryLocked) {
      await ctx.needsPermission(Permission.MANAGE_SETTINGS);
    } else {
      const isOwner =
        entry.addedByUserId !== null && entry.addedByUserId === ctx.user.id;

      if (!isOwner) {
        await ctx.needsPermission(Permission.MANAGE_SETTINGS);
      }
    }

    await removeLibraryEntryByFileId(input.fileId);

    // the file itself goes away too unless something else (a message, an
    // avatar, ...) still references it
    await db
      .update(filesTable)
      .set({ keep: false })
      .where(eq(filesTable.id, input.fileId));

    if (await isFileOrphaned(input.fileId)) {
      await removeFile(input.fileId);
    }

    return { removed: true };
  });

export { removeLibraryRoute };
