import { z } from 'zod';
import {
  getRutubeMeta,
  parseRutubeVideoId,
  throwRutubeError
} from '../../helpers/rutube';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const resolveRutubeRoute = protectedProcedure
  .input(
    z.object({
      input: z.string().trim().min(1).max(500)
    })
  )
  .query(async ({ input }) => {
    const videoId = parseRutubeVideoId(input.input);

    invariant(videoId, {
      code: 'NOT_FOUND',
      message: 'Invalid Rutube link'
    });

    try {
      const meta = await getRutubeMeta(videoId);

      return {
        video: {
          videoId: meta.videoId,
          title: meta.title,
          authorName: meta.authorName,
          durationSec: meta.durationSec,
          thumbnailUrl: meta.thumbnailUrl
        }
      };
    } catch (error) {
      throwRutubeError(error);
    }
  });

export { resolveRutubeRoute };
