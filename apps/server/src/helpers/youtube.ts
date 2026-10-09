import type { TMusicTrack } from '@draevix/shared';
import { TRPCError } from '@trpc/server';
import { verifyStreamUrl } from './soundcloud';

// youtube music source, mirroring helpers/soundcloud.ts.
//
// no official api key is required: the server talks to the innertube
// endpoints the same way the android app does. the android player answers
// with direct audio urls (no signature deciphering needed), the same urls
// every listener's <audio> element then streams.
//
// stream urls are signed and short-lived, so they are minted fresh on every
// play, never stored in the queue: queue entries carry metadata only.

const YT_API_KEY = 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ-0qD7Ydwvk';
const YT_CLIENT_VERSION = '20.10.38';
const YT_INNERTUBE = 'https://youtubei.googleapis.com/youtubei/v1';

const YT_USER_AGENT =
  'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US) gzip';

const SEARCH_TIMEOUT_MS = 15_000;
const PLAYER_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 20_000;

const MAX_PLAYLIST_TRACKS = 200;

class YouTubeError extends Error {
  readonly kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM';

  constructor(kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM', message: string) {
    super(message);
    this.kind = kind;
  }
}

type TYoutubeTrack = {
  trackId: number;
  videoId: string;
  title: string;
  author: string;
  artworkUrl: string | null;
  durationSec: number;
  permalinkUrl: string;
  streamable: boolean;
};

const youtubeFetch = async (
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<unknown> => {
  let response: Response;

  try {
    response = await fetchImpl(`${YT_INNERTUBE}/${path}?prettyPrint=false`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': YT_USER_AGENT,
        'X-Goog-Api-Key': YT_API_KEY
      },
      body: JSON.stringify({
        ...body,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: YT_CLIENT_VERSION,
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US'
          }
        }
      })
    });
  } catch {
    throw new YouTubeError('UPSTREAM', 'YouTube is unreachable');
  }

  if (response.status === 401 || response.status === 403) {
    throw new YouTubeError('UPSTREAM', 'YouTube refused the connection');
  }

  if (!response.ok) {
    throw new YouTubeError('UPSTREAM', 'YouTube request failed');
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new YouTubeError('UPSTREAM', 'YouTube returned an invalid response');
  }
};

// negative namespace: soundcloud ids are positive, so the expectTrackId
// guard and react keys can never confuse the two sources
const youtubeTrackId = (videoId: string): number => {
  let hash = 0x811c9dc5;

  const input = `yt:${videoId}`;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return -((hash >>> 0) % 0x7fffffff) - 1;
};

const artworkFor = (videoId: string): string =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

const permalinkFor = (videoId: string): string =>
  `https://www.youtube.com/watch?v=${videoId}`;

const extractVideoId = (input: string): string | null => {
  const trimmed = input.trim();

  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtube\.com\/shorts\/|youtube\.com\/live\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);

    if (match?.[1]) return match[1];
  }

  return null;
};

const extractListId = (input: string): string | null => {
  const match = input.trim().match(/[?&]list=([A-Za-z0-9_-]+)/);

  return match?.[1] ?? null;
};

const looksLikeYoutubeUrl = (input: string): boolean =>
  /(?:youtube\.com|youtu\.be)\//i.test(input.trim());

const looksLikeYoutubePlaylistUrl = (input: string): boolean =>
  extractListId(input) !== null && looksLikeYoutubeUrl(input);

type TRuns = { runs?: { text?: unknown }[]; simpleText?: unknown };

const runsText = (node: unknown): string => {
  if (typeof node === 'string') return node;

  const data = node as TRuns | null | undefined;

  if (!data) return '';

  if (typeof data.simpleText === 'string') return data.simpleText;

  if (Array.isArray(data.runs)) {
    return data.runs
      .map((run) => (typeof run.text === 'string' ? run.text : ''))
      .join('');
  }

  return '';
};

const parseDurationSec = (input: unknown): number => {
  const text =
    typeof input === 'string' ? input : runsText(input as TRuns).trim();

  const match = text.match(/^(?:(\d+):)?(\d{1,3}):(\d{2})$/);

  if (!match) return 0;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if (hours > 24 || minutes >= 60 || seconds >= 60) return 0;

  return hours * 3600 + minutes * 60 + seconds;
};

const isLiveRenderer = (renderer: Record<string, unknown>): boolean => {
  if ('upcomingEventData' in renderer) return true;

  const badges = renderer.badges;

  if (Array.isArray(badges)) {
    for (const badge of badges) {
      const label = (badge as { metadataBadgeRenderer?: { label?: unknown } })
        .metadataBadgeRenderer?.label;

      if (typeof label === 'string' && /live/i.test(label)) return true;
    }
  }

  const overlays = renderer.thumbnailOverlays;

  if (Array.isArray(overlays)) {
    for (const overlay of overlays) {
      const text = JSON.stringify(overlay);

      if (/LIVE/i.test(text)) return true;
    }
  }

  return false;
};

