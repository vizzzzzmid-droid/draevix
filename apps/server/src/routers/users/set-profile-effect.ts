import { Permission, ProfileEffect } from '@draevix/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { publishUser } from '../../db/publishers';
import { users } from '../../db/schema';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const setProfileEffectRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number().int().positive(),
      effect: z.enum(ProfileEffect).nullable()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    const updated = await db
      .update(users)
      .set({ profileEffect: input.effect })
      .where(eq(users.id, input.userId))
      .returning()
      .get();

    invariant(updated, { code: 'NOT_FOUND', message: 'User not found' });

    publishUser(updated.id, 'update');

    return { profileEffect: updated.profileEffect };
  });

export { setProfileEffectRoute };
