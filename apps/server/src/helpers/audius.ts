import type { TMusicTrack } from '@draevix/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { verifyStreamUrl } from './soundcloud';

// audius music source, mirroring helpers/soundcloud.ts.
//
// audius exposes a genuinely public api: no keys, no tokens, no accounts.
// search returns metadata, and every play mints a fresh signed stream url
// through the /stream endpoint, so queue entries carry metadata only.

const AUDIUS_API = 'https://discoveryprovider.audius.co';
const AUDIUS_WEB = 'https://audius.co';
const AUDIUS_APP_NAME = 'Draevix';

const SEARCH_TIMEOUT_MS = 15_000;

class AudiusError extends Error {
  readonly kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM';

  constructor(kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM', message: string) {
    super(message);
    this.kind = kind;
  }
}

type TAudiusTrack = {
  trackId: number;
  audiusId: string;
  title: string;
  author: string;
  artworkUrl: string | null;
  durationSec: number;
  permalinkUrl: string;
  streamable: boolean;
};

const audiusFetch = async (
  path: string,
  params: Record<string, string>,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> => {
  const url = `${AUDIUS_API}${path}?${new URLSearchParams({
    ...params,
    app_name: AUDIUS_APP_NAME
  })}`;

  try {
    return await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new AudiusError('UPSTREAM', 'Audius is unreachable');
  }
};

// negative namespace: soundcloud ids are positive, so the expectTrackId
// guard and react keys can never confuse the two sources
const audiusTrackId = (audiusId: string): number => {
  let hash = 0x811c9dc5;

  const input = `audius:${audiusId}`;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return -((hash >>> 0) % 0x7fffffff) - 1;
};

const zAudiusTrack = z
  .object({
    id: z.string().min(1).max(32),
    title: z.string().min(1),
    duration: z.number().optional(),
    permalink: z.string().optional(),
    is_streamable: z.boolean().optional(),
    artwork: z
      .object({
        '1000x1000': z.string().optional(),
        '480x480': z.string().optional(),
        '150x150': z.string().optional()
      })
      .partial()
      .optional(),
    user: z
      .object({ name: z.string().optional(), handle: z.string().optional() })
      .partial()
      .optional()
  })
  .passthrough();

const toTrack = (raw: unknown): TAudiusTrack | null => {
  const parsed = zAudiusTrack.safeParse(raw);

  if (!parsed.success) return null;

  const data = parsed.data;

  return {
    trackId: audiusTrackId(data.id),
    audiusId: data.id,
    title: data.title,
    author: data.user?.name || data.user?.handle || '',
    artworkUrl:
      data.artwork?.['480x480'] ??
      data.artwork?.['1000x1000'] ??
      data.artwork?.['150x150'] ??
      null,
    durationSec: Math.max(0, Math.round(data.duration ?? 0)),
    permalinkUrl: data.permalink
      ? `${AUDIUS_WEB}${data.permalink}`
      : AUDIUS_WEB,
    streamable: data.is_streamable !== false
  };
};

const audiusSearch = async (
  query: string,
  limit: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TAudiusTrack[]> => {
  const response = await audiusFetch(
    '/v1/tracks/search',
    { query, limit: String(limit) },
    SEARCH_TIMEOUT_MS,
    fetchImpl
  );

  if (!response.ok) {
    throw new AudiusError('UPSTREAM', 'Audius search failed');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new AudiusError('UPSTREAM', 'Audius returned an invalid response');
  }

  const data = (payload as { data?: unknown }).data;

  if (!Array.isArray(data)) {
    throw new AudiusError('UPSTREAM', 'Audius returned an invalid response');
  }

  const out: TAudiusTrack[] = [];

  for (const raw of data) {
    const track = toTrack(raw);

    if (track && out.length < limit) out.push(track);
  }

  return out;
};

// the /stream endpoint answers 302 to a freshly signed file url: capture it
// without following, so the stored mp3 url is minted at play time
const isAudiusId = (audiusId: string): boolean =>
  /^[A-Za-z0-9]+$/.test(audiusId) && audiusId.length <= 32;

const resolveAudiusStreamUrl = async (
  audiusId: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> => {
  if (!isAudiusId(audiusId)) {
    throw new AudiusError('NOT_FOUND', 'Invalid Audius track');
  }

  let response: Response;

  try {
    response = await fetchImpl(
      `${AUDIUS_API}/v1/tracks/${encodeURIComponent(audiusId)}/stream?${new URLSearchParams(
        { app_name: AUDIUS_APP_NAME }
      )}`,
      { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS), redirect: 'manual' }
    );
  } catch {
    throw new AudiusError('UPSTREAM', 'Audius is unreachable');
  }

  if (response.status === 404) {
    throw new AudiusError('NOT_FOUND', 'Audius track not found');
  }

  const location = response.headers.get('location');

  if (
    (response.status < 300 || response.status >= 400 || !location) &&
    response.status !== 200
  ) {
    throw new AudiusError('UNAVAILABLE', 'This track cannot be streamed');
  }

  // some nodes serve bytes directly instead of redirecting
  const streamUrl =
    response.status === 200 ? response.url : (location as string);

  if (!streamUrl.startsWith('https://')) {
    throw new AudiusError('UNAVAILABLE', 'This track cannot be streamed');
  }

  return streamUrl;
};

// stream urls are signed and short-lived, so they are minted fresh on every
// play, never stored in the queue: queue entries carry metadata only.
// metadata arrives with the input, like the soundcloud resolver does.
const resolveAudiusPlayableTrack = async (
  track: {
    sourceId: string;
    title: string;
    author?: string;
    artworkUrl?: string | null;
    durationSec?: number;
    permalinkUrl: string;
  },
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<Omit<TMusicTrack, 'addedByUserId'>> => {
  const audiusId = track.sourceId;

  if (!isAudiusId(audiusId)) {
    throw new AudiusError('NOT_FOUND', 'Invalid Audius track');
  }

  const mp3Url = await resolveAudiusStreamUrl(audiusId, fetchImpl);

  await verifyStreamUrl(mp3Url, fetchImpl);

  return {
    trackId: audiusTrackId(audiusId),
    title: track.title,
    author: track.author ?? '',
    artworkUrl: track.artworkUrl ?? null,
    durationSec: track.durationSec ?? 0,
    permalinkUrl: track.permalinkUrl,
    source: 'audius',
    sourceId: audiusId,
    mp3Url
  };
};

// audius failures map to caller-facing codes the same way soundcloud ones
// do: missing stays 404, unstreamable stays 400, everything upstream stays 500
const throwAudiusError = (error: unknown): never => {
  if (error instanceof AudiusError) {
    const code =
      error.kind === 'NOT_FOUND'
        ? ('NOT_FOUND' as const)
        : error.kind === 'UNAVAILABLE'
          ? ('BAD_REQUEST' as const)
          : ('INTERNAL_SERVER_ERROR' as const);

    throw new TRPCError({ code, message: error.message });
  }

  throw error;
};

export {
  AudiusError,
  audiusSearch,
  audiusTrackId,
  resolveAudiusPlayableTrack,
  resolveAudiusStreamUrl,
  throwAudiusError,
  type TAudiusTrack
};
