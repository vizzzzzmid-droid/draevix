import type { TMusicState } from '@draevix/shared';
import { ServerEvents } from '@draevix/shared';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';
import { VoiceRuntime } from '../../runtimes/voice';
import { pubsub } from '../../utils/pubsub';

const VOICE_CHANNEL_ID = 2;

const TRACK = {
  trackId: 417474360,
  title: 'Chill Study Beats',
  author: 'TestArtist',
  artworkUrl: 'https://i1.sndcdn.com/a-t500x500.jpg',
  durationSec: 7200,
  permalinkUrl: 'https://soundcloud.com/artist/chill-study-beats'
};

const withVoiceChannel = async (userId: number) => {
  const runtime = new VoiceRuntime(VOICE_CHANNEL_ID);
  const { caller } = await initTest(userId, undefined, {
    currentVoiceChannelId: VOICE_CHANNEL_ID
  });

  return { runtime, caller };
};

const collectMusicEvents = (
  onEvent: (music: TMusicState | undefined) => void
) => {
  return pubsub
    .subscribeForChannel(VOICE_CHANNEL_ID, ServerEvents.MUSIC_STATE_UPDATE)
    .subscribe({
      next: (payload) => {
        onEvent(payload.music);
      }
    });
};

const realFetch = globalThis.fetch;

