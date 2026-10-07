import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const ANILIBERTY_API = 'https://aniliberty.top/api/v1';
const ANILIBERTY_SITE = 'https://aniliberty.top';

const ANILIBERTY_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SEARCH_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 20_000;

class AnilibertyError extends Error {
  readonly kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM';

  constructor(kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM', message: string) {
    super(message);
    this.kind = kind;
  }
}

type TAnilibertySearchResult = {
  releaseId: number;
  title: string;
  titleOrig: string;
  year: number | null;
  poster: string | null;
  episodesTotal: number | null;
};

type TAnilibertyEpisode = {
  ordinal: number;
  name: string | null;
  duration: number;
  hls480: string | null;
  hls720: string | null;
  hls1080: string | null;
};

type TAnilibertyDescribe = {
  releaseId: number;
  title: string;
  titleOrig: string;
  poster: string | null;
  episodesTotal: number | null;
  blocked: boolean;
  episodes: TAnilibertyEpisode[];
};

const anilibertyFetch = async (
  path: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> => {
  try {
    return await fetchImpl(`${ANILIBERTY_API}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': ANILIBERTY_USER_AGENT }
    });
  } catch {
    throw new AnilibertyError('UPSTREAM', 'Aniliberty is unreachable');
  }
};

const absolutize = (src: string | null | undefined): string | null => {
  if (!src) return null;

  if (src.startsWith('http://') || src.startsWith('https://')) return src;

  if (src.startsWith('/')) return `${ANILIBERTY_SITE}${src}`;

  return null;
};

const zSearchItem = z
  .object({
    id: z.number(),
    name: z
      .object({
        main: z.string(),
        english: z.string().nullable().optional(),
        alternative: z.string().nullable().optional()
      })
      .partial()
      .optional(),
    year: z.number().nullable().optional(),
    poster: z
      .object({
        src: z.string().nullable().optional(),
        optimized: z
          .object({ src: z.string().nullable().optional() })
          .partial()
          .optional()
      })
      .partial()
      .optional(),
    episodes_total: z.number().nullable().optional()
  })
  .passthrough();

const anilibertySearch = async (
  query: string,
  limit: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TAnilibertySearchResult[]> => {
  const response = await anilibertyFetch(
    `/anime/catalog/releases?${new URLSearchParams({
      'f[search]': query,
      limit: String(limit)
    })}`,
    SEARCH_TIMEOUT_MS,
    fetchImpl
  );

  if (!response.ok) {
    throw new AnilibertyError('UPSTREAM', 'Aniliberty search failed');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new AnilibertyError(
      'UPSTREAM',
      'Aniliberty returned an invalid response'
    );
  }

  const items = (payload as { data?: unknown }).data;

  if (!Array.isArray(items)) {
    throw new AnilibertyError(
      'UPSTREAM',
      'Aniliberty returned an invalid response'
    );
  }

  const out: TAnilibertySearchResult[] = [];

  for (const raw of items) {
    const parsed = zSearchItem.safeParse(raw);

    if (!parsed.success) continue;

    const data = parsed.data;

    out.push({
      releaseId: data.id,
      title: data.name?.main ?? 'Без названия',
      titleOrig: data.name?.english ?? data.name?.alternative ?? '',
      year: data.year ?? null,
      poster: absolutize(data.poster?.optimized?.src ?? data.poster?.src),
      episodesTotal: data.episodes_total ?? null
    });
  }

  return out;
};

const zEpisode = z
  .object({
    ordinal: z.number(),
    name: z.string().nullable().optional(),
    duration: z.number().nullable().optional(),
    hls_480: z.string().nullable().optional(),
    hls_720: z.string().nullable().optional(),
    hls_1080: z.string().nullable().optional()
  })
  .passthrough();

const zRelease = z
  .object({
    id: z.number(),
    name: z
      .object({
        main: z.string(),
        english: z.string().nullable().optional(),
        alternative: z.string().nullable().optional()
      })
      .partial()
      .optional(),
    poster: z
      .object({
        src: z.string().nullable().optional(),
        optimized: z
          .object({ src: z.string().nullable().optional() })
          .partial()
          .optional()
      })
      .partial()
      .optional(),
    episodes_total: z.number().nullable().optional(),
    is_blocked_by_geo: z.boolean().optional(),
    is_blocked_by_copyrights: z.boolean().optional(),
    episodes: z.array(z.unknown()).optional()
  })
  .passthrough();

const anilibertyDescribe = async (
  releaseId: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TAnilibertyDescribe> => {
  const response = await anilibertyFetch(
    `/anime/releases/${releaseId}`,
    PAGE_TIMEOUT_MS,
    fetchImpl
  );

  if (response.status === 404) {
    throw new AnilibertyError('NOT_FOUND', 'Aniliberty title not found');
  }

  if (!response.ok) {
    throw new AnilibertyError('UPSTREAM', 'Aniliberty request failed');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new AnilibertyError(
      'UPSTREAM',
      'Aniliberty returned an invalid response'
    );
  }

  const data = (payload as { data?: unknown }).data;
  const parsed = zRelease.safeParse(data);

  if (!parsed.success) {
    throw new AnilibertyError(
      'UPSTREAM',
      'Aniliberty returned an invalid response'
    );
  }

  const release = parsed.data;
  const episodes: TAnilibertyEpisode[] = [];

  for (const raw of release.episodes ?? []) {
    const episode = zEpisode.safeParse(raw);

    if (!episode.success) continue;

    episodes.push({
      ordinal: episode.data.ordinal,
      name: episode.data.name ?? null,
      duration: episode.data.duration ?? 0,
      hls480: episode.data.hls_480 ?? null,
      hls720: episode.data.hls_720 ?? null,
      hls1080: episode.data.hls_1080 ?? null
    });
  }

  episodes.sort((a, b) => a.ordinal - b.ordinal);

  return {
    releaseId: release.id,
    title: release.name?.main ?? 'Без названия',
    titleOrig: release.name?.english ?? release.name?.alternative ?? '',
    poster: absolutize(release.poster?.optimized?.src ?? release.poster?.src),
    episodesTotal: release.episodes_total ?? null,
    blocked:
      release.is_blocked_by_geo === true ||
      release.is_blocked_by_copyrights === true,
    episodes
  };
};

// manifests are tiny and sessions are long: a one-time check that the
// playlist exists and is a playlist keeps dead titles out of the party
const verifyAnilibertyManifest = async (
  manifestUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<void> => {
  let response: Response;

  try {
    response = await fetchImpl(manifestUrl, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { 'User-Agent': ANILIBERTY_USER_AGENT }
    });
  } catch {
    throw new AnilibertyError('UPSTREAM', 'Aniliberty stream is unreachable');
  }

  if (!response.ok) {
    throw new AnilibertyError(
      'UNAVAILABLE',
      'Aniliberty episode is unavailable right now'
    );
  }

  const text = await response.text();

  if (!text.includes('#EXTM3U')) {
    throw new AnilibertyError(
      'UNAVAILABLE',
      'Aniliberty episode is unavailable right now'
    );
  }
};

// aniliberty failures map to caller-facing codes: missing stays 404,
// blocked or dead stays 400, everything upstream stays 500
const throwAnilibertyError = (error: unknown): never => {
  if (error instanceof AnilibertyError) {
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
  anilibertyDescribe,
  AnilibertyError,
  anilibertySearch,
  throwAnilibertyError,
  verifyAnilibertyManifest,
  type TAnilibertyDescribe,
  type TAnilibertyEpisode,
  type TAnilibertySearchResult
};
