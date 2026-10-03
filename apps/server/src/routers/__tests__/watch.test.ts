import { Permission, ServerEvents, type TWatchState } from '@draevix/shared';
import { describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { files, rolePermissions, roles } from '../../db/schema';
import { VoiceRuntime } from '../../runtimes/voice';
import { pubsub } from '../../utils/pubsub';

const VOICE_CHANNEL_ID = 2;

// seeded files: 1 watch-movie.mp4 (video, message 1, visible),
// 2 watch-note.txt (text, message 1), 3 watch-dm-movie.mp4 (video, DM message)
const MOVIE_FILE_ID = 1;
const NOTE_FILE_ID = 2;
const DM_MOVIE_FILE_ID = 3;

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

describe('watch getWatchState', () => {
  test('should return nothing when no watch party is active', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      const { watch } = await caller.voice.getWatchState();

      expect(watch).toBeUndefined();
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(caller.voice.getWatchState()).rejects.toThrow(
      'User is not in a voice channel'
    );
  });

  test('should refuse without the global voice permission', async () => {
    const defaultRole = await tdb
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isDefault, true))
      .get();

    await tdb
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, defaultRole!.id),
          eq(rolePermissions.permission, Permission.JOIN_VOICE_CHANNELS)
        )
      )
      .execute();

    const { caller } = await initTest(2, undefined, {
      currentVoiceChannelId: VOICE_CHANNEL_ID
    });

    await expect(caller.voice.getWatchState()).rejects.toThrow(
      'Insufficient permissions'
    );
  });
});

describe('watch selectWatchFile', () => {
  test('should start a watch party and publish it', async () => {
    const { runtime, caller } = await withVoiceChannel(1);
    const published: (TWatchState | undefined)[] = [];
    const subscription = collectWatchEvents((watch) => {
      published.push(watch);
    });

    try {
      await caller.voice.selectWatchFile({ fileId: MOVIE_FILE_ID });

      const { watch } = await caller.voice.getWatchState();

      expect(watch).toMatchObject({
        file: { id: MOVIE_FILE_ID, originalName: 'movie.mp4' },
        playing: true,
        positionSec: 0,
        controllerUserId: 1
      });
      expect(typeof watch?.updatedAt).toBe('number');
      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({
        file: { id: MOVIE_FILE_ID },
        playing: true,
        controllerUserId: 1
      });
    } finally {
      subscription.unsubscribe();
      await runtime.destroy();
    }
  });

  test('should refuse a file that does not exist', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(
        caller.voice.selectWatchFile({ fileId: 999999 })
      ).rejects.toThrow('File not found');
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse a file that is not a video', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(
        caller.voice.selectWatchFile({ fileId: NOTE_FILE_ID })
      ).rejects.toThrow('Only video files can be watched together');
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse a file from chat the caller cannot see', async () => {
    const { runtime, caller } = await withVoiceChannel(2);

    try {
      await expect(
        caller.voice.selectWatchFile({ fileId: DM_MOVIE_FILE_ID })
      ).rejects.toThrow('File not found');
    } finally {
      await runtime.destroy();
    }
  });

  test('should accept the caller own upload without a message link', async () => {
    const now = Date.now();
    const [ownUpload] = await tdb
      .insert(files)
      .values({
        name: `own-upload-${now}.mp4`,
        originalName: 'own-upload.mp4',
        md5: 'own-upload',
        userId: 1,
        size: 1024,
        mimeType: 'video/mp4',
        extension: '.mp4',
        createdAt: now
      })
      .returning();

    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.selectWatchFile({ fileId: ownUpload!.id });

      const { watch } = await caller.voice.getWatchState();

      expect(watch).toMatchObject({
        file: { id: ownUpload!.id },
        controllerUserId: 1
      });
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse another user upload without a message link', async () => {
    const now = Date.now();
    const [foreignUpload] = await tdb
      .insert(files)
      .values({
        name: `foreign-upload-${now}.mp4`,
        originalName: 'foreign-upload.mp4',
        md5: 'foreign-upload',
        userId: 2,
        size: 1024,
        mimeType: 'video/mp4',
        extension: '.mp4',
        createdAt: now
      })
      .returning();

    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(
        caller.voice.selectWatchFile({ fileId: foreignUpload!.id })
      ).rejects.toThrow('File not found');
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.voice.selectWatchFile({ fileId: MOVIE_FILE_ID })
    ).rejects.toThrow('User is not in a voice channel');
  });

  test('should reject an invalid file id', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(caller.voice.selectWatchFile({ fileId: 0 })).rejects.toThrow(
        'fileId'
      );
    } finally {
      await runtime.destroy();
    }
  });
});

