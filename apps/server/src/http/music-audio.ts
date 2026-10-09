import http from 'http';
import { getUserByToken } from '../db/queries/users';
import {
  getYoutubeStreamUrl,
  invalidateYoutubeStreamUrl,
  YT_USER_AGENT
} from '../helpers/youtube';
import { logger } from '../logger';
import { sendJsonError } from './helpers';

// youtube signs stream urls to the server ip, so browsers on other networks
// get a 403: this endpoint pipes googlevideo bytes through the server with
// the listener's own session token. range requests are forwarded, so seeking
// works like a plain file.
const FORWARDED_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges'
];

const fetchUpstream = (streamUrl: string, range: string | null) =>
  fetch(streamUrl, {
    headers: {
      'User-Agent': YT_USER_AGENT,
      ...(range ? { Range: range } : {})
    }
  });

const pipeUpstream = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  upstream: Response
): Promise<void> => {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };

  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name);

    if (value) headers[name] = value;
  }

  res.writeHead(upstream.status, headers);

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();

  req.on('close', () => {
    reader.cancel().catch(() => undefined);
  });

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      if (!res.write(value)) {
        await new Promise<void>((resolve) => res.once('drain', resolve));
      }
    }
  } catch {
    // listener went away mid-stream, nothing to report
  } finally {
    reader.releaseLock();
    res.end();
  }
};

const musicAudioRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  { url }: { url: URL }
) => {
  const videoId = url.searchParams.get('videoId') ?? '';

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    sendJsonError(res, 404, 'Unknown track');
    return;
  }

  // <audio> cannot set headers, so the session token travels in the query
  // string, same as file access tokens
  const user = await getUserByToken(url.searchParams.get('token') ?? undefined);

  if (!user) {
    sendJsonError(res, 403, 'Forbidden');
    return;
  }

  let streamUrl: string;

  try {
    streamUrl = await getYoutubeStreamUrl(videoId);
  } catch (error) {
    logger.error(
      'Failed to resolve youtube audio for %s: %s',
      videoId,
      error instanceof Error ? error.message : String(error)
    );

    sendJsonError(res, 502, 'Audio source is unavailable');
    return;
  }

  const range = req.headers.range ?? null;
  let upstream: Response;

  try {
    upstream = await fetchUpstream(streamUrl, range);
  } catch {
    sendJsonError(res, 502, 'Audio source is unreachable');
    return;
  }

  // the cached url died between resolve and first byte: drop it and mint a
  // fresh one once before giving up
  if (upstream.status === 401 || upstream.status === 403) {
    invalidateYoutubeStreamUrl(videoId);

    try {
      streamUrl = await getYoutubeStreamUrl(videoId);
      upstream = await fetchUpstream(streamUrl, range);
    } catch {
      sendJsonError(res, 502, 'Audio source is unreachable');
      return;
    }
  }

  if (
    upstream.status !== 200 &&
    upstream.status !== 206 &&
    upstream.status !== 416
  ) {
    sendJsonError(res, 502, 'Audio source is unavailable');
    return;
  }

  await pipeUpstream(req, res, upstream);
};

export { musicAudioRouteHandler };
