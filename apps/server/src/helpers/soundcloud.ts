import type { TMusicTrack } from '@draevix/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const SOUNDCLOUD_API = 'https://api-v2.soundcloud.com';
const SOUNDCLOUD_WEB = 'https://soundcloud.com';

const SOUNDCLOUD_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SEARCH_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 20_000;
const CLIENT_ID_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

class SoundCloudError extends Error {
  readonly kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM' | 'BAD_CLIENT_ID';

  constructor(
    kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM' | 'BAD_CLIENT_ID',
    message: string
  ) {
    super(message);
    this.kind = kind;
  }
}

type TSoundCloudTrack = {
  trackId: number;
  title: string;
  author: string;
  artworkUrl: string | null;
  durationSec: number;
  permalinkUrl: string;
  streamable: boolean;
};

const soundcloudFetch = async (
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> => {
  try {
    return await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': SOUNDCLOUD_USER_AGENT }
    });
  } catch {
    throw new SoundCloudError('UPSTREAM', 'SoundCloud is unreachable');
  }
};

const extractClientId = (javaScript: string): string | null => {
  const match = javaScript.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/);

  return match?.[1] ?? null;
};

let cachedClientId: { clientId: string; at: number } | null = null;

const discoverClientId = async (
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> => {
  if (
    cachedClientId &&
    Date.now() - cachedClientId.at < CLIENT_ID_CACHE_TTL_MS
  ) {
    return cachedClientId.clientId;
  }

  const page = await soundcloudFetch(
    SOUNDCLOUD_WEB,
    PAGE_TIMEOUT_MS,
    fetchImpl
  );

  if (!page.ok) {
    throw new SoundCloudError('UPSTREAM', 'SoundCloud is unreachable');
  }

  const html = await page.text();
  const bundles = [...html.matchAll(/<script[^>]*src="([^"]+\.js[^"]*)"/g)].map(
    (match) => match[1]
  );

  for (const bundle of bundles.slice(-5)) {
    if (!bundle) continue;

    const url = bundle.startsWith('http')
      ? bundle
      : `${SOUNDCLOUD_WEB}${bundle}`;
    const response = await soundcloudFetch(url, PAGE_TIMEOUT_MS, fetchImpl);

    if (!response.ok) continue;

    const clientId = extractClientId(await response.text());

    if (clientId) {
      cachedClientId = { clientId, at: Date.now() };

      return clientId;
    }
  }

  throw new SoundCloudError(
    'BAD_CLIENT_ID',
    'SoundCloud refused the connection'
  );
};

const clearSoundCloudClientIdCache = (): void => {
  cachedClientId = null;
};

const upgradeArtwork = (url: string | null | undefined): string | null => {
  if (!url) return null;

  // -large is 100px, -t500x500 is the biggest square variant cdn serves
  return url.replace('-large.', '-t500x500.');
};

const zTrack = z
  .object({
    id: z.number(),
    title: z.string(),
    permalink_url: z.string(),
    duration: z.number().optional(),
    streamable: z.boolean().optional(),
    policy: z.string().optional(),
    artwork_url: z.string().nullable().optional(),
    user: z.object({ username: z.string() }).partial().optional()
  })
  .passthrough();

const zTrackInput = z.object({
  trackId: z.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(200).optional(),
  artworkUrl: z.string().trim().max(500).nullable().optional(),
  durationSec: z.number().min(0).max(86400).optional(),
  permalinkUrl: z.string().trim().min(1).max(500)
});

type TTrackInput = z.infer<typeof zTrackInput>;

const toTrack = (raw: unknown): TSoundCloudTrack | null => {
  const parsed = zTrack.safeParse(raw);

  if (!parsed.success) return null;

  const data = parsed.data;

  return {
    trackId: data.id,
    title: data.title,
    author: data.user?.username ?? '',
    artworkUrl: upgradeArtwork(data.artwork_url),
    durationSec: Math.max(0, Math.round((data.duration ?? 0) / 1000)),
    permalinkUrl: data.permalink_url,
    streamable: data.streamable === true && data.policy !== 'BLOCK'
  };
};

const withClientId = async <T>(
  run: (clientId: string) => Promise<T>,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<T> => {
  try {
    return await run(await discoverClientId(fetchImpl));
  } catch (error) {
    if (error instanceof SoundCloudError && error.kind === 'BAD_CLIENT_ID') {
      clearSoundCloudClientIdCache();
      return await run(await discoverClientId(fetchImpl));
    }

    throw error;
  }
};

const soundcloudSearch = async (
  query: string,
  limit: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TSoundCloudTrack[]> => {
  return await withClientId(async (clientId) => {
    const response = await soundcloudFetch(
      `${SOUNDCLOUD_API}/search/tracks?${new URLSearchParams({
        q: query,
        limit: String(limit),
        client_id: clientId
      })}`,
      SEARCH_TIMEOUT_MS,
      fetchImpl
    );

    if (response.status === 401 || response.status === 403) {
      throw new SoundCloudError(
        'BAD_CLIENT_ID',
        'SoundCloud refused the connection'
      );
    }

    if (!response.ok) {
      throw new SoundCloudError('UPSTREAM', 'SoundCloud search failed');
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new SoundCloudError(
        'UPSTREAM',
        'SoundCloud returned an invalid response'
      );
    }

    const collection = (payload as { collection?: unknown }).collection;

    if (!Array.isArray(collection)) {
      throw new SoundCloudError(
        'UPSTREAM',
        'SoundCloud returned an invalid response'
      );
    }

    const out: TSoundCloudTrack[] = [];

    for (const raw of collection) {
      const track = toTrack(raw);

      if (track) out.push(track);
    }

    return out;
  }, fetchImpl);
};

const zTranscoding = z.object({
  url: z.string(),
  preset: z.string().optional(),
  format: z.object({ protocol: z.string() }).partial().optional()
});

const zResolvedTrack = z
  .object({
    media: z
      .object({ transcodings: z.array(zTranscoding) })
      .partial()
      .optional()
  })
  .passthrough();

const resolveStreamUrl = async (
  track:
    | { trackId: number; permalinkUrl: string }
    | { trackId: number; transcodings: { url: string; protocol: string }[] },
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> => {
  return await withClientId(async (clientId) => {
    let transcodings: { url: string; protocol: string }[] = [];

    if ('transcodings' in track) {
      transcodings = track.transcodings;
    } else {
      const response = await soundcloudFetch(
        `${SOUNDCLOUD_API}/resolve?${new URLSearchParams({
          url: track.permalinkUrl,
          client_id: clientId
        })}`,
        SEARCH_TIMEOUT_MS,
        fetchImpl
      );

      if (response.status === 404) {
        throw new SoundCloudError('NOT_FOUND', 'SoundCloud track not found');
      }

      if (response.status === 401 || response.status === 403) {
        throw new SoundCloudError(
          'BAD_CLIENT_ID',
          'SoundCloud refused the connection'
        );
      }

      if (!response.ok) {
        throw new SoundCloudError('UPSTREAM', 'SoundCloud resolve failed');
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new SoundCloudError(
          'UPSTREAM',
          'SoundCloud returned an invalid response'
        );
      }

      const parsed = zResolvedTrack.safeParse(payload);

      if (!parsed.success || !parsed.data.media?.transcodings) {
        throw new SoundCloudError(
          'UNAVAILABLE',
          'This track cannot be streamed'
        );
      }

      transcodings = parsed.data.media.transcodings.map((entry) => ({
        url: entry.url,
        protocol: entry.format?.protocol ?? ''
      }));
    }

    // progressive mp3 first: plain file, no hls needed, seeks with ranges
    const picked =
      transcodings.find((entry) => entry.protocol === 'progressive') ??
      transcodings.find((entry) => entry.protocol === 'hls');

    if (!picked) {
      throw new SoundCloudError('UNAVAILABLE', 'This track cannot be streamed');
    }

    const streamResponse = await soundcloudFetch(
      `${picked.url}?client_id=${clientId}`,
      SEARCH_TIMEOUT_MS,
      fetchImpl
    );

    if (streamResponse.status === 401 || streamResponse.status === 403) {
      throw new SoundCloudError(
        'BAD_CLIENT_ID',
        'SoundCloud refused the connection'
      );
    }

    if (!streamResponse.ok) {
      throw new SoundCloudError('UPSTREAM', 'SoundCloud stream request failed');
    }

    let streamPayload: unknown;

    try {
      streamPayload = await streamResponse.json();
    } catch {
      throw new SoundCloudError(
        'UPSTREAM',
        'SoundCloud returned an invalid response'
      );
    }

    const streamUrl = (streamPayload as { url?: unknown }).url;

    if (typeof streamUrl !== 'string' || !streamUrl.startsWith('https://')) {
      throw new SoundCloudError('UNAVAILABLE', 'This track cannot be streamed');
    }

    return streamUrl;
  }, fetchImpl);
};

const resolvePlaylistTracks = async (
  playlistUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TSoundCloudTrack[]> => {
  return await withClientId(async (clientId) => {
    const response = await soundcloudFetch(
      `${SOUNDCLOUD_API}/resolve?${new URLSearchParams({
        url: playlistUrl,
        client_id: clientId
      })}`,
      SEARCH_TIMEOUT_MS,
      fetchImpl
    );

    if (response.status === 404) {
      throw new SoundCloudError('NOT_FOUND', 'SoundCloud playlist not found');
    }

    if (response.status === 401 || response.status === 403) {
      throw new SoundCloudError(
        'BAD_CLIENT_ID',
        'SoundCloud refused the connection'
      );
    }

    if (!response.ok) {
      throw new SoundCloudError('UPSTREAM', 'SoundCloud resolve failed');
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new SoundCloudError(
        'UPSTREAM',
        'SoundCloud returned an invalid response'
      );
    }

    const data = payload as { kind?: string; tracks?: unknown };

    if (data.kind !== 'playlist' || !Array.isArray(data.tracks)) {
      throw new SoundCloudError('NOT_FOUND', 'SoundCloud playlist not found');
    }

    const out: TSoundCloudTrack[] = [];

    for (const raw of data.tracks) {
      const track = toTrack(raw);

      if (track) out.push(track);
    }

    return out;
  }, fetchImpl);
};

const looksLikePlaylistUrl = (input: string): boolean =>
  /soundcloud\.com\/[^/]+\/sets(\/|$)/i.test(input.trim());

// one-byte range probe: signed urls die silently, dead tracks must fail
// before the party starts instead of hanging every player on error
const verifyStreamUrl = async (
  streamUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<void> => {
  let response: Response;

  try {
    response = await fetchImpl(streamUrl, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: {
        'User-Agent': SOUNDCLOUD_USER_AGENT,
        Range: 'bytes=0-0'
      }
    });
  } catch {
    throw new SoundCloudError('UPSTREAM', 'SoundCloud stream is unreachable');
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (
    (response.status !== 200 && response.status !== 206) ||
    contentType.includes('text/html')
  ) {
    throw new SoundCloudError(
      'UNAVAILABLE',
      'This track is unavailable right now'
    );
  }
};

// stream urls are signed and short-lived, so they are minted fresh on every
// play, never stored in the queue: queue entries carry metadata only.
// unstreamable tracks surface when their transcodings come back empty
const resolvePlayableTrack = async (
  track: TTrackInput,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<Omit<TMusicTrack, 'addedByUserId'>> => {
  const mp3Url = await resolveStreamUrl(
    { trackId: track.trackId, permalinkUrl: track.permalinkUrl },
    fetchImpl
  );

  await verifyStreamUrl(mp3Url, fetchImpl);

  return {
    trackId: track.trackId,
    title: track.title,
    author: track.author ?? '',
    artworkUrl: track.artworkUrl ?? null,
    durationSec: track.durationSec ?? 0,
    permalinkUrl: track.permalinkUrl,
    mp3Url
  };
};

// soundcloud failures map to caller-facing codes: missing stays 404,// private or unstreamable stays 400, everything upstream stays 500
const throwSoundCloudError = (error: unknown): never => {
  if (error instanceof SoundCloudError) {
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
  clearSoundCloudClientIdCache,
  discoverClientId,
  extractClientId,
  looksLikePlaylistUrl,
  resolvePlayableTrack,
  resolvePlaylistTracks,
  resolveStreamUrl,
  SoundCloudError,
  soundcloudSearch,
  throwSoundCloudError,
  toTrack,
  upgradeArtwork,
  verifyStreamUrl,
  zTrackInput,
  type TSoundCloudTrack,
  type TTrackInput
};