describe('watch playWatch', () => {
  test('should resume from the given position and take over control', async () => {
    const { runtime, caller } = await withVoiceChannel(1);
    const { caller: secondCaller } = await initTest(2, undefined, {
      currentVoiceChannelId: VOICE_CHANNEL_ID
    });

    try {
      await caller.voice.selectWatchFile({ fileId: MOVIE_FILE_ID });
      await caller.voice.pauseWatch({ positionSec: 10 });

      await secondCaller.voice.playWatch({ positionSec: 10 });

      const { watch } = await caller.voice.getWatchState();

      expect(watch).toMatchObject({
        playing: true,
        positionSec: 10,
        controllerUserId: 2
      });
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when no watch party is active', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(caller.voice.playWatch({ positionSec: 0 })).rejects.toThrow(
        'No active watch party'
      );
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(caller.voice.playWatch({ positionSec: 0 })).rejects.toThrow(
      'User is not in a voice channel'
    );
  });

  test('should reject a negative position', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(caller.voice.playWatch({ positionSec: -5 })).rejects.toThrow(
        'positionSec'
      );
    } finally {
      await runtime.destroy();
    }
  });
});

describe('watch pauseWatch', () => {
  test('should store the pause position and take over control', async () => {
    const { runtime, caller } = await withVoiceChannel(1);
    const { caller: secondCaller } = await initTest(2, undefined, {
      currentVoiceChannelId: VOICE_CHANNEL_ID
    });
    const published: (TWatchState | undefined)[] = [];
    const subscription = collectWatchEvents((watch) => {
      published.push(watch);
    });

    try {
      await caller.voice.selectWatchFile({ fileId: MOVIE_FILE_ID });

      await secondCaller.voice.pauseWatch({ positionSec: 42.5 });

      const { watch } = await caller.voice.getWatchState();

      expect(watch).toMatchObject({
        playing: false,
        positionSec: 42.5,
        controllerUserId: 2
      });
      expect(published.at(-1)).toMatchObject({
        playing: false,
        positionSec: 42.5
      });
    } finally {
      subscription.unsubscribe();
      await runtime.destroy();
    }
  });

  test('should refuse when no watch party is active', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(caller.voice.pauseWatch({ positionSec: 0 })).rejects.toThrow(
        'No active watch party'
      );
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(caller.voice.pauseWatch({ positionSec: 0 })).rejects.toThrow(
      'User is not in a voice channel'
    );
  });
});

describe('watch seekWatch', () => {
  test('should move the position and keep playing', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.selectWatchFile({ fileId: MOVIE_FILE_ID });

      await caller.voice.seekWatch({ positionSec: 120 });

      const { watch } = await caller.voice.getWatchState();

      expect(watch).toMatchObject({
        playing: true,
        positionSec: 120,
        controllerUserId: 1
      });
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when no watch party is active', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(caller.voice.seekWatch({ positionSec: 5 })).rejects.toThrow(
        'No active watch party'
      );
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(caller.voice.seekWatch({ positionSec: 5 })).rejects.toThrow(
      'User is not in a voice channel'
    );
  });
});

describe('watch stopWatch', () => {
  test('should clear the party and publish the clearing', async () => {
    const { runtime, caller } = await withVoiceChannel(1);
    const published: (TWatchState | undefined)[] = [];
    const subscription = collectWatchEvents((watch) => {
      published.push(watch);
    });

    try {
      await caller.voice.selectWatchFile({ fileId: MOVIE_FILE_ID });

      await caller.voice.stopWatch();

      const { watch } = await caller.voice.getWatchState();

      expect(watch).toBeUndefined();
      expect(published.at(-1)).toBeUndefined();
    } finally {
      subscription.unsubscribe();
      await runtime.destroy();
    }
  });

  test('should refuse when no watch party is active', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await expect(caller.voice.stopWatch()).rejects.toThrow(
        'No active watch party'
      );
    } finally {
      await runtime.destroy();
    }
  });

  test('should refuse when the user is not in a voice channel', async () => {
    const { caller } = await initTest(1);

    await expect(caller.voice.stopWatch()).rejects.toThrow(
      'User is not in a voice channel'
    );
  });
});

describe('watch party lifecycle', () => {
  test('should clear the party when the channel empties', async () => {
    const { runtime, caller } = await withVoiceChannel(1);

    try {
      await caller.voice.selectWatchFile({ fileId: MOVIE_FILE_ID });

      runtime.removeUser(1);

      const { watch } = await caller.voice.getWatchState();

      expect(watch).toBeUndefined();
    } finally {
      await runtime.destroy();
    }
  });
});
