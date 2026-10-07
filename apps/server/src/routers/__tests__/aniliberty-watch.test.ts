import type { TWatchState } from '@draevix/shared';
import { ServerEvents } from '@draevix/shared';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';
import { VoiceRuntime } from '../../runtimes/voice';
import { pubsub } from '../../utils/pubsub';

const VOICE_CHANNEL_ID = 2;

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

const realFetch = globalThis.fetch;

const stubAniliberty = (releaseOverrides: Record<string, unknown> = {}) => {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);

    if (url.includes('/anime/catalog/releases')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 413,
              name: { main: 'Наруто Ураганные хроники' },
              year: 2007,
              poster: { optimized: { src: '/p/413.webp' } },
              episodes_total: 500
            }
          ]
        }),
        { status: 200 }
      );
    }

    if (url.includes('/anime/releases/413')) {
      return new Response(
        JSON.stringify({
          data: {
            id: 413,
            name: { main: 'Наруто Ураганные хроники' },
            poster: { optimized: { src: '/p/413.webp' } },
            episodes_total: 500,
            is_blocked_by_geo: false,
            episodes: [
              {
                ordinal: 1,
                name: 'Возвращение домой',
                duration: 1400,
                hls_480: 'https://cdn.example.com/1/480.m3u8',
                hls_720: 'https://cdn.example.com/1/720.m3u8',
                hls_1080: null
              }
            ],
            ...releaseOverrides
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes('cdn.example.com')) {
      return new Response('#EXTM3U\n', { status: 200 });
    }

    return realFetch(input, init);
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  stubAniliberty();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('watch anilibertySearch', () => {
  test('should return parsed results', async () => {
    const { caller } = await initTest(1);
    const { results } = await caller.voice.anilibertySearch({
      query: 'Наруто'
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      releaseId: 413,
      title: 'Наруто Ураганные хроники'
    });
  });
});

describe('watch anilibertyDescribe', () => {
  test('should return episodes', async () => {
    const { caller } = await initTest(1);
    const described = await caller.voice.anilibertyDescribe({
      releaseId: 413
    });

    expect(described.episodes).toHaveLength(1);
    expect(described.episodes[0]).toMatchObject({ ordinal: 1 });
  });
});

describe('watch anilibertySelect', () => {
  test('should start an aniliberty watch party and publish it', async () => {
    const { runtime, caller } = await withVoiceChannel(1);
    const published: (TWatchState | undefined)[] = [];
    const subscription = collectWatchEvents((watch) => {
      published.push(watch);
    });

    try {
      await caller.voice.anilibertySelect({ releaseId: 413, episode: 1 });

      const { watch } = await caller.voice.getWatchState();

      expect(watch?.file).toBeNull();
      expect(watch?.kodik).toBeNull();
      expect(watch).toMatchObject({
        aniliberty: {
          releaseId: 413,
          episode: 1,
          title: 'Наруто Ураганные хроники',
          hlsUrl: 'https://cdn.example.com/1/720.m3u8'
        },
        playing: true,
        positionSec: 0,
        controllerUserId: 1
      });
      expect(published).toHaveLength(1);
    } finally {
      subscription.unsubscribe();
      await runtime.destroy();
    }
  });

  test('should refuse a missing episode', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(
        caller.voice.anilibertySelect({ releaseId: 413, episode: 999 })
      ).rejects.toThrow('Episode not found');
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.voice.anilibertySelect({ releaseId: 413, episode: 1 })
    ).rejects.toThrow('User is not in a voice channel');
  });
});
