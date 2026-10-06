import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const RUTUBE_ID_RE = /^[0-9a-f]{32}$/i;

const RUTUBE_OPTIONS_URL = (videoId: string) =>
  `https://rutube.ru/api/play/options/${videoId}/?no_404=true`;

const RUTUBE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const META_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const BALANCER_FRESH_MS = 30 * 60 * 1000;
const OPTIONS_TIMEOUT_MS = 10_000;
const UPSTREAM_TIMEOUT_MS = 30_000;

type TRutubeMeta = {
  videoId: string;
  title: string;
  authorName: string;
  durationSec: number;
  thumbnailUrl: string | null;
  balancerUrl: string;
  resolvedAt: number;
};

type TRutubeVariantCache = {
  upstreamText: string;
  segmentUrls: string[];
  keyUrls: string[];
};

type TRutubeEntry = {
  meta: TRutubeMeta;
  masterText: string;
  variantUrls: string[];
  variants: Map<number, TRutubeVariantCache>;
};

class RutubeError extends Error {
  readonly kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM' | 'UPSTREAM_AUTH';

  constructor(
    kind: 'NOT_FOUND' | 'UNAVAILABLE' | 'UPSTREAM' | 'UPSTREAM_AUTH',
    message: string
  ) {
    super(message);
    this.kind = kind;
  }
}

// rutube ids show up as bare hashes, watch urls and embed urls. anything else
// is rejected so the id can be interpolated into upstream urls safely
const parseRutubeVideoId = (input: string): string | null => {
  const trimmed = input.trim();

  if (RUTUBE_ID_RE.test(trimmed)) return trimmed.toLowerCase();

  const match = trimmed.match(
    /rutube\.ru\/(?:video|play\/embed)\/([0-9a-f]{32})/i
  );

  if (match?.[1]) return match[1].toLowerCase();

  return null;
};

const zRutubeOptions = z
  .object({
    title: z.string().optional(),
    author: z.object({ name: z.string() }).partial().optional(),
    duration: z.number().optional(),
    thumbnail_url: z.string().optional(),
    video_balancer: z
      .union([
        z.string(),
        z
          .object({
            default: z.string().optional(),
            m3u8: z.string().optional()
          })
          .partial()
      ])
      .optional(),
    acl_access: z.unknown().optional()
  })
  .passthrough();

const isAccessDenied = (acl: unknown): boolean => {
  if (acl === false) return true;

  if (typeof acl === 'object' && acl !== null && 'allowed' in acl) {
    return (acl as { allowed?: unknown }).allowed === false;
  }

  return false;
};

const normalizeDurationSec = (raw: number | undefined): number => {
  if (!raw || !Number.isFinite(raw) || raw <= 0) return 0;

  // rutube reports milliseconds; anything above a week cannot be seconds
  const sec = raw > 604_800 ? raw / 1000 : raw;

  return Math.max(0, Math.round(sec));
};

