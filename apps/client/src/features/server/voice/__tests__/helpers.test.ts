import type { TWatchState } from '@draevix/shared';
import { describe, expect, test } from 'bun:test';
import { getWatchPositionSec } from '../helpers';

const baseWatch: TWatchState = {
  file: {
    id: 1,
    name: 'movie.mp4',
    originalName: 'movie.mp4',
    mimeType: 'video/mp4'
  },
  playing: true,
  positionSec: 100,
  updatedAt: 1_000_000,
  controllerUserId: 1,
  kodik: null
};

describe('getWatchPositionSec', () => {
  test('should freeze the position while paused', () => {
    expect(
      getWatchPositionSec({ ...baseWatch, playing: false }, 1_030_000)
    ).toBe(100);
  });

  test('should extrapolate the position while playing', () => {
    expect(getWatchPositionSec(baseWatch, 1_010_000)).toBe(110);
  });

  test('should start from the stored position at the update moment', () => {
    expect(getWatchPositionSec(baseWatch, 1_000_000)).toBe(100);
  });
});
