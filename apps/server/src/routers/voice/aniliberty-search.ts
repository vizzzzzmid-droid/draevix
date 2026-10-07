import { z } from 'zod';
import {
  anilibertySearch,
  throwAnilibertyError,
  type TAnilibertySearchResult
} from '../../helpers/aniliberty';
import { protectedProcedure } from '../../utils/trpc';

const anilibertySearchRoute = protectedProcedure
  .input(
    z.object({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(25).optional()
    })
  )
  .query(async ({ input }): Promise<{ results: TAnilibertySearchResult[] }> => {
    try {
      const results = await anilibertySearch(input.query, input.limit ?? 10);

      return { results };
    } catch (error) {
      throw throwAnilibertyError(error);
    }
  });

export { anilibertySearchRoute };
