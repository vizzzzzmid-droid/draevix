import http from 'http';
import { getUserByToken } from '../db/queries/users';
import { YouTubeError } from '../helpers/youtube';
import { ensureYoutubeAudio } from '../helpers/youtube-audio';
import { logger } from '../logger';
import { sendFile, sendJsonError } from './helpers';

// youtube only serves small sequential ranges to our network, so the server
// downloads every track once into a disk cache and serves listeners from it
// with full range support, like watch party files do.
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

  try {
    const audio = await ensureYoutubeAudio(videoId);

    await sendFile(req, res, audio.filePath, {
      cacheControl: 'public, max-age=31536000, immutable',
      contentType: audio.mimeType,
      contentDisposition: 'inline',
      notFoundMessage: 'Audio cache is missing'
    });
  } catch (error) {
    logger.error(
      'YouTube audio failed for %s: %s',
      videoId,
      error instanceof Error ? error.message : String(error)
    );

    if (error instanceof YouTubeError && error.kind === 'NOT_FOUND') {
      sendJsonError(res, 404, 'Unknown track');
      return;
    }

    sendJsonError(res, 502, 'Audio source is unavailable');
  }
};

export { musicAudioRouteHandler };
