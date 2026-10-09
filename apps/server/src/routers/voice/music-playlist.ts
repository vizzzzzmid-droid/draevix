import type { TMusicSearchResult } from '@draevix/shared';
import { z } from 'zod';
import { throwMusicError } from '../../helpers/music';
import {
  looksLikePlaylistUrl,
  resolvePlaylistTracks
} from '../../helpers/soundcloud';
import {
  looksLikeYoutubeUrl,
  resolveYoutubeEntry
} from '../../helpers/youtube';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const musicPlaylistRoute = protectedProcedure
  .input(
    z.object({
      url: z.string().trim().min(1).max(500)
    })
  )
  .query(async ({ input }): Promise<{ tracks: TMusicSearchResult[] }> => {
    // a single youtube video resolves into one entry, a playlist into its
    // entries; soundcloud only resolves set links, single tracks go through
    // search like before
    if (looksLikeYoutubeUrl(input.url)) {
      try {
        const tracks = await resolveYoutubeEntry(input.url);

        return {
          tracks: tracks.map((track) => ({
            trackId: track.trackId,
            title: track.title,
            author: track.author,
            artworkUrl: track.artworkUrl,
            durationSec: track.durationSec,
            permalinkUrl: track.permalinkUrl,
            streamable: track.streamable,
            source: 'youtube' as const,
            sourceId: track.videoId
          }))
        };
      } catch (error) {
        throw throwMusicError(error);
      }
    }

    invariant(looksLikePlaylistUrl(input.url), {
      code: 'NOT_FOUND',
      message: 'Unsupported music link'
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
      throw throwMusicError(error);
    }
  });

export { musicPlaylistRoute };
