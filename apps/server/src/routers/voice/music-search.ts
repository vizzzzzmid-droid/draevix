import { z } from 'zod';
import {
  soundcloudSearch,
  throwSoundCloudError,
  type TSoundCloudTrack
} from '../../helpers/soundcloud';
import { protectedProcedure } from '../../utils/trpc';

const musicSearchRoute = protectedProcedure
  .input(
    z.object({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(25).optional()
    })
  )
  .query(async ({ input }): Promise<{ results: TSoundCloudTrack[] }> => {
    try {
      const results = await soundcloudSearch(input.query, input.limit ?? 10);

      return { results };
    } catch (error) {
      throw throwSoundCloudError(error);
    }
  });

export { musicSearchRoute };
