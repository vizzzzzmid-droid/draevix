import type { TWatchState } from '@draevix/shared';
import { ServerEvents } from '@draevix/shared';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';
import { clearKodikTokenCache } from '../../helpers/kodik';
import { VoiceRuntime } from '../../runtimes/voice';
import { pubsub } from '../../utils/pubsub';

const VOICE_CHANNEL_ID = 2;
const LINK =
  'https://kodikplayer.com/video/116675/81e1450ea02cd3c8466f57980af141c9/720p';
const SERIAL_LINK =
  'https://kodikplayer.com/serial/6646/4698b2bea53c04aa757d3d1ff42fea53/720p';

const encryptKodikToken = (token: string): string => {
  const first = Buffer.from(token.slice(0, 16), 'utf-8').toString('base64');
  const second = Buffer.from(token.slice(16), 'utf-8').toString('base64');

  return [...second].reverse().join('') + [...first].reverse().join('');
};

const withVoiceChannel = async (userId: number) => {
  const runtime = new VoiceRuntime(VOICE_CHANNEL_ID);
  const { caller } = await initTest(userId, undefined, {
    currentVoiceChannelId: VOICE_CHANNEL_ID
  });

  return { runtime, caller };
};

const collectWatchEvents = (
  onEvent: (watch: TWatchState | undefined) => void
) => {
  return pubsub
    .subscribeForChannel(VOICE_CHANNEL_ID, ServerEvents.WATCH_STATE_UPDATE)
    .subscribe({
      next: (payload) => {
        onEvent(payload.watch);
      }
    });
};

const EMBED_HTML = `<html><body>
<script src="/assets/js/app.1.js"></script>
<script>
.type = 'video';
.hash = '81e1450ea02cd3c8466f57980af141c9';
.id = '116675';
var urlParams = '{"d":"kodikplayer.com","d_sign":"a","pd":"kodikplayer.com","pd_sign":"b","ref_sign":"c"}';
</script>
</body></html>`;

const SERIAL_HTML = `<html><body>
<script src="/assets/js/app.1.js"></script>
<script>
.type = 'serial';
.hash = '4698b2bea53c04aa757d3d1ff42fea53';
.id = '6646';
var urlParams = '{"d":"kodikplayer.com","d_sign":"a","pd":"kodikplayer.com","pd_sign":"b","ref_sign":"c"}';
</script>
<select><option value="735" data-id="735" data-translation-type="voice" data-media-id="6646" data-media-hash="4698b2bea53c04aa757d3d1ff42fea53" data-media-type="serial" data-title="2x2" data-episode-count="220" selected="selected"></option></select>
<select><option value="1" data-id="1" data-hash="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" data-title="1 серия" data-other-translation="false"></option></select>
</body></html>`;

const PLAYER_JS = `$.ajax({"url": "XXXXXXXXXXXXXX${Buffer.from('/ftor').toString('base64')}", cache:!1});`;

const realFetch = globalThis.fetch;

