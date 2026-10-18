import { UsernameFont } from '@draevix/shared';
import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';

describe('users update bioFont', () => {
  test('should refuse a regular user setting bioFont', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.users.update({
        name: 'renamed-user',
        profileColor: '#ffffff',
        bio: 'hello',
        bioFont: UsernameFont.SERIF
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should still let a regular user update name and bio without bioFont', async () => {
    const { caller } = await initTest(2);

    await caller.users.update({
      name: 'renamed-user',
      profileColor: '#ffffff',
      bio: 'hello'
    });

    // reading another user's full info needs admin rights, so verify as admin
    const { caller: admin } = await initTest(1);
    const { user } = await admin.users.getInfo({ userId: 2 });

    expect(user.name).toBe('renamed-user');
    expect(user.bio).toBe('hello');
  });

  test('should let an admin set bioFont on their own profile', async () => {
    const { caller } = await initTest(1);

    await caller.users.update({
      name: 'admin-user',
      profileColor: '#ffffff',
      bio: 'hi there',
      bioFont: UsernameFont.MONTSERRAT
    });

    const { user } = await caller.users.getInfo({ userId: 1 });

    expect(user.bioFont).toBe(UsernameFont.MONTSERRAT);
  });

  test('should keep the stored bioFont when an admin saves without it', async () => {
    const { caller } = await initTest(1);

    await caller.users.update({
      name: 'admin-user',
      profileColor: '#ffffff',
      bio: 'first',
      bioFont: UsernameFont.NUNITO
    });

    await caller.users.update({
      name: 'admin-user',
      profileColor: '#ffffff',
      bio: 'second'
    });

    const { user } = await caller.users.getInfo({ userId: 1 });

    expect(user.bio).toBe('second');
    expect(user.bioFont).toBe(UsernameFont.NUNITO);
  });

  test('should reject an unknown bioFont value', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.users.update({
        name: 'admin-user',
        profileColor: '#ffffff',
        // @ts-expect-error - invalid font on purpose
        bioFont: 'comic-sans'
      })
    ).rejects.toThrow();
  });
});
