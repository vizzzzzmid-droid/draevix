import { Permission } from '@draevix/shared';
import { getSettings } from '../../db/queries/server';
import { clearFields } from '../../helpers/clear-fields';
import { protectedProcedure } from '../../utils/trpc';

const getSettingsRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_SETTINGS);

  const settings = await getSettings();

  // the join password is never sent back: it rests hashed in the database and the form
  // only needs to know whether one is set. the secret token is not the same thing: it
  // is the ownership credential and the jwt signing key, and stays stripped
  return {
    ...clearFields(settings, ['secretToken', 'password']),
    hasPassword: !!settings.password
  };
});

export { getSettingsRoute };
