import http from 'http';
import {
  fetchUpstreamBytes,
  getMasterPlaylist,
  getVariantPlaylist,
  resolveKeyUrl,
  resolveSegmentUrl,
  RUTUBE_ID_RE,
  RutubeError
} from '../helpers/rutube';
import { verifyRutubeToken } from '../helpers/rutube-crypto';
import { logger } from '../logger';
import { sendJsonError } from './helpers';

type TRutubeAuth = {
  videoId: string;
  accessToken: string;
  expiresAt: number;
};

// every proxied url carries the watch token, so playlist and segment pulls
// authenticate exactly like the initial master request
const buildProxyUrl = (
  path: string,
  auth: TRutubeAuth,
  extra: Record<string, number> = {}
): string => {
  const params = new URLSearchParams({
    videoId: auth.videoId,
    accessToken: auth.accessToken,
    expires: String(auth.expiresAt)
  });

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, String(value));
  }

  return `/rutube/${path}?${params.toString()}`;
};

const readAuth = (url: URL): TRutubeAuth | null => {
  const videoId = url.searchParams.get('videoId') ?? '';
  const accessToken = url.searchParams.get('accessToken') ?? '';
  const expiresAt = Number(url.searchParams.get('expires'));

  if (!RUTUBE_ID_RE.test(videoId)) return null;

  if (!accessToken || !Number.isFinite(expiresAt)) return null;

  if (!verifyRutubeToken(videoId, accessToken, expiresAt)) return null;

  return { videoId, accessToken, expiresAt };
};

const readIndex = (url: URL, name: string): number | null => {
  const raw = url.searchParams.get(name);

  if (raw === null || raw === '') return null;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
    return null;
  }

  return parsed;
};

const sendRutubeError = (
  res: http.ServerResponse,
  videoId: string,
  error: unknown
): void => {
  if (error instanceof RutubeError) {
    if (error.kind === 'NOT_FOUND') {
      sendJsonError(res, 404, error.message);
      return;
    }

    if (error.kind === 'UNAVAILABLE') {
      sendJsonError(res, 410, error.message);
      return;
    }

    logger.warn('Rutube upstream error for %s: %s', videoId, error.message);
    sendJsonError(res, 502, 'Rutube stream is unreachable');
    return;
  }

  logger.error(
    'Rutube proxy error for %s: %s',
    videoId,
    error instanceof Error ? error.message : String(error)
  );
  sendJsonError(res, 500, 'Internal server error');
};

const sendPlaylist = (res: http.ServerResponse, text: string): void => {
  const body = Buffer.from(text, 'utf-8');

  res.writeHead(200, {
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
};

const sendBytes = (
  res: http.ServerResponse,
  bytes: Uint8Array,
  contentType: string
): void => {
  const body = Buffer.from(bytes);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    // segments and keys are immutable once published
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  res.end(body);
};

const rutubeRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  { url }: { url: URL }
): Promise<void> => {
  const auth = readAuth(url);

  if (!auth) {
    sendJsonError(res, 403, 'Forbidden');
    return;
  }

  try {
    if (url.pathname === '/rutube/master.m3u8') {
      const text = await getMasterPlaylist(auth.videoId, (index) =>
        buildProxyUrl('variant.m3u8', auth, { v: index })
      );

      sendPlaylist(res, text);
      return;
    }

    if (url.pathname === '/rutube/variant.m3u8') {
      const variantIndex = readIndex(url, 'v');

      if (variantIndex === null) {
        sendJsonError(res, 400, 'Bad request');
        return;
      }

      const { text } = await getVariantPlaylist(
        auth.videoId,
        variantIndex,
        (index) =>
          buildProxyUrl('segment', auth, { v: variantIndex, s: index }),
        (index) => buildProxyUrl('key', auth, { v: variantIndex, k: index })
      );

      sendPlaylist(res, text);
      return;
    }

    if (url.pathname === '/rutube/segment') {
      const variantIndex = readIndex(url, 'v');
      const segmentIndex = readIndex(url, 's');

      if (variantIndex === null || segmentIndex === null) {
        sendJsonError(res, 400, 'Bad request');
        return;
      }

      const upstreamUrl = await resolveSegmentUrl(
        auth.videoId,
        variantIndex,
        segmentIndex
      );
      const { bytes, contentType } = await fetchUpstreamBytes(
        upstreamUrl,
        globalThis.fetch
      );

      sendBytes(res, bytes, contentType);
      return;
    }

    if (url.pathname === '/rutube/key') {
      const variantIndex = readIndex(url, 'v');
      const keyIndex = readIndex(url, 'k');

      if (variantIndex === null || keyIndex === null) {
        sendJsonError(res, 400, 'Bad request');
        return;
      }

      const upstreamUrl = await resolveKeyUrl(
        auth.videoId,
        variantIndex,
        keyIndex
      );
      const { bytes, contentType } = await fetchUpstreamBytes(
        upstreamUrl,
        globalThis.fetch
      );

      sendBytes(res, bytes, contentType);
      return;
    }

    sendJsonError(res, 404, 'Not found');
  } catch (error) {
    sendRutubeError(res, auth.videoId, error);
  }
};

export { rutubeRouteHandler };
