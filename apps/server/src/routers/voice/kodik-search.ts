import { z } from 'zod';
import {
  kodikSearch,
  throwKodikError,
  type TKodikSearchResult
} from '../../helpers/kodik';
import { protectedProcedure } from '../../utils/trpc';

const kodikSearchRoute = protectedProcedure
  .input(
    z.object({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(25).optional()
    })
  )
  .query(async ({ input }): Promise<{ results: TKodikSearchResult[] }> => {
    try {
      const results = await kodikSearch(input.query, input.limit ?? 10);

      return { results };
    } catch (error) {
      throw throwKodikError(error);
    }
  });

export { kodikSearchRoute };
