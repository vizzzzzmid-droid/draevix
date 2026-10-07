import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { config } from '../config';

const KODIK_API = 'https://kodik-api.com';
const KODIK_PLAYER = 'https://kodikplayer.com';
const KODIK_TOKENS_URL =
  'https://raw.githubusercontent.com/YaNesyTortiK/AnimeParsers/refs/heads/main/kdk_tokns/tokens.json';

const KODIK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SEARCH_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 20_000;
const TOKEN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

class KodikError extends Error {
  readonly kind:
    | 'NOT_FOUND'
    | 'UNAVAILABLE'
    | 'UPSTREAM'
    | 'BAD_TOKEN'
    | 'BLOCKED';

  constructor(
    kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM' | 'BAD_TOKEN' | 'BLOCKED',
    message: string
  ) {
    super(message);
    this.kind = kind;
  }
}

type TKodikTranslation = {
  id: string;
  title: string;
  type: string;
  episodeCount: number;
  mediaId: string;
  mediaHash: string;
  selected: boolean;
};

type TKodikEpisode = {
  episode: number;
  title: string;
};

type TKodikStreamUrls = {
  mp4: Record<string, string>;
  hls: Record<string, string>;
  maxQuality: number;
};

const kodikFetch = async (
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> => {
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': KODIK_USER_AGENT, ...(init?.headers ?? {}) }
    });
  } catch {
    throw new KodikError('UPSTREAM', 'Kodik is unreachable');
  }
};

// public pool tokens are stored obfuscated (reversed base64 halves) to dodge
// search indexing; the pool itself is published for this exact use
const decryptKodikToken = (tkn: string): string => {
  const half = Math.floor(tkn.length / 2);
  const first = [...tkn.slice(0, half)].reverse().join('');
  const second = [...tkn.slice(half)].reverse().join('');

  return (
    Buffer.from(second, 'base64').toString('utf-8') +
    Buffer.from(first, 'base64').toString('utf-8')
  );
};

const zKodikSearchResponse = z
  .object({
    total: z.number(),
    results: z.array(z.unknown()).optional()
  })
  .passthrough();

