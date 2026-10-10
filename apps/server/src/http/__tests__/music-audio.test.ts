import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { login } from '../../__tests__/helpers';
import { testsBaseUrl } from '../../__tests__/setup';

const VIDEO_ID = 'aBcDeFgHiJk';
const BYTES = 'hello-audio-bytes';

const realFetch = globalThis.fetch;

// player answers with a signed url, googlevideo serves bytes honoring ranges
const stubYoutubeUpstream = () => {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);

    if (url.includes('/youtubei/v1/player')) {
      const body = JSON.parse(String(init?.body)) as { videoId: string };

      return new Response(
        JSON.stringify({
          playabilityStatus: { status: 'OK' },
          videoDetails: {
            videoId: body.videoId,
            title: 'Never Gonna Give You Up',
            author: 'Rick Astley',
            lengthSeconds: String(BYTES.length)
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
      const headers = new Headers(init?.headers);
      const range = headers.get('range');
      const match = range?.match(/^bytes=(\d*)-(\d*)$/);

      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : BYTES.length - 1;
        const slice = BYTES.slice(start, end + 1);

        return new Response(slice, {
          status: 206,
          headers: {
            'Content-Type': 'audio/mp4',
            'Content-Range': `bytes ${start}-${start + slice.length - 1}/${BYTES.length}`,
            'Content-Length': String(slice.length)
          }
        });
      }

      return new Response(BYTES, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mp4',
          'Content-Length': String(BYTES.length)
        }
      });
    }

    return realFetch(input, init);
  }) as unknown as typeof fetch;
};

const getToken = async (): Promise<string> => {
  const response = await login('testowner', 'password123');
  const data = (await response.json()) as { token: string };

  return data.token;
};

beforeEach(() => {
  stubYoutubeUpstream();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('/music-audio', () => {
  test('streams bytes with a valid token, forwarding ranges', async () => {
    const token = await getToken();

    const response = await fetch(
      `${testsBaseUrl}/music-audio?videoId=${VIDEO_ID}&token=${token}`,
      { headers: { Range: 'bytes=0-4' } }
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('audio/mp4');
    expect(response.headers.get('content-range')).toBe(
      `bytes 0-4/${BYTES.length}`
    );
    expect(await response.text()).toBe(BYTES.slice(0, 5));
  });

  test('rejects requests without a token', async () => {
    const response = await fetch(
      `${testsBaseUrl}/music-audio?videoId=${VIDEO_ID}`
    );

    expect(response.status).toBe(403);
  });

  test('rejects malformed video ids', async () => {
    const token = await getToken();

    const response = await fetch(
      `${testsBaseUrl}/music-audio?videoId=nope&token=${token}`
    );

    expect(response.status).toBe(404);
  });
});