const stubSoundCloud = () => {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);

    if (url === 'https://soundcloud.com') {
      return new Response(
        '<html><script src="/assets/app-1.js"></script></html>',
        { status: 200 }
      );
    }

    if (url.endsWith('.js')) {
      return new Response(`var x={client_id:"${'b'.repeat(32)}"};`, {
        status: 200
      });
    }

    if (url.includes('/search/tracks')) {
      return new Response(
        JSON.stringify({
          collection: [
            {
              id: 417474360,
              title: 'Chill Study Beats',
              permalink_url: 'https://soundcloud.com/artist/chill-study-beats',
              duration: 7200000,
              streamable: true,
              user: { username: 'TestArtist' }
            }
          ]
        }),
        { status: 200 }
      );
    }

    if (url.includes('/resolve?')) {
      return new Response(
        JSON.stringify({
          media: {
            transcodings: [
              {
                url: 'https://api-v2.soundcloud.com/media/progressive',
                format: { protocol: 'progressive' }
              }
            ]
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes('api-v2.soundcloud.com')) {
      return new Response(
        JSON.stringify({ url: 'https://cf-media.example.com/x.mp3' }),
        { status: 200 }
      );
    }

    if (url.includes('cf-media.example.com')) {
      return new Response('x', {
        status: 206,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    }

    return realFetch(input, init);
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  stubSoundCloud();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('watch musicSearch', () => {
  test('should return parsed results', async () => {
    const { caller } = await initTest(1);
    const { results } = await caller.voice.musicSearch({ query: 'lofi' });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      trackId: 417474360,
      title: 'Chill Study Beats'
    });
  });
});

describe('watch musicPlay', () => {
  test('should start a listening party and publish it', async () => {
    const { runtime, caller } = await withVoiceChannel(1);
    const published: (TMusicState | undefined)[] = [];
    const subscription = collectMusicEvents((music) => {
      published.push(music);
    });

    try {
      await caller.voice.musicPlay({ track: TRACK });

      const { music } = await caller.voice.getMusicState();

      expect(music).toMatchObject({
        current: {
          trackId: 417474360,
          title: 'Chill Study Beats',
          mp3Url: 'https://cf-media.example.com/x.mp3'
        },
        queue: [],
        playing: true,
        positionSec: 0,
        controllerUserId: 1
      });
      expect(published).toHaveLength(1);
      expect(published[0]?.current?.mp3Url).toBe(
        'https://cf-media.example.com/x.mp3'
      );
    } finally {
      subscription.unsubscribe();
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(caller.voice.musicPlay({ track: TRACK })).rejects.toThrow(
      'User is not in a voice channel'
    );
  });
});

describe('watch music queue', () => {
  test('should add, advance with the expect guard, and remove', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.musicPlay({ track: TRACK });
      await caller.voice.musicQueueAdd({
        track: { ...TRACK, trackId: 2, title: 'Second' }
      });

      let state = await caller.voice.getMusicState();

      expect(state.music?.queue).toHaveLength(1);

      // stale advancer (already moved on) is ignored
      await caller.voice.musicNext({ expectTrackId: 999 });

      state = await caller.voice.getMusicState();

      expect(state.music?.current?.trackId).toBe(417474360);

      await caller.voice.musicNext({ expectTrackId: 417474360 });

      state = await caller.voice.getMusicState();

      expect(state.music?.current?.trackId).toBe(2);
      expect(state.music?.queue).toHaveLength(0);

      // ending the queue clears the party
      await caller.voice.musicNext({ expectTrackId: 2 });

      state = await caller.voice.getMusicState();

      expect(state.music).toBeUndefined();
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse an out of range removal', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.musicPlay({ track: TRACK });

      await expect(caller.voice.musicQueueRemove({ index: 5 })).rejects.toThrow(
        'Queue entry not found'
      );
    } finally {
      await runtime.destroy();
    }
  });
});

describe('watch music controls', () => {
  test('should pause, resume, seek and stop', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.musicPlay({ track: TRACK });
      await caller.voice.musicPause({ positionSec: 10 });

      let state = await caller.voice.getMusicState();

      expect(state.music).toMatchObject({ playing: false, positionSec: 10 });

      await caller.voice.musicResume({ positionSec: 10 });

      state = await caller.voice.getMusicState();

      expect(state.music).toMatchObject({ playing: true, positionSec: 10 });

      await caller.voice.musicSeek({ positionSec: 20 });

      state = await caller.voice.getMusicState();

      expect(state.music).toMatchObject({ positionSec: 20 });

      await caller.voice.musicStop();

      state = await caller.voice.getMusicState();

      expect(state.music).toBeUndefined();
    } finally {
      await runtime.destroy();
    }
  });
});

describe('watch music repeat and shuffle', () => {
  test('should replay the track on repeat-one', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.musicPlay({ track: TRACK });
      await caller.voice.musicSetRepeat({ mode: 'one' });
      await caller.voice.musicNext({ expectTrackId: 417474360 });

      const { music } = await caller.voice.getMusicState();

      expect(music).toMatchObject({
        playing: true,
        positionSec: 0,
        repeatMode: 'one',
        current: { trackId: 417474360 }
      });
    } finally {
      await runtime.destroy();
    }
  });

  test('should wrap an empty queue on repeat-all', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.musicPlay({ track: TRACK });
      await caller.voice.musicSetRepeat({ mode: 'all' });
      await caller.voice.musicNext({ expectTrackId: 417474360 });

      const { music } = await caller.voice.getMusicState();

      expect(music?.current?.trackId).toBe(417474360);
      expect(music?.playing).toBe(true);
    } finally {
      await runtime.destroy();
    }
  });

  test('should pick a random queued track on shuffle', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.musicPlay({ track: TRACK });
      await caller.voice.musicQueueAdd({
        track: { ...TRACK, trackId: 2, title: 'Second' }
      });
      await caller.voice.musicQueueAdd({
        track: { ...TRACK, trackId: 3, title: 'Third' }
      });
      await caller.voice.musicSetShuffle({ shuffled: true });
      await caller.voice.musicNext({ expectTrackId: 417474360 });

      const { music } = await caller.voice.getMusicState();

      expect(music?.current?.trackId).toBeDefined();
      expect([2, 3]).toContain(music?.current?.trackId ?? -1);
      expect(music?.queue).toHaveLength(1);
      expect(music?.shuffle).toBe(true);
    } finally {
      await runtime.destroy();
    }
  });
});
