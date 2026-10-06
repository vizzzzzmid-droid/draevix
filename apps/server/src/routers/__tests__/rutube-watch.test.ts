import type { TWatchState } from '@draevix/shared';
import { ServerEvents } from '@draevix/shared';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';
import { clearRutubeCache } from '../../helpers/rutube';
import { VoiceRuntime } from '../../runtimes/voice';
import { pubsub } from '../../utils/pubsub';

const VOICE_CHANNEL_ID = 2;
const VIDEO_ID = 'a97171b78dfe6a3bbaa3d1e808cdeb04';

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

const optionsPayload = {
  title: 'Rutube movie',
  author: { name: 'Rutube author' },
  duration: 3600000,
  thumbnail_url: 'https://cdn.example.com/thumb.jpg',
  video_balancer: {
    m3u8: 'https://bl.example.com/video_balancer.m3u8?token=abc'
  }
};

const realFetch = globalThis.fetch;

const stubRutubeApi = (status: number, payload: unknown = {}) => {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    if (String(input).includes('rutube.ru/api/play/options/')) {
      if (status === 200) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('nope', { status });
    }

    return realFetch(input, init);
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  clearRutubeCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('watch resolveRutube', () => {
  test('should resolve a full rutube link', async () => {
    stubRutubeApi(200, optionsPayload);
    const { caller } = await initTest(1);

    const result = await caller.voice.resolveRutube({
      input: `https://rutube.ru/video/${VIDEO_ID}/`
    });

    expect(result?.video).toMatchObject({
      videoId: VIDEO_ID,
      title: 'Rutube movie',
      authorName: 'Rutube author',
      durationSec: 3600
    });
  });

  test('should reject a non-rutube input', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.voice.resolveRutube({ input: 'hello there' })
    ).rejects.toThrow('Invalid Rutube link');
  });

  test('should map an upstream 404', async () => {
    stubRutubeApi(404);
    const { caller } = await initTest(1);

    await expect(
      caller.voice.resolveRutube({ input: VIDEO_ID })
    ).rejects.toThrow('Rutube video not found');
  });
});

describe('watch selectRutubeWatch', () => {
  test('should start a rutube watch party and publish it', async () => {
    stubRutubeApi(200, optionsPayload);
    const { runtime, caller } = await withVoiceChannel(1);
    const published: (TWatchState | undefined)[] = [];
    const subscription = collectWatchEvents((watch) => {
      published.push(watch);
    });

    try {
      await caller.voice.selectRutubeWatch({ videoId: VIDEO_ID });

      const { watch } = await caller.voice.getWatchState();

      expect(watch?.file).toBeNull();
      expect(watch).toMatchObject({
        rutube: {
          videoId: VIDEO_ID,
          title: 'Rutube movie',
          authorName: 'Rutube author',
          durationSec: 3600
        },
        playing: true,
        positionSec: 0,
        controllerUserId: 1
      });
      expect(typeof watch?.rutube?._accessToken).toBe('string');
      expect(published).toHaveLength(1);
      expect(published[0]?.rutube?.videoId).toBe(VIDEO_ID);
    } finally {
      subscription.unsubscribe();
      await runtime.destroy();
    }
  });

  test('should reject a malformed video id', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(
        caller.voice.selectRutubeWatch({ videoId: 'nope' })
      ).rejects.toThrow('Invalid Rutube video id');
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.voice.selectRutubeWatch({ videoId: VIDEO_ID })
    ).rejects.toThrow('User is not in a voice channel');
  });
});
