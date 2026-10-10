import type { TMusicSearchResult } from '@draevix/shared';
import { z } from 'zod';
import {
  resolvePlaylistTracks,
  throwSoundCloudError
} from '../../helpers/soundcloud';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicPlaylistRoute = protectedProcedure
  .input(
    z.object({
      url: z.string().trim().min(1).max(500)
    })
  )
  .query(async ({ input }): Promise<{ tracks: TMusicSearchResult[] }> => {
    invariant(/soundcloud\.com\//i.test(input.url), {
      code: 'NOT_FOUND',
      message: 'Invalid SoundCloud link'
    });

    try {
      const tracks = await resolvePlaylistTracks(input.url);

      return {
        tracks: tracks.map((track) => ({
          trackId: track.trackId,
          title: track.title,
          author: track.author,
          artworkUrl: track.artworkUrl,
          durationSec: track.durationSec,
          permalinkUrl: track.permalinkUrl,
          streamable: track.streamable,
          source: 'soundcloud' as const,
          sourceId: String(track.trackId)
        }))
      };
    } catch (error) {
      throw throwSoundCloudError(error);
    }
  });

export { musicPlaylistRoute };