const probeKodikToken = async (
  token: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<boolean> => {
  try {
    const response = await kodikFetch(
      `${KODIK_API}/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token, title: 'Naruto', limit: '1' })
      },
      SEARCH_TIMEOUT_MS,
      fetchImpl
    );

    if (!response.ok) return false;

    const parsed = zKodikSearchResponse.safeParse(await response.json());

    return parsed.success && typeof parsed.data.total === 'number';
  } catch {
    return false;
  }
};

let cachedPoolToken: { token: string; at: number } | null = null;

const discoverPoolToken = async (
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> => {
  if (cachedPoolToken && Date.now() - cachedPoolToken.at < TOKEN_CACHE_TTL_MS) {
    return cachedPoolToken.token;
  }

  const response = await kodikFetch(
    KODIK_TOKENS_URL,
    undefined,
    SEARCH_TIMEOUT_MS,
    fetchImpl
  );

  if (!response.ok) {
    throw new KodikError('UPSTREAM', 'Kodik token pool is unreachable');
  }

  const pool = (await response.json()) as {
    stable?: { tokn: string }[];
    unstable?: { tokn: string }[];
  };

  for (const section of [pool.stable ?? [], pool.unstable ?? []]) {
    for (const entry of section) {
      let token = '';

      try {
        token = decryptKodikToken(entry.tokn);
      } catch {
        continue;
      }

      if (await probeKodikToken(token, fetchImpl)) {
        cachedPoolToken = { token, at: Date.now() };

        return token;
      }
    }
  }

  throw new KodikError('BAD_TOKEN', 'No working Kodik token available');
};

const getKodikToken = async (
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> => {
  const configured = config.kodik.token?.trim();

  if (configured) {
    if (await probeKodikToken(configured, fetchImpl)) return configured;
    // a configured token that kodik rejects falls back to the public pool
  }

  return await discoverPoolToken(fetchImpl);
};

const clearKodikTokenCache = (): void => {
  cachedPoolToken = null;
};

const checkKodikApiError = (payload: unknown): void => {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof (payload as { error: unknown }).error === 'string'
  ) {
    const message = (payload as { error: string }).error;

    if (message.includes('токен')) {
      throw new KodikError('BAD_TOKEN', 'Kodik token was rejected');
    }

    throw new KodikError('UPSTREAM', 'Kodik request failed');
  }
};

const zKodikSearchItem = z
  .object({
    id: z.string(),
    type: z.string(),
    link: z.string(),
    title: z.string(),
    title_orig: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    quality: z.string().nullable().optional(),
    episodes_count: z.number().nullable().optional(),
    last_episode: z.number().nullable().optional(),
    blocked_countries: z.array(z.string()).optional(),
    screenshots: z.array(z.string()).optional(),
    translation: z
      .object({
        id: z.number(),
        title: z.string(),
        type: z.string()
      })
      .partial()
      .optional()
  })
  .passthrough();

type TKodikSearchResult = {
  kodikId: string;
  kind: 'video' | 'serial';
  link: string;
  title: string;
  titleOrig: string;
  year: number | null;
  quality: string;
  episodesCount: number | null;
  translation: { id: string; title: string; type: string };
  poster: string | null;
  blocked: boolean;
};

const kodikSearch = async (
  query: string,
  limit: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TKodikSearchResult[]> => {
  const token = await getKodikToken(fetchImpl);

  const run = async (activeToken: string) => {
    const response = await kodikFetch(
      `${KODIK_API}/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: activeToken,
          title: query,
          limit: String(limit)
        })
      },
      SEARCH_TIMEOUT_MS,
      fetchImpl
    );

    if (!response.ok) {
      throw new KodikError('UPSTREAM', 'Kodik search failed');
    }

    return (await response.json()) as unknown;
  };

  let payload: unknown;

  try {
    payload = await run(token);
    checkKodikApiError(payload);
  } catch (error) {
    if (error instanceof KodikError && error.kind === 'BAD_TOKEN') {
      clearKodikTokenCache();
      payload = await run(await getKodikToken(fetchImpl));
      checkKodikApiError(payload);
    } else {
      throw error;
    }
  }

  const parsed = zKodikSearchResponse.safeParse(payload);

  if (!parsed.success || !parsed.data.results) {
    throw new KodikError('UPSTREAM', 'Kodik returned an invalid response');
  }

  const out: TKodikSearchResult[] = [];

  for (const raw of parsed.data.results) {
    const item = zKodikSearchItem.safeParse(raw);

    if (!item.success) continue;

    const data = item.data;
    const link = data.link.startsWith('//') ? `https:${data.link}` : data.link;

    out.push({
      kodikId: data.id,
      kind: data.id.startsWith('serial-') ? 'serial' : 'video',
      link,
      title: data.title,
      titleOrig: data.title_orig ?? '',
      year: data.year ?? null,
      quality: data.quality ?? '',
      episodesCount: data.episodes_count ?? data.last_episode ?? null,
      translation: {
        id: String(data.translation?.id ?? ''),
        title: data.translation?.title ?? '',
        type: data.translation?.type ?? ''
      },
      poster: data.screenshots?.[0] ?? null,
      blocked: (data.blocked_countries?.length ?? 0) > 0
    });
  }

  return out;
};

// search results and stored refs only ever carry these two hosts; anything
// else is rejected so the link can be fetched safely
const normalizeKodikLink = (link: string): string | null => {
  const trimmed = link.trim();
  const match = trimmed.match(
    /^https:\/\/(kodikplayer\.com|kodik\.info)\/(video|serial)\/(\d+)\/([0-9a-f]{32})(\/720p)?/i
  );

  if (!match) return null;

  return `https://kodikplayer.com/${match[2]}/${match[3]}/${match[4]}/720p`;
};

const sliceBetween = (
  text: string,
  start: string,
  end: string
): string | null => {
  const i = text.indexOf(start);

  if (i === -1) return null;

  const j = text.indexOf(end, i + start.length);

  if (j === -1) return null;

  return text.slice(i + start.length, j);
};

