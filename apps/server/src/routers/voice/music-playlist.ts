import { z } from 'zod';
import {
  resolvePlaylistTracks,
  throwSoundCloudError,
  type TSoundCloudTrack
} from '../../helpers/soundcloud';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicPlaylistRoute = protectedProcedure
  .input(
    z.object({
      url: z.string().trim().min(1).max(500)
    })
  )
  .query(async ({ input }): Promise<{ tracks: TSoundCloudTrack[] }> => {
    invariant(/soundcloud\.com\//i.test(input.url), {
      code: 'NOT_FOUND',
      message: 'Invalid SoundCloud link'
    });

    try {
      const tracks = await resolvePlaylistTracks(input.url);

      return { tracks };
    } catch (error) {
      throw throwSoundCloudError(error);
    }
  });

export { musicPlaylistRoute };
