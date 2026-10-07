import { z } from 'zod';
import {
  anilibertyFranchise,
  throwAnilibertyError,
  type TAnilibertyFranchiseRelease
} from '../../helpers/aniliberty';
import { protectedProcedure } from '../../utils/trpc';

const anilibertyFranchiseRoute = protectedProcedure
  .input(
    z.object({
      releaseId: z.number().int().positive()
    })
  )
  .query(
    async ({ input }): Promise<{ releases: TAnilibertyFranchiseRelease[] }> => {
      try {
        const releases = await anilibertyFranchise(input.releaseId);

        return { releases };
      } catch (error) {
        throw throwAnilibertyError(error);
      }
    }
  );

export { anilibertyFranchiseRoute };