const fetchRutubeMeta = async (
  videoId: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TRutubeMeta> => {
  let response: Response;

  try {
    response = await fetchImpl(RUTUBE_OPTIONS_URL(videoId), {
      signal: AbortSignal.timeout(OPTIONS_TIMEOUT_MS),
      headers: { 'User-Agent': RUTUBE_USER_AGENT }
    });
  } catch {
    throw new RutubeError('UPSTREAM', 'Rutube is unreachable');
  }

  if (response.status === 404) {
    throw new RutubeError('NOT_FOUND', 'Rutube video not found');
  }

  if (!response.ok) {
    throw new RutubeError('UPSTREAM', 'Rutube is unreachable');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new RutubeError('UPSTREAM', 'Rutube returned an invalid response');
  }

  const parsed = zRutubeOptions.safeParse(payload);

  if (!parsed.success) {
    throw new RutubeError('UPSTREAM', 'Rutube returned an invalid response');
  }

  const data = parsed.data;

  if (isAccessDenied(data.acl_access)) {
    throw new RutubeError('UNAVAILABLE', 'This Rutube video is not available');
  }

  const balancer =
    typeof data.video_balancer === 'string'
      ? data.video_balancer
      : (data.video_balancer?.m3u8 ?? data.video_balancer?.default ?? '');

  if (!balancer.startsWith('https://')) {
    throw new RutubeError('UNAVAILABLE', 'This Rutube video is not available');
  }

  return {
    videoId,
    title: data.title?.trim() || 'Rutube video',
    authorName: data.author?.name?.trim() || '',
    durationSec: normalizeDurationSec(data.duration),
    thumbnailUrl: data.thumbnail_url || null,
    balancerUrl: balancer,
    resolvedAt: Date.now()
  };
};

const entries = new Map<string, TRutubeEntry>();

// metadata for resolve/select routes: cheap, balancer staleness harmless
const getRutubeMeta = async (
  videoId: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TRutubeMeta> => {
  const cached = entries.get(videoId);

  if (cached && Date.now() - cached.meta.resolvedAt < META_CACHE_TTL_MS) {
    return cached.meta;
  }

  const meta = await fetchRutubeMeta(videoId, fetchImpl);
  const entry = entries.get(videoId);

  if (entry) {
    entry.meta = meta;
  } else {
    entries.set(videoId, {
      meta,
      masterText: '',
      variantUrls: [],
      variants: new Map()
    });
  }

  return meta;
};

const loadMaster = async (
  videoId: string,
  meta: TRutubeMeta,
  fetchImpl: typeof fetch
): Promise<TRutubeEntry> => {
  const text = await fetchUpstreamText(meta.balancerUrl, fetchImpl);
  const { variantUrls } = rewriteMasterPlaylist(
    text,
    meta.balancerUrl,
    () => ''
  );
  const entry: TRutubeEntry = {
    meta,
    masterText: text,
    variantUrls,
    variants: new Map()
  };

  entries.set(videoId, entry);

  return entry;
};

const ensureMasterLoaded = async (
  videoId: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TRutubeEntry> => {
  const cached = entries.get(videoId);
  const fresh =
    cached &&
    cached.masterText !== '' &&
    Date.now() - cached.meta.resolvedAt < BALANCER_FRESH_MS;

  if (fresh) return cached;

  try {
    const meta = await fetchRutubeMeta(videoId, fetchImpl);

    return await loadMaster(videoId, meta, fetchImpl);
  } catch (error) {
    // a just-resolved balancer answering auth means the link died between the
    // two calls: resolve once more before giving up
    if (error instanceof RutubeError && error.kind === 'UPSTREAM_AUTH') {
      const meta = await fetchRutubeMeta(videoId, fetchImpl);

      return await loadMaster(videoId, meta, fetchImpl);
    }

    throw error;
  }
};

const ensureVariantLoaded = async (
  videoId: string,
  variantIndex: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<{ entry: TRutubeEntry; variant: TRutubeVariantCache }> => {
  const entry = await ensureMasterLoaded(videoId, fetchImpl);

  if (
    !Number.isInteger(variantIndex) ||
    variantIndex < 0 ||
    variantIndex >= entry.variantUrls.length
  ) {
    throw new RutubeError('NOT_FOUND', 'Rutube quality not found');
  }

  const cached = entry.variants.get(variantIndex);

  if (cached) return { entry, variant: cached };

  const variantUrl = entry.variantUrls[variantIndex]!;

  try {
    const text = await fetchUpstreamText(variantUrl, fetchImpl);
    const rewritten = rewriteVariantPlaylist(
      text,
      variantUrl,
      () => '',
      () => ''
    );
    const variant: TRutubeVariantCache = {
      upstreamText: text,
      segmentUrls: rewritten.segmentUrls,
      keyUrls: rewritten.keyUrls
    };

    entry.variants.set(variantIndex, variant);

    return { entry, variant };
  } catch (error) {
    if (error instanceof RutubeError && error.kind === 'UPSTREAM_AUTH') {
      entries.delete(videoId);

      const fresh = await ensureMasterLoaded(videoId, fetchImpl);

      if (variantIndex >= fresh.variantUrls.length) {
        throw new RutubeError('NOT_FOUND', 'Rutube quality not found');
      }

      const text = await fetchUpstreamText(
        fresh.variantUrls[variantIndex]!,
        fetchImpl
      );
      const rewritten = rewriteVariantPlaylist(
        text,
        fresh.variantUrls[variantIndex]!,
        () => '',
        () => ''
      );
      const variant: TRutubeVariantCache = {
        upstreamText: text,
        segmentUrls: rewritten.segmentUrls,
        keyUrls: rewritten.keyUrls
      };

      fresh.variants.set(variantIndex, variant);

      return { entry: fresh, variant };
    }

    throw error;
  }
};

const fetchUpstreamText = async (
  url: string,
  fetchImpl: typeof fetch
): Promise<string> => {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { 'User-Agent': RUTUBE_USER_AGENT }
    });
  } catch {
    throw new RutubeError('UPSTREAM', 'Rutube stream is unreachable');
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 410
  ) {
    throw new RutubeError(
      'UPSTREAM_AUTH',
      'Rutube stream link expired or was revoked'
    );
  }

  if (!response.ok) {
    throw new RutubeError('UPSTREAM', 'Rutube stream is unreachable');
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('text/html')) {
    throw new RutubeError('UPSTREAM', 'Rutube returned an error page');
  }

  return await response.text();
};

const fetchUpstreamBytes = async (
  url: string,
  fetchImpl: typeof fetch
): Promise<{ bytes: Uint8Array; contentType: string }> => {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { 'User-Agent': RUTUBE_USER_AGENT }
    });
  } catch {
    throw new RutubeError('UPSTREAM', 'Rutube stream is unreachable');
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 410
  ) {
    throw new RutubeError(
      'UPSTREAM_AUTH',
      'Rutube stream link expired or was revoked'
    );
  }

  if (!response.ok) {
    throw new RutubeError('UPSTREAM', 'Rutube stream is unreachable');
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('text/html')) {
    throw new RutubeError('UPSTREAM', 'Rutube returned an error page');
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: contentType || 'application/octet-stream'
  };
};

