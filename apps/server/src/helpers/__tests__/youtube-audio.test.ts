import { describe, expect, test } from 'bun:test';
import { ensureYoutubeAudio } from '../youtube-audio';

const VIDEO_ID = 'dQw4w9WgXcQ';
// spans several 256kb download chunks
const BYTES = 'abc'.repeat(200_000);

const stubUpstream = (counter: { playerCalls: number; chunkCalls: number }) => {
  const stub: typeof fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);

    if (url.includes('/youtubei/v1/player')) {
      counter.playerCalls += 1;

      return new Response(
        JSON.stringify({
          playabilityStatus: { status: 'OK' },
          videoDetails: {
            videoId: VIDEO_ID,
            title: 'Cached',
            author: 'Author',
            lengthSeconds: '100'
          },
          streamingData: {
            adaptiveFormats: [
              {
                mimeType: 'audio/mp4',
                bitrate: 128000,
                url: `https://rr1---example.googlevideo.com/v?expire=${Math.floor(Date.now() / 1000) + 21600}`
              }
            ]
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes('googlevideo.com')) {
      counter.chunkCalls += 1;

      const headers = new Headers(init?.headers);
      const match = headers.get('range')?.match(/^bytes=(\d+)-(\d+)$/);

      if (!match) {
        return new Response('range required', { status: 416 });
      }

      const start = Number(match[1]);
      const end = Math.min(Number(match[2]), BYTES.length - 1);
      const slice = BYTES.slice(start, end + 1);

      return new Response(slice, {
        status: 206,
        headers: {
          'Content-Type': 'audio/mp4',
          'Content-Range': `bytes ${start}-${start + slice.length - 1}/${BYTES.length}`
        }
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;

  return stub;
};

describe('ensureYoutubeAudio', () => {
  test('assembles sequential chunks into a cached file', async () => {
    const counter = { playerCalls: 0, chunkCalls: 0 };

    const first = await ensureYoutubeAudio(VIDEO_ID, stubUpstream(counter));

    expect(first.size).toBe(BYTES.length);
    expect(first.mimeType).toBe('audio/mp4');
    expect(counter.playerCalls).toBe(1);
    expect(counter.chunkCalls).toBeGreaterThan(1);

    const file = Bun.file(first.filePath);
    expect(await file.text()).toBe(BYTES);

    // second call serves the disk cache without touching upstream
    const second = await ensureYoutubeAudio(VIDEO_ID, stubUpstream(counter));

    expect(second.filePath).toBe(first.filePath);
    expect(counter.playerCalls).toBe(1);
  });

  test('rejects malformed video ids without fetching', async () => {
    const counter = { playerCalls: 0, chunkCalls: 0 };

    await expect(
      ensureYoutubeAudio('nope', stubUpstream(counter))
    ).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    expect(counter.playerCalls).toBe(0);
  });
});