const stubKodik = () => {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);

    if (url.includes('tokens.json')) {
      return new Response(
        JSON.stringify({
          stable: [{ tokn: encryptKodikToken('test-token-1234567890abcdef') }],
          unstable: []
        }),
        { status: 200 }
      );
    }

    if (url.includes('kodik-api.com/search')) {
      return new Response(
        JSON.stringify({
          total: 1,
          results: [
            {
              id: 'movie-1',
              type: 'anime',
              link: '//kodikplayer.com/video/116675/81e1450ea02cd3c8466f57980af141c9/720p',
              title: 'Test movie',
              title_orig: 'Test Movie',
              year: 2024,
              quality: 'BDRip 720p',
              blocked_countries: [],
              screenshots: [],
              translation: { id: 1, title: 'TestDub', type: 'voice' }
            }
          ]
        }),
        { status: 200 }
      );
    }

    if (url.includes('/assets/js/')) {
      return new Response(PLAYER_JS, { status: 200 });
    }

    if (url.endsWith('/ftor')) {
      return new Response(
        JSON.stringify({
          links: {
            '720': [
              {
                src: 'https://cloud.example.com/up/1/720.mp4:hls:manifest.m3u8'
              }
            ]
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes('/serial/')) {
      return new Response(SERIAL_HTML, { status: 200 });
    }

    if (url.includes('cloud.example.com')) {
      return new Response('x', {
        status: 206,
        headers: { 'Content-Type': 'video/mp4' }
      });
    }

    if (url.includes('kodikplayer.com/video/')) {
      return new Response(EMBED_HTML, { status: 200 });
    }

    return realFetch(input, init);
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  clearKodikTokenCache();
  stubKodik();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('watch kodikSearch', () => {
  test('should return parsed results', async () => {
    const { caller } = await initTest(1);
    const { results } = await caller.voice.kodikSearch({ query: 'Test' });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kodikId: 'movie-1',
      kind: 'video',
      title: 'Test movie'
    });
  });

  test('should reject an empty query', async () => {
    const { caller } = await initTest(1);

    await expect(caller.voice.kodikSearch({ query: '' })).rejects.toThrow();
  });
});

describe('watch kodikDescribe', () => {
  test('should list translations and episodes', async () => {
    const { caller } = await initTest(1);
    const described = await caller.voice.kodikDescribe({ link: SERIAL_LINK });

    expect(described.mediaType).toBe('serial');
    expect(described.translations).toHaveLength(1);
    expect(described.episodes).toHaveLength(1);
  });

  test('should refuse an invalid link', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.voice.kodikDescribe({ link: 'not a link' })
    ).rejects.toThrow('Invalid Kodik link');
  });
});

describe('watch kodikSelect', () => {
  test('should start a kodik watch party and publish it', async () => {
    const { runtime, caller } = await withVoiceChannel(1);
    const published: (TWatchState | undefined)[] = [];
    const subscription = collectWatchEvents((watch) => {
      published.push(watch);
    });

    try {
      await caller.voice.kodikSelect({
        link: LINK,
        kodikId: 'movie-1',
        title: 'Test movie'
      });

      const { watch } = await caller.voice.getWatchState();

      expect(watch?.file).toBeNull();
      expect(watch).toMatchObject({
        kodik: {
          kodikId: 'movie-1',
          title: 'Test movie',
          quality: 720,
          mp4Url: 'https://cloud.example.com/up/1/720.mp4'
        },
        playing: true,
        positionSec: 0,
        controllerUserId: 1
      });
      expect(published).toHaveLength(1);
      expect(published[0]?.kodik?.mp4Url).toContain('cloud.example.com');
    } finally {
      subscription.unsubscribe();
      await runtime.destroy();
    }
  });

  test('should refuse an invalid link', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(
        caller.voice.kodikSelect({
          link: 'https://example.com/x',
          kodikId: 'movie-1',
          title: 'Test movie'
        })
      ).rejects.toThrow('Invalid Kodik link');
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.voice.kodikSelect({
        link: LINK,
        kodikId: 'movie-1',
        title: 'Test movie'
      })
    ).rejects.toThrow('User is not in a voice channel');
  });

  test('should refuse a title whose file is dead', async () => {
    const stubbed = globalThis.fetch;
    const deadFetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = String(input);

      if (url.includes('cloud.example.com')) {
        return new Response('<h1>Not Found</h1>', {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        });
      }

      return stubbed(input, init);
    }) as unknown as typeof fetch;

    // swap the stub for one dead probe while keeping everything else
    globalThis.fetch = deadFetch;

    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(
        caller.voice.kodikSelect({
          link: LINK,
          kodikId: 'movie-1',
          title: 'Test movie'
        })
      ).rejects.toThrow('unavailable');
    } finally {
      globalThis.fetch = stubbed;
      await runtime.destroy();
    }
  });
});

describe('watch kodikRefresh', () => {
  test('should re-resolve urls keeping position and control', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.kodikSelect({
        link: LINK,
        kodikId: 'movie-1',
        title: 'Test movie'
      });
      await caller.voice.pauseWatch({ positionSec: 42 });
      await caller.voice.kodikRefresh();

      const { watch } = await caller.voice.getWatchState();

      expect(watch).toMatchObject({
        playing: false,
        positionSec: 42,
        controllerUserId: 1,
        kodik: { mp4Url: 'https://cloud.example.com/up/1/720.mp4' }
      });
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse without an active kodik party', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(caller.voice.kodikRefresh()).rejects.toThrow(
        'No active Kodik watch party'
      );
    } finally {
      await runtime.destroy();
    }
  });
});