const resolveUrl = (uri: string, baseUrl: string): string | null => {
  try {
    const resolved = new URL(uri, baseUrl);

    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      return null;
    }

    return resolved.toString();
  } catch {
    return null;
  }
};

// every rewritten playlist keeps all non-uri lines byte-for-byte, so codecs,
// timing and discontinuity markers survive the proxy untouched
const rewriteMasterPlaylist = (
  text: string,
  baseUrl: string,
  buildVariantUrl: (index: number) => string
): { text: string; variantUrls: string[] } => {
  const lines = text.split(/\r?\n/);
  const variantUrls: string[] = [];
  const out: string[] = [];
  let expectVariant = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
      expectVariant = true;
      out.push(line);
      continue;
    }

    if (expectVariant && trimmed !== '' && !trimmed.startsWith('#')) {
      const resolved = resolveUrl(trimmed, baseUrl);

      if (resolved) {
        const index = variantUrls.length;

        variantUrls.push(resolved);
        out.push(buildVariantUrl(index));
      } else {
        out.push(line);
      }

      expectVariant = false;
      continue;
    }

    if (trimmed.startsWith('#')) expectVariant = false;

    out.push(line);
  }

  return { text: out.join('\n'), variantUrls };
};

const rewriteUriAttribute = (
  line: string,
  baseUrl: string,
  collect: (resolved: string) => string
): string => {
  return line.replace(/URI="([^"]*)"/, (whole, uri: string) => {
    const resolved = resolveUrl(uri, baseUrl);

    if (!resolved) return whole;

    return `URI="${collect(resolved)}"`;
  });
};