const parseUrlParams = (html: string): Record<string, string> => {
  // the assignment is a single-quoted string, so cut at its end rather than
  // at the first semicolon inside the payload
  const raw = sliceBetween(html, 'urlParams', "';");

  if (!raw) throw new KodikError('UNAVAILABLE', 'Kodik player data not found');

  const jsonText = raw.slice(raw.indexOf('{')).replace(/'[,;]?\s*$/, '');

  try {
    return JSON.parse(jsonText) as Record<string, string>;
  } catch {
    throw new KodikError('UNAVAILABLE', 'Kodik player data not found');
  }
};

const parseVideoIdentity = (
  html: string
): { type: string; hash: string; id: string } => {
  if (html.includes('запрещено к просмотру в данной стране')) {
    throw new KodikError('BLOCKED', 'This title is blocked in your country');
  }

  const field = (name: string): string | null => {
    const match = html.match(new RegExp(`\\.${name} = '([^']+)'`));

    return match?.[1] ?? null;
  };

  const type = field('type');
  const hash = field('hash');
  const id = field('id');

  if (!type || !hash || !id) {
    throw new KodikError('UNAVAILABLE', 'Kodik video is not available');
  }

  return { type, hash, id };
};

const getAttr = (tag: string, name: string): string | null => {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));

  return match?.[1] ?? null;
};

const parseTranslations = (html: string): TKodikTranslation[] => {
  const tags = html.match(/<option\b[^<>]*data-media-hash[^<>]*>/g) ?? [];
  const out: TKodikTranslation[] = [];

  for (const tag of tags) {
    const id = getAttr(tag, 'data-id');

    if (!id) continue;

    out.push({
      id,
      title: getAttr(tag, 'data-title') ?? '',
      type: getAttr(tag, 'data-translation-type') ?? '',
      episodeCount: Number(getAttr(tag, 'data-episode-count') ?? '0') || 0,
      mediaId: getAttr(tag, 'data-media-id') ?? '',
      mediaHash: getAttr(tag, 'data-media-hash') ?? '',
      selected: tag.includes('selected')
    });
  }

  return out;
};

const parseEpisodes = (html: string): TKodikEpisode[] => {
  const tags = html.match(/<option\b[^<>]*data-hash[^<>]*>/g) ?? [];
  const out: TKodikEpisode[] = [];

  for (const tag of tags) {
    if (getAttr(tag, 'data-other-translation') !== 'false') continue;

    const episode = Number(getAttr(tag, 'value') ?? '');

    if (!Number.isInteger(episode) || episode <= 0) continue;

    out.push({
      episode,
      title: getAttr(tag, 'data-title') ?? `Серия ${episode}`
    });
  }

  out.sort((a, b) => a.episode - b.episode);

  return out;
};

const parseSeasons = (html: string): number[] => {
  const box = html.match(
    /<div[^>]*class="[^"]*serial-seasons-box[^"]*"[^>]*>([\s\S]*?)<\/select>/
  );

  if (!box?.[1]) return [1];

  const seasons = [...box[1].matchAll(/value="(\d+)"/g)]
    .map((match) => Number(match[1]))
    .filter((n) => Number.isInteger(n) && n > 0);

  return seasons.length > 0 ? [...new Set(seasons)].sort((a, b) => a - b) : [1];
};

