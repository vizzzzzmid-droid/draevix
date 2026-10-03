import { Permission, type TTempFile } from '@draevix/shared';
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { initTest, login, uploadFile } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { getOrphanedFileIds } from '../../db/queries/files';
import { files, rolePermissions } from '../../db/schema';
import { VoiceRuntime } from '../../runtimes/voice';

describe('library router', () => {
  const uploadVideoTemp = async (
    identity = 'testowner',
    name = 'movie.mp4'
  ): Promise<TTempFile> => {
    const response = await login(identity, 'password123');
    const data: any = await response.json();

    const res = await uploadFile(
      new File(['fake-video-bytes'], name, { type: 'video/mp4' }),
      data.token
    );

    return (await res.json()) as TTempFile;
  };

  const grantOnly = async (permissions: Permission[]) => {
    await tdb
      .delete(rolePermissions)
      .where(eq(rolePermissions.roleId, 2))
      .run();

    await tdb.insert(rolePermissions).values(
      permissions.map((permission) => ({
        roleId: 2,
        permission,
        createdAt: Date.now()
      }))
    );
  };

  beforeEach(async () => {
    // the library is locked to admins unless a test unlocks it
    const { caller } = await initTest(1);

    await caller.others.updateSettings({ watchLibraryLocked: true });
  });

  test('should let an admin add a video and list it', async () => {
    const { caller } = await initTest(1);
    const temp = await uploadVideoTemp();

    const { entry } = await caller.library.add({ tempFileId: temp.id });

    expect(entry.fileId).toBeDefined();

    const { videos } = await caller.library.list();

    expect(videos.length).toBe(1);
    expect(videos[0]!.file.originalName).toBe('movie.mp4');
    expect(videos[0]!.file.mimeType).toBe('video/mp4');
  });

  test('should refuse non-video uploads', async () => {
    const { caller } = await initTest(1);

    const response = await login('testowner', 'password123');
    const data: any = await response.json();
    const res = await uploadFile(
      new File(['nope'], 'note.txt', { type: 'text/plain' }),
      data.token
    );
    const temp = (await res.json()) as TTempFile;

    await expect(caller.library.add({ tempFileId: temp.id })).rejects.toThrow(
      'Only video files'
    );
  });

  test('should refuse a regular user while the library is locked', async () => {
    const { caller } = await initTest(2);
    const temp = await uploadVideoTemp();

    await expect(caller.library.add({ tempFileId: temp.id })).rejects.toThrow(
      'Insufficient permissions'
    );
  });

  test('should let a member with uploads add once unlocked', async () => {
    const { caller: admin } = await initTest(1);

    await admin.others.updateSettings({ watchLibraryLocked: false });
    await grantOnly([Permission.UPLOAD_FILES]);

    const { caller } = await initTest(2);
    const temp = await uploadVideoTemp('testuser', 'member-movie.mp4');

    const { entry } = await caller.library.add({ tempFileId: temp.id });

    expect(entry.addedByUserId).toBe(2);
  });

  test('should let anyone pick a library video for the watch party', async () => {
    const { caller: admin } = await initTest(1);
    const temp = await uploadVideoTemp();

    const { entry } = await admin.library.add({ tempFileId: temp.id });

    const runtime = new VoiceRuntime(2);

    runtime.addUser(2, { micMuted: true, soundMuted: true });

    try {
      const { caller } = await initTest(2, undefined, {
        currentVoiceChannelId: 2
      });

      await caller.voice.selectWatchFile({ fileId: entry.fileId });

      const { watch } = await caller.voice.getWatchState();

      expect(watch?.file.id).toBe(entry.fileId);
    } finally {
      await runtime.destroy();
    }
  });

  test('should delete the file when its only library entry is removed', async () => {
    const { caller } = await initTest(1);
    const temp = await uploadVideoTemp();

    const { entry } = await caller.library.add({ tempFileId: temp.id });

    await caller.library.remove({ fileId: entry.fileId });

    const { videos } = await caller.library.list();

    expect(videos.length).toBe(0);

    const gone = await tdb
      .select()
      .from(files)
      .where(eq(files.id, entry.fileId))
      .limit(1)
      .get();

    expect(gone).toBeUndefined();
  });

  test('should refuse a non-owner removal once unlocked', async () => {
    const { caller: admin } = await initTest(1);

    await admin.others.updateSettings({ watchLibraryLocked: false });
    await grantOnly([Permission.UPLOAD_FILES]);

    const temp = await uploadVideoTemp();
    const { entry } = await admin.library.add({ tempFileId: temp.id });

    const { caller } = await initTest(2);

    await expect(
      caller.library.remove({ fileId: entry.fileId })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should keep library files out of the orphan cleanup', async () => {
    const { caller } = await initTest(1);
    const temp = await uploadVideoTemp();

    const { entry } = await caller.library.add({ tempFileId: temp.id });

    // age the file past the orphan grace period
    await tdb
      .update(files)
      .set({ createdAt: Date.now() - 60 * 60 * 1000 })
      .where(eq(files.id, entry.fileId))
      .run();

    const orphans = await getOrphanedFileIds();

    expect(orphans).not.toContain(entry.fileId);
  });

  test('should toggle the lock through storage settings', async () => {
    const { caller } = await initTest(1);

    await caller.others.updateSettings({ watchLibraryLocked: false });

    const settings = await caller.others.getSettings();

    expect(settings.watchLibraryLocked).toBe(false);
  });
});
