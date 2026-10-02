import { Resolution, ScreenCursor } from '@/types';
import { StreamKind } from '@draevix/shared';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  buildDisplayMediaConstraints,
  isOwnProducerEvent,
  requestDisplayMedia,
  type TDisplayMediaInputs
} from '../helpers';

describe('isOwnProducerEvent', () => {
  test('should treat a producer with our own user id as ours', () => {
    expect(isOwnProducerEvent(1, 1, StreamKind.AUDIO)).toBe(true);
    expect(isOwnProducerEvent(1, 1, StreamKind.VIDEO)).toBe(true);
    expect(isOwnProducerEvent(1, 1, StreamKind.SCREEN)).toBe(true);
    expect(isOwnProducerEvent(1, 1, StreamKind.SCREEN_AUDIO)).toBe(true);
  });

  test('should treat another user as not ours', () => {
    expect(isOwnProducerEvent(2, 1, StreamKind.AUDIO)).toBe(false);
  });

  // the runtime hands out external stream ids from a counter starting at zero, so the
  // second stream in a channel is id 1, which is also the first user id. treating that as
  // our own producer drops the plugin's audio for exactly one unlucky listener
  test('should never treat an external stream as ours, even on an id collision', () => {
    expect(isOwnProducerEvent(1, 1, StreamKind.EXTERNAL_AUDIO)).toBe(false);
    expect(isOwnProducerEvent(1, 1, StreamKind.EXTERNAL_VIDEO)).toBe(false);
    expect(isOwnProducerEvent(0, 0, StreamKind.EXTERNAL_AUDIO)).toBe(false);
  });

  test('should treat nothing as ours before the own user id is known', () => {
    expect(isOwnProducerEvent(1, undefined, StreamKind.AUDIO)).toBe(false);
  });
});

describe('buildDisplayMediaConstraints', () => {
  const baseInputs: TDisplayMediaInputs = {
    source: 'screen',
    shareAudio: true,
    resolution: Resolution['720p'],
    framerate: 30,
    cursor: ScreenCursor.ALWAYS,
    restrictOwnAudio: true,
    suppressLocalAudioPlayback: false
  };

  test('should pin the tab surface for tab shares with audio on', () => {
    const constraints = buildDisplayMediaConstraints({
      ...baseInputs,
      source: 'tab'
    });

    expect(constraints.video).toMatchObject({
      displaySurface: { exact: 'browser' }
    });
    expect(constraints.audio).toMatchObject({ channelCount: 2 });
  });

  test('should pin the window surface and keep audio when asked', () => {
    const constraints = buildDisplayMediaConstraints({
      ...baseInputs,
      source: 'window'
    });

    expect(constraints.video).toMatchObject({
      displaySurface: { exact: 'window' }
    });
    expect(constraints.audio).toMatchObject({ sampleRate: 48000 });
  });

  test('should go video-only when system audio is off', () => {
    const constraints = buildDisplayMediaConstraints({
      ...baseInputs,
      source: 'screen',
      shareAudio: false
    });

    expect(constraints.video).toMatchObject({
      displaySurface: { exact: 'monitor' }
    });
    expect(constraints.audio).toBe(false);
  });

  test('should omit the experimental flags when they are off', () => {
    const constraints = buildDisplayMediaConstraints({
      ...baseInputs,
      restrictOwnAudio: false,
      suppressLocalAudioPlayback: false
    });

    expect(constraints.audio).toMatchObject({
      restrictOwnAudio: undefined,
      suppressLocalAudioPlayback: undefined
    });
  });
});

describe('requestDisplayMedia', () => {
  const stubMediaDevices = (getDisplayMedia: unknown) => {
    (globalThis as { navigator?: unknown }).navigator = {
      mediaDevices: { getDisplayMedia }
    };
  };

  afterEach(() => {
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  test('should return the stream when the first call succeeds', async () => {
    const stream = { id: 'stream' } as unknown as MediaStream;

    stubMediaDevices(async () => stream);

    await expect(
      requestDisplayMedia({ video: true, audio: false })
    ).resolves.toBe(stream);
  });

  test('should retry without the surface pin when it is rejected', async () => {
    const stream = { id: 'stream' } as unknown as MediaStream;
    const seen: MediaStreamConstraints[] = [];

    stubMediaDevices(async (constraints: MediaStreamConstraints) => {
      seen.push(constraints);

      if (seen.length === 1) {
        throw Object.assign(new Error('not supported'), {
          name: 'OverconstrainedError'
        });
      }

      return stream;
    });

    await expect(
      requestDisplayMedia({
        video: { displaySurface: { exact: 'window' } },
        audio: false
      })
    ).resolves.toBe(stream);

    expect(seen).toHaveLength(2);
    expect(seen[1]?.video).not.toHaveProperty('displaySurface');
  });

  test('should rethrow errors that are not about the surface pin', async () => {
    stubMediaDevices(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });

    await expect(
      requestDisplayMedia({ video: true, audio: false })
    ).rejects.toThrow('denied');
  });
});
