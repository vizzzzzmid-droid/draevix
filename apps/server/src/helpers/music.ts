import type { TMusicSource, TMusicTrack } from '@draevix/shared';
import { z } from 'zod';
import { invariant } from '../utils/invariant';
import {
  AudiusError,
  resolveAudiusPlayableTrack,
  throwAudiusError
} from './audius';
import {
  resolvePlayableTrack as resolveSoundCloudPlayableTrack,
  SoundCloudError,
  throwSoundCloudError,
  type TTrackInput as TSoundCloudTrackInput
} from './soundcloud';

// queue/play input shared by both sources. soundcloud ids are positive api
// ids, audius ids are negative hashes, so trackId stays a plain int.
const zTrackInput = z.object({
  trackId: z.number().int(),
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(200).optional(),
  artworkUrl: z.string().trim().max(500).nullable().optional(),
  durationSec: z.number().min(0).max(86400).optional(),
  permalinkUrl: z.string().trim().min(1).max(500),
  source: z.enum(['soundcloud', 'audius']).default('soundcloud'),
  sourceId: z.string().trim().max(100).default('')
});

type TTrackInput = z.infer<typeof zTrackInput>;

const toSoundCloudInput = (track: TTrackInput): TSoundCloudTrackInput => ({
  trackId: track.trackId,
  title: track.title,
  author: track.author,
  artworkUrl: track.artworkUrl,
  durationSec: track.durationSec,
  permalinkUrl: track.permalinkUrl
});

// stream urls are minted fresh on every play, whichever source the track is
// from. queue entries always carry metadata only.
const resolvePlayableTrack = async (
  track: TTrackInput,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<Omit<TMusicTrack, 'addedByUserId'>> => {
  const source: TMusicSource = track.source;

  if (source === 'audius') {
    invariant(track.sourceId, {
      code: 'BAD_REQUEST',
      message: 'Audius track id is missing'
    });

    return await resolveAudiusPlayableTrack(
      {
        sourceId: track.sourceId,
        title: track.title,
        author: track.author,
        artworkUrl: track.artworkUrl,
        durationSec: track.durationSec,
        permalinkUrl: track.permalinkUrl
      },
      fetchImpl
    );
  }

  return await resolveSoundCloudPlayableTrack(
    toSoundCloudInput(track),
    fetchImpl
  );
};

const throwMusicError = (error: unknown): never => {
  if (error instanceof SoundCloudError) throwSoundCloudError(error);
  if (error instanceof AudiusError) throwAudiusError(error);

  throw error;
};

export { resolvePlayableTrack, throwMusicError, zTrackInput, type TTrackInput };