const extractPostLink = (playerJs: string): string => {
  const ajaxIdx = playerJs.indexOf('$.ajax');

  if (ajaxIdx !== -1) {
    const cacheIdx = playerJs.indexOf('cache:!1', ajaxIdx);

    if (cacheIdx !== -1) {
      try {
        const decoded = Buffer.from(
          playerJs.slice(ajaxIdx + 30, cacheIdx - 3),
          'base64'
        ).toString('utf-8');

        if (decoded.startsWith('/')) return decoded;
      } catch {
        // fall through to the regex fallback
      }
    }
  }

  const fallback = playerJs.match(/\$\.ajax\(\{url:\s*"(\/[^"]+)"/);

  if (fallback?.[1]) return fallback[1];

  throw new KodikError('UNAVAILABLE', 'Kodik player changed, cannot resolve');
};

const caesarDecodeLink = (src: string): string | null => {
  const shift = (ch: string, n: number): string => {
    const code = ch.charCodeAt(0);

    if (code >= 65 && code <= 90) {
      return String.fromCharCode(((code - 65 + n) % 26) + 65);
    }

    if (code >= 97 && code <= 122) {
      return String.fromCharCode(((code - 97 + n) % 26) + 97);
    }

    return ch;
  };

  for (let rot = 0; rot < 26; rot++) {
    try {
      const shifted = [...src].map((ch) => shift(ch, rot)).join('');
      const padded = shifted + '='.repeat((4 - (shifted.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64').toString('utf-8');

      if (decoded.includes('mp4:hls:manifest')) return decoded;
    } catch {
      // try the next rotation
    }
  }

  return null;
};

const decodeStreamLinks = (
  links: Record<string, { src: string }[]>
): TKodikStreamUrls => {
  const mp4: Record<string, string> = {};
  const hls: Record<string, string> = {};
  const qualities = Object.keys(links)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  if (qualities.length === 0) {
    throw new KodikError('UNAVAILABLE', 'Kodik has no playable quality');
  }

  for (const quality of qualities) {
    const raw = links[String(quality)]?.[0]?.src;

    if (!raw) continue;

    const decoded = raw.includes('mp4:hls:manifest')
      ? raw
      : caesarDecodeLink(raw);

    if (!decoded) continue;

    const prefix = `https:${decoded.replace(/^https?:/, '').replace(/\/[^/]*$/, '/')}`;

    mp4[String(quality)] = `${prefix}${quality}.mp4`;
    hls[String(quality)] = `${prefix}${quality}.mp4:hls:manifest.m3u8`;
  }

  const available = Object.keys(mp4)
    .map(Number)
    .sort((a, b) => a - b);

  if (available.length === 0) {
    throw new KodikError('UNAVAILABLE', 'Kodik links failed to decode');
  }

  return { mp4, hls, maxQuality: available[available.length - 1]! };
};

const fetchEmbedPage = async (
  embedUrl: string,
  fetchImpl: typeof fetch
): Promise<string> => {
  const response = await kodikFetch(
    embedUrl,
    undefined,
    PAGE_TIMEOUT_MS,
    fetchImpl
  );

  if (!response.ok) {
    throw new KodikError('UPSTREAM', 'Kodik player page failed to load');
  }

  return await response.text();
};

const findPlayerJsUrl = (html: string, embedUrl: string): string => {
  const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((src): src is string => typeof src === 'string');
  const candidate =
    srcs.find((src) => src.includes('/assets/js/') && src.endsWith('.js')) ??
    srcs.find((src) => src.endsWith('.js')) ??
    srcs[1];

  if (!candidate) {
    throw new KodikError('UNAVAILABLE', 'Kodik player changed, cannot resolve');
  }

  return new URL(candidate, embedUrl).toString();
};

type TKodikDescribe = {
  translations: TKodikTranslation[];
  seasons: number[];
  episodes: TKodikEpisode[];
  mediaType: string;
};

const kodikDescribe = async (
  link: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TKodikDescribe> => {
  const html = await fetchEmbedPage(link, fetchImpl);
  const identity = parseVideoIdentity(html);

  return {
    translations: parseTranslations(html),
    seasons: identity.type === 'serial' ? parseSeasons(html) : [1],
    episodes: identity.type === 'serial' ? parseEpisodes(html) : [],
    mediaType: identity.type
  };
};

type TKodikResolveInput = {
  link: string;
  translationId?: string;
  season?: number;
  episode?: number;
};

type TKodikResolved = TKodikStreamUrls & {
  mediaType: string;
};

// kodik hands out proxy (/s/m/) links when it limits the requesting ip:
// those never play, so reject them with a clear message instead of a black
// screen. direct links get a one-byte range probe since dead files (removed
// or region-locked on the cdn) decode just fine but answer 404/500.
const verifyKodikStream = async (
  stream: TKodikResolved,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<void> => {
  const mp4Url = stream.mp4[String(stream.maxQuality)];

  if (!mp4Url) {
    throw new KodikError('UNAVAILABLE', 'Kodik has no playable quality');
  }

  if (mp4Url.includes('/s/m/')) {
    throw new KodikError(
      'UPSTREAM',
      'Kodik limited this server for this title, try another dubbing or title'
    );
  }

  let response: Response;

  try {
    response = await fetchImpl(mp4Url, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { 'User-Agent': KODIK_USER_AGENT, Range: 'bytes=0-0' }
    });
  } catch {
    throw new KodikError('UPSTREAM', 'Kodik file is unreachable');
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (
    (response.status !== 200 && response.status !== 206) ||
    contentType.includes('text/html')
  ) {
    throw new KodikError(
      'UNAVAILABLE',
      'Kodik file is unavailable right now, try another dubbing or title'
    );
  }
};

const kodikResolveStream = async (
  input: TKodikResolveInput,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TKodikResolved> => {
  let pageUrl = input.link;
  let html = await fetchEmbedPage(pageUrl, fetchImpl);
  let identity = parseVideoIdentity(html);

  if (identity.type === 'serial' && input.translationId) {
    const translations = parseTranslations(html);
    const current = translations.find((t) => t.selected);
    const target = translations.find((t) => t.id === input.translationId);

    if (!target) {
      throw new KodikError('NOT_FOUND', 'Kodik translation not found');
    }

    if (!current || current.id !== target.id) {
      if (!target.mediaId || !target.mediaHash) {
        throw new KodikError('NOT_FOUND', 'Kodik translation not found');
      }

      pageUrl = `${KODIK_PLAYER}/serial/${target.mediaId}/${target.mediaHash}/720p`;
      html = await fetchEmbedPage(pageUrl, fetchImpl);
      identity = parseVideoIdentity(html);
    }
  }

  if (identity.type === 'serial' && input.episode) {
    const page = new URL(pageUrl);
    const season = input.season && input.season > 0 ? input.season : 1;

    page.searchParams.set('min_age', '16');
    page.searchParams.set('first_url', 'false');
    page.searchParams.set('season', String(season));
    page.searchParams.set('episode', String(input.episode));
    pageUrl = page.toString();
    html = await fetchEmbedPage(pageUrl, fetchImpl);
    identity = parseVideoIdentity(html);
  }

  const urlParams = parseUrlParams(html);
  const playerJsUrl = findPlayerJsUrl(html, pageUrl);
  const playerJs = await fetchEmbedPage(playerJsUrl, fetchImpl);
  const postLink = extractPostLink(playerJs);

  const linksResponse = await kodikFetch(
    `${KODIK_PLAYER}${postLink}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        hash: identity.hash,
        id: identity.id,
        type: identity.type,
        d: urlParams.d ?? '',
        d_sign: urlParams.d_sign ?? '',
        pd: urlParams.pd ?? '',
        pd_sign: urlParams.pd_sign ?? '',
        ref: '',
        ref_sign: urlParams.ref_sign ?? '',
        bad_user: 'true',
        cdn_is_working: 'true'
      })
    },
    PAGE_TIMEOUT_MS,
    fetchImpl
  );

  if (!linksResponse.ok) {
    throw new KodikError('UPSTREAM', 'Kodik links request failed');
  }

  const linksJson = (await linksResponse.json()) as {
    links?: Record<string, { src: string }[]>;
  };

  if (!linksJson.links) {
    throw new KodikError('UNAVAILABLE', 'Kodik has no playable quality');
  }

  return { ...decodeStreamLinks(linksJson.links), mediaType: identity.type };
};

// kodik failures map to caller-facing codes: missing stays 404, private,
// region-blocked or changed-player stays 400, everything upstream stays 500
const throwKodikError = (error: unknown): never => {
  if (error instanceof KodikError) {
    const code =
      error.kind === 'NOT_FOUND'
        ? ('NOT_FOUND' as const)
        : error.kind === 'BLOCKED' || error.kind === 'UNAVAILABLE'
          ? ('BAD_REQUEST' as const)
          : ('INTERNAL_SERVER_ERROR' as const);

    throw new TRPCError({ code, message: error.message });
  }

  throw error;
};

export {
  caesarDecodeLink,
  clearKodikTokenCache,
  decodeStreamLinks,
  decryptKodikToken,
  discoverPoolToken,
  extractPostLink,
  findPlayerJsUrl,
  getKodikToken,
  kodikDescribe,
  KodikError,
  kodikResolveStream,
  kodikSearch,
  normalizeKodikLink,
  parseEpisodes,
  parseSeasons,
  parseTranslations,
  parseUrlParams,
  parseVideoIdentity,
  probeKodikToken,
  throwKodikError,
  type TKodikDescribe,
  type TKodikEpisode,
  type TKodikResolved,
  type TKodikSearchResult,
  type TKodikStreamUrls,
  type TKodikTranslation,
  verifyKodikStream
};