const rewriteVariantPlaylist = (
  text: string,
  baseUrl: string,
  buildSegmentUrl: (index: number) => string,
  buildKeyUrl: (index: number) => string
): { text: string; segmentUrls: string[]; keyUrls: string[] } => {
  const lines = text.split(/\r?\n/);
  const segmentUrls: string[] = [];
  const keyUrls: string[] = [];
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MAP')) {
      out.push(
        rewriteUriAttribute(line, baseUrl, (resolved) => {
          const index = keyUrls.length;

          keyUrls.push(resolved);

          return buildKeyUrl(index);
        })
      );
      continue;
    }

    if (trimmed !== '' && !trimmed.startsWith('#')) {
      const resolved = resolveUrl(trimmed, baseUrl);

      if (resolved) {
        const index = segmentUrls.length;

        segmentUrls.push(resolved);
        out.push(buildSegmentUrl(index));
      } else {
        out.push(line);
      }
      continue;
    }

    out.push(line);
  }

  return { text: out.join('\n'), segmentUrls, keyUrls };
};

// the cached upstream text is rewritten with fresh proxy urls on every serve,
// so rotating per-session tokens never go stale inside the cache
const getMasterPlaylist = async (
  videoId: string,
  buildVariantUrl: (index: number) => string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> => {
  const entry = await ensureMasterLoaded(videoId, fetchImpl);

  return rewriteMasterPlaylist(
    entry.masterText,
    entry.meta.balancerUrl,
    buildVariantUrl
  ).text;
};

const getVariantPlaylist = async (
  videoId: string,
  variantIndex: number,
  buildSegmentUrl: (index: number) => string,
  buildKeyUrl: (index: number) => string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<{ text: string; segmentUrls: string[]; keyUrls: string[] }> => {
  const { entry, variant } = await ensureVariantLoaded(
    videoId,
    variantIndex,
    fetchImpl
  );
  const variantUrl = entry.variantUrls[variantIndex]!;
  const rewritten = rewriteVariantPlaylist(
    variant.upstreamText,
    variantUrl,
    buildSegmentUrl,
    buildKeyUrl
  );

  variant.segmentUrls = rewritten.segmentUrls;
  variant.keyUrls = rewritten.keyUrls;

  return rewritten;
};

const resolveSegmentUrl = async (
  videoId: string,
  variantIndex: number,
  segmentIndex: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> => {
  const { variant } = await ensureVariantLoaded(
    videoId,
    variantIndex,
    fetchImpl
  );

  if (
    !Number.isInteger(segmentIndex) ||
    segmentIndex < 0 ||
    segmentIndex >= variant.segmentUrls.length
  ) {
    throw new RutubeError('NOT_FOUND', 'Rutube segment not found');
  }

  return variant.segmentUrls[segmentIndex]!;
};

const resolveKeyUrl = async (
  videoId: string,
  variantIndex: number,
  keyIndex: number,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> => {
  const { variant } = await ensureVariantLoaded(
    videoId,
    variantIndex,
    fetchImpl
  );

  if (
    !Number.isInteger(keyIndex) ||
    keyIndex < 0 ||
    keyIndex >= variant.keyUrls.length
  ) {
    throw new RutubeError('NOT_FOUND', 'Rutube key not found');
  }

  return variant.keyUrls[keyIndex]!;
};

const clearRutubeCache = (videoId?: string): void => {
  if (videoId) {
    entries.delete(videoId);
    return;
  }

  entries.clear();
};

// rutube failures map to caller-facing codes: missing stays 404, private or
// region-blocked stays 400, everything upstream stays 500
const throwRutubeError = (error: unknown): never => {
  if (error instanceof RutubeError) {
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
  BALANCER_FRESH_MS,
  clearRutubeCache,
  ensureMasterLoaded,
  ensureVariantLoaded,
  fetchRutubeMeta,
  fetchUpstreamBytes,
  fetchUpstreamText,
  getMasterPlaylist,
  getRutubeMeta,
  getVariantPlaylist,
  isAccessDenied,
  META_CACHE_TTL_MS,
  normalizeDurationSec,
  parseRutubeVideoId,
  resolveKeyUrl,
  resolveSegmentUrl,
  resolveUrl,
  rewriteMasterPlaylist,
  rewriteVariantPlaylist,
  RUTUBE_ID_RE,
  RutubeError,
  throwRutubeError,
  type TRutubeEntry,
  type TRutubeMeta
};