const toTrack = (renderer: unknown): TYoutubeTrack | null => {
  const data = renderer as {
    videoId?: unknown;
    title?: unknown;
    ownerText?: unknown;
    shortBylineText?: unknown;
    lengthText?: unknown;
  };

  if (typeof data.videoId !== 'string' || data.videoId.length !== 11) {
    return null;
  }

  if (isLiveRenderer(renderer as Record<string, unknown>)) return null;

  const title = runsText(data.title).trim();

  if (!title) return null;

  const author =
    runsText(data.ownerText).trim() || runsText(data.shortBylineText).trim();

  const durationSec = parseDurationSec(data.lengthText);

  return {
    trackId: youtubeTrackId(data.videoId),
    videoId: data.videoId,
    title,
    author,
    artworkUrl: artworkFor(data.videoId),
    durationSec,
    permalinkUrl: permalinkFor(data.videoId),
    streamable: true
  };
};

// walks the nested section/item structure, collecting every videoRenderer
// breadth-first so results keep the ranking order of the response
const collectVideoRenderers = (payload: unknown): unknown[] => {
  const out: unknown[] = [];
  const queue: unknown[] = [payload];
  let head = 0;

  while (head < queue.length) {
    const node = queue[head++];

    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }

    if (typeof node !== 'object' || node === null) continue;

    const record = node as Record<string, unknown>;

    // search answers with videoRenderer on web clients and
    // compactVideoRenderer on android: both carry the same video fields
    if (record.videoRenderer) out.push(record.videoRenderer);
    if (record.compactVideoRenderer) out.push(record.compactVideoRenderer);
    if (record.playlistVideoRenderer) out.push(record.playlistVideoRenderer);

    for (const value of Object.values(record)) {
      if (typeof value === 'object' && value !== null) queue.push(value);
    }
  }

  return out;
};

const toPlaylistTrack = (renderer: unknown): TYoutubeTrack | null => {
  const data = renderer as {
    videoId?: unknown;
    title?: unknown;
    shortBylineText?: unknown;
    lengthText?: unknown;
  };

  if (typeof data.videoId !== 'string' || data.videoId.length !== 11) {
    return null;
  }

  // unplayable entries carry no title or a placeholder
  const title = runsText(data.title).trim();

  if (!title) return null;

  const author = runsText(data.shortBylineText).trim();
  const durationSec = parseDurationSec(data.lengthText);

  return {
    trackId: youtubeTrackId(data.videoId),
    videoId: data.videoId,
    title,
    author,
    artworkUrl: artworkFor(data.videoId),
    durationSec,
    permalinkUrl: permalinkFor(data.videoId),
    streamable: true
  };
};

