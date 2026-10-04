import { ProfileEffect } from '@draevix/shared';
import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';

describe('users setProfileEffect', () => {
  test('should refuse a regular user without MANAGE_USERS', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.users.setProfileEffect({
        userId: 2,
        effect: ProfileEffect.SNOW
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should set and clear an effect as admin', async () => {
    const { caller } = await initTest(1);

    const set = await caller.users.setProfileEffect({
      userId: 2,
      effect: ProfileEffect.SNOW
    });

    expect(set.profileEffect).toBe(ProfileEffect.SNOW);

    const { user } = await caller.users.getInfo({ userId: 2 });

    expect(user.profileEffect).toBe(ProfileEffect.SNOW);

    const cleared = await caller.users.setProfileEffect({
      userId: 2,
      effect: null
    });

    expect(cleared.profileEffect).toBeNull();
  });

  test('should reject an unknown effect id', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.users.setProfileEffect({
        userId: 2,
        // @ts-expect-error - invalid effect on purpose
        effect: 'fireworks'
      })
    ).rejects.toThrow();
  });

  test('should refuse an unknown user', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.users.setProfileEffect({
        userId: 999999,
        effect: ProfileEffect.SNOW
      })
    ).rejects.toThrow('User not found');
  });
});
