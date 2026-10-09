import type { TMusicSearchResult } from '@draevix/shared';
import { z } from 'zod';
import { throwMusicError } from '../../helpers/music';
import {
  soundcloudSearch,
  type TSoundCloudTrack
} from '../../helpers/soundcloud';
import { youtubeSearch, type TYoutubeTrack } from '../../helpers/youtube';
import { protectedProcedure } from '../../utils/trpc';

const toResult = (
  track: TSoundCloudTrack | TYoutubeTrack,
  source: 'soundcloud' | 'youtube'
): TMusicSearchResult => ({
  trackId: track.trackId,
  title: track.title,
  author: track.author,
  artworkUrl: track.artworkUrl,
  durationSec: track.durationSec,
  permalinkUrl: track.permalinkUrl,
  streamable: track.streamable,
  source,
  sourceId:
    source === 'youtube'
      ? (track as TYoutubeTrack).videoId
      : String(track.trackId)
});

const musicSearchRoute = protectedProcedure
  .input(
    z.object({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(100).optional(),
      source: z.enum(['soundcloud', 'youtube']).default('soundcloud')
    })
  )
  .query(async ({ input }): Promise<{ results: TMusicSearchResult[] }> => {
    try {
      if (input.source === 'youtube') {
        const results = await youtubeSearch(input.query, input.limit ?? 10);

        return { results: results.map((track) => toResult(track, 'youtube')) };
      }

      const results = await soundcloudSearch(input.query, input.limit ?? 10);

      return { results: results.map((track) => toResult(track, 'soundcloud')) };
    } catch (error) {
      throw throwMusicError(error);
    }
  });

export { musicSearchRoute };