const youtubeSearch = async (
  query: string,
  limit: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TYoutubeTrack[]> => {
  const payload = await youtubeFetch(
    'search',
    { query },
    SEARCH_TIMEOUT_MS,
    fetchImpl
  );

  const out: TYoutubeTrack[] = [];

  for (const renderer of collectVideoRenderers(payload)) {
    // search pages mix videos, channels and playlists: keep videos only
    if (
      (renderer as { videoId?: unknown }).videoId === undefined ||
      'playlistId' in (renderer as Record<string, unknown>)
    ) {
      continue;
    }

    const track = toTrack(renderer);

    if (track && out.length < limit) out.push(track);
  }

  return out;
};

type TYoutubeVideo = {
  videoId: string;
  title: string;
  author: string;
  durationSec: number;
  streamUrl: string;
};

const fetchYoutubeVideo = async (
  videoId: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TYoutubeVideo> => {
  const payload = (await youtubeFetch(
    'player',
    { videoId },
    PLAYER_TIMEOUT_MS,
    fetchImpl
  )) as {
    videoDetails?: {
      videoId?: unknown;
      title?: unknown;
      author?: unknown;
      lengthSeconds?: unknown;
      isLiveContent?: unknown;
    };
    streamingData?: {
      adaptiveFormats?: {
        mimeType?: unknown;
        url?: unknown;
        bitrate?: unknown;
      }[];
    };
    playabilityStatus?: { status?: unknown; reason?: unknown };
  };

  const status = payload.playabilityStatus?.status;

  if (status !== 'OK') {
    const reason = payload.playabilityStatus?.reason;

    throw new YouTubeError(
      'UNAVAILABLE',
      typeof reason === 'string' && reason
        ? reason
        : 'This video cannot be played'
    );
  }

  const details = payload.videoDetails;

  if (!details || details.videoId !== videoId) {
    throw new YouTubeError('NOT_FOUND', 'YouTube video not found');
  }

  if (details.isLiveContent === true) {
    throw new YouTubeError('UNAVAILABLE', 'Live streams are not supported');
  }

  const title = runsText(details.title).trim();

  if (!title) {
    throw new YouTubeError('NOT_FOUND', 'YouTube video not found');
  }

  const formats = payload.streamingData?.adaptiveFormats ?? [];
  const audio = formats.filter(
    (format) =>
      typeof format.mimeType === 'string' &&
      format.mimeType.startsWith('audio/') &&
      typeof format.url === 'string' &&
      format.url.startsWith('https://')
  );

  if (audio.length === 0) {
    throw new YouTubeError('UNAVAILABLE', 'This video has no audio track');
  }

  // m4a plays everywhere (safari included), opus only where webm is supported
  audio.sort((a, b) => {
    const aMp4 = String(a.mimeType).includes('audio/mp4') ? 0 : 1;
    const bMp4 = String(b.mimeType).includes('audio/mp4') ? 0 : 1;

    if (aMp4 !== bMp4) return aMp4 - bMp4;

    return Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0);
  });

  const streamUrl = String(audio[0]!.url);
  const durationSec = Number(details.lengthSeconds ?? 0);

  return {
    videoId,
    title,
    author: typeof details.author === 'string' ? details.author : '',
    durationSec:
      Number.isFinite(durationSec) && durationSec > 0
        ? Math.round(durationSec)
        : 0,
    streamUrl
  };
};

// single video link -> one entry, playlist link -> its entries (max 200)
const resolveYoutubeEntry = async (
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TYoutubeTrack[]> => {
  const listId = extractListId(url);

  if (listId) {
    // auto-generated mixes cannot be browsed, only regular playlists
    if (/^RD/i.test(listId)) {
      throw new YouTubeError(
        'UNAVAILABLE',
        'YouTube mixes are not supported, paste a regular playlist'
      );
    }

    const payload = await youtubeFetch(
      'browse',
      { browseId: `VL${listId}` },
      PAGE_TIMEOUT_MS,
      fetchImpl
    );

    const out: TYoutubeTrack[] = [];

    for (const renderer of collectVideoRenderers(payload)) {
      const track = toPlaylistTrack(renderer);

      if (track && out.length < MAX_PLAYLIST_TRACKS) out.push(track);
    }

    if (out.length === 0) {
      throw new YouTubeError('NOT_FOUND', 'YouTube playlist not found');
    }

    return out;
  }

  const videoId = extractVideoId(url);

  if (!videoId) {
    throw new YouTubeError('NOT_FOUND', 'Invalid YouTube link');
  }

  const video = await fetchYoutubeVideo(videoId, fetchImpl);

  return [
    {
      trackId: youtubeTrackId(video.videoId),
      videoId: video.videoId,
      title: video.title,
      author: video.author,
      artworkUrl: artworkFor(video.videoId),
      durationSec: video.durationSec,
      permalinkUrl: permalinkFor(video.videoId),
      streamable: true
    }
  ];
};

// stream urls are signed and short-lived, so they are minted fresh on every
// play, never stored in the queue: queue entries carry metadata only
const resolveYoutubePlayableTrack = async (
  track: { sourceId: string },
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<Omit<TMusicTrack, 'addedByUserId'>> => {
  const videoId = track.sourceId;

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new YouTubeError('NOT_FOUND', 'Invalid YouTube video');
  }

  const video = await fetchYoutubeVideo(videoId, fetchImpl);

  await verifyStreamUrl(video.streamUrl, fetchImpl);

  return {
    trackId: youtubeTrackId(video.videoId),
    title: video.title,
    author: video.author,
    artworkUrl: artworkFor(video.videoId),
    durationSec: video.durationSec,
    permalinkUrl: permalinkFor(video.videoId),
    source: 'youtube',
    sourceId: video.videoId,
    mp3Url: video.streamUrl
  };
};

// youtube failures map to caller-facing codes the same way soundcloud ones
// do: missing stays 404, private or unstreamable stays 400, everything
// upstream stays 500
const throwYouTubeError = (error: unknown): never => {
  if (error instanceof YouTubeError) {
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
  extractListId,
  extractVideoId,
  looksLikeYoutubePlaylistUrl,
  looksLikeYoutubeUrl,
  resolveYoutubeEntry,
  resolveYoutubePlayableTrack,
  throwYouTubeError,
  YouTubeError,
  youtubeSearch,
  youtubeTrackId,
  type TYoutubeTrack,
  type TYoutubeVideo
};
