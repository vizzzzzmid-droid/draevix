import fs from 'node:fs';
import path from 'node:path';
import { DATA_PATH } from './paths';
import {
  getYoutubeStreamUrl,
  invalidateYoutubeStreamUrl,
  YouTubeError,
  YT_USER_AGENT
} from './youtube';

// youtube only serves small sequential ranges to our network: big or jumped
// ranges answer 403. so the server downloads every track once, sequentially
// in small chunks, and then serves listeners from disk with full range
// support, exactly like watch party files.
const MUSIC_AUDIO_CACHE_PATH = path.join(DATA_PATH, 'music-audio');
const CHUNK_BYTES = 256 * 1024;
const MAX_CACHE_BYTES = 512 * 1024 * 1024;
const MAX_TRACK_BYTES = 100 * 1024 * 1024;

type TCachedAudio = {
  filePath: string;
  mimeType: string;
  size: number;
};

const inFlight = new Map<string, Promise<TCachedAudio>>();

const binPath = (videoId: string): string =>
  path.join(MUSIC_AUDIO_CACHE_PATH, `${videoId}.bin`);

const metaPath = (videoId: string): string =>
  path.join(MUSIC_AUDIO_CACHE_PATH, `${videoId}.json`);

const ensureCacheDir = async (): Promise<void> => {
  await fs.promises.mkdir(MUSIC_AUDIO_CACHE_PATH, { recursive: true });
};

const readCached = async (videoId: string): Promise<TCachedAudio | null> => {
  try {
    const [raw, stat] = await Promise.all([
      fs.promises.readFile(metaPath(videoId), 'utf8'),
      fs.promises.stat(binPath(videoId))
    ]);

    const meta = JSON.parse(raw) as { mimeType?: unknown; size?: unknown };

    if (
      typeof meta.mimeType !== 'string' ||
      typeof meta.size !== 'number' ||
      stat.size !== meta.size
    ) {
      return null;
    }

    return {
      filePath: binPath(videoId),
      mimeType: meta.mimeType,
      size: meta.size
    };
  } catch {
    return null;
  }
};

// least-recently-used eviction by mtime, so the cache never grows past the cap
const enforceCap = async (): Promise<void> => {
  let entries: { name: string; size: number; mtimeMs: number }[];

  try {
    const names = await fs.promises.readdir(MUSIC_AUDIO_CACHE_PATH);

    entries = (
      await Promise.all(
        names
          .filter((name) => name.endsWith('.bin'))
          .map(async (name) => {
            const stat = await fs.promises.stat(
              path.join(MUSIC_AUDIO_CACHE_PATH, name)
            );

            return { name, size: stat.size, mtimeMs: stat.mtimeMs };
          })
      )
    ).sort((a, b) => a.mtimeMs - b.mtimeMs);
  } catch {
    return;
  }

  let total = entries.reduce((sum, entry) => sum + entry.size, 0);

  for (const entry of entries) {
    if (total <= MAX_CACHE_BYTES) break;

    const base = entry.name.slice(0, -'.bin'.length);

    await Promise.all([
      fs.promises.rm(path.join(MUSIC_AUDIO_CACHE_PATH, entry.name), {
        force: true
      }),
      fs.promises.rm(path.join(MUSIC_AUDIO_CACHE_PATH, `${base}.json`), {
        force: true
      })
    ]);

    total -= entry.size;
  }
};

const fetchChunk = async (
  streamUrl: string,
  start: number,
  end: number,
  fetchImpl: typeof fetch
): Promise<Response> =>
  fetchImpl(streamUrl, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      'User-Agent': YT_USER_AGENT,
      Range: `bytes=${start}-${end}`
    }
  });

const downloadAudio = async (
  videoId: string,
  fetchImpl: typeof fetch,
  retried: boolean
): Promise<TCachedAudio> => {
  await ensureCacheDir();

  const streamUrl = await getYoutubeStreamUrl(videoId, fetchImpl);
  const tmpPath = `${binPath(videoId)}.part`;
  const handle = await fs.promises.open(tmpPath, 'w');

  let total: number | null = null;
  let received = 0;
  let mimeType = 'audio/mp4';

  try {
    for (;;) {
      const end =
        total !== null
          ? Math.min(received + CHUNK_BYTES - 1, total - 1)
          : received + CHUNK_BYTES - 1;

      if (total !== null && received >= total) break;

      let response: Response;

      try {
        response = await fetchChunk(streamUrl, received, end, fetchImpl);
      } catch {
        throw new YouTubeError('UPSTREAM', 'YouTube download failed');
      }

      if (response.status === 401 || response.status === 403) {
        // the url died mid-download: mint a fresh one and restart once
        if (retried) {
          throw new YouTubeError('UPSTREAM', 'YouTube download was rejected');
        }

        invalidateYoutubeStreamUrl(videoId);
        await handle.close();
        await fs.promises.rm(tmpPath, { force: true });

        return await downloadAudio(videoId, fetchImpl, true);
      }

      if (response.status !== 200 && response.status !== 206) {
        throw new YouTubeError(
          'UPSTREAM',
          `YouTube download failed with status ${response.status}`
        );
      }

      const contentRange = response.headers.get('content-range');
      const match = contentRange?.match(/^bytes \d+-\d+\/(\d+)$/);

      if (match) {
        total = Number(match[1]);

        if (total > MAX_TRACK_BYTES) {
          throw new YouTubeError('UNAVAILABLE', 'This track is too large');
        }
      }

      const type = response.headers.get('content-type')?.split(';')[0]?.trim();

      if (type) mimeType = type;

      const chunk = Buffer.from(await response.arrayBuffer());

      if (chunk.length === 0) break;

      await handle.write(chunk);
      received += chunk.length;

      if (received > MAX_TRACK_BYTES) {
        throw new YouTubeError('UNAVAILABLE', 'This track is too large');
      }

      if (response.status === 200 || (total !== null && received >= total)) {
        break;
      }

      if (total === null && chunk.length < CHUNK_BYTES) break;
    }
  } finally {
    await handle.close();
  }

  if (received === 0) {
    await fs.promises.rm(tmpPath, { force: true });

    throw new YouTubeError('UPSTREAM', 'YouTube returned an empty file');
  }

  await fs.promises.writeFile(
    metaPath(videoId),
    JSON.stringify({ mimeType, size: received })
  );
  await fs.promises.rename(tmpPath, binPath(videoId));
  await enforceCap();

  return { filePath: binPath(videoId), mimeType, size: received };
};

const ensureYoutubeAudio = async (
  videoId: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<TCachedAudio> => {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new YouTubeError('NOT_FOUND', 'Invalid YouTube video');
  }

  const cached = await readCached(videoId);

  if (cached) return cached;

  const running = inFlight.get(videoId);

  if (running) return await running;

  const started = downloadAudio(videoId, fetchImpl, false);

  inFlight.set(videoId, started);

  try {
    return await started;
  } finally {
    inFlight.delete(videoId);
  }
};

export { ensureYoutubeAudio, MUSIC_AUDIO_CACHE_PATH };
