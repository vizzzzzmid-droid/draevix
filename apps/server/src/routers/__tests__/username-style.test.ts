import { UsernameEffect, UsernameFont } from '@draevix/shared';
import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';

describe('users setUsernameStyle', () => {
  test('should refuse a regular user without MANAGE_USERS', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.users.setUsernameStyle({
        userId: 2,
        effect: UsernameEffect.FIRE,
        font: UsernameFont.MONO
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should set and clear effect and font as admin', async () => {
    const { caller } = await initTest(1);

    const set = await caller.users.setUsernameStyle({
      userId: 2,
      effect: UsernameEffect.FIRE,
      font: UsernameFont.MONO
    });

    expect(set.usernameEffect).toBe(UsernameEffect.FIRE);
    expect(set.usernameFont).toBe(UsernameFont.MONO);

    const { user } = await caller.users.getInfo({ userId: 2 });

    expect(user.usernameEffect).toBe(UsernameEffect.FIRE);
    expect(user.usernameFont).toBe(UsernameFont.MONO);

    const cleared = await caller.users.setUsernameStyle({
      userId: 2,
      effect: null,
      font: null
    });

    expect(cleared.usernameEffect).toBeNull();
    expect(cleared.usernameFont).toBeNull();
  });

  test('should accept every registered effect and font', async () => {
    const { caller } = await initTest(1);

    for (const effect of Object.values(UsernameEffect)) {
      const result = await caller.users.setUsernameStyle({
        userId: 2,
        effect,
        font: null
      });

      expect(result.usernameEffect).toBe(effect);
    }

    for (const font of Object.values(UsernameFont)) {
      const result = await caller.users.setUsernameStyle({
        userId: 2,
        effect: null,
        font
      });

      expect(result.usernameFont).toBe(font);
    }

    await caller.users.setUsernameStyle({
      userId: 2,
      effect: null,
      font: null
    });
  });

  test('should reject unknown values', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.users.setUsernameStyle({
        userId: 2,
        // @ts-expect-error - invalid effect on purpose
        effect: 'fireworks',
        font: null
      })
    ).rejects.toThrow();

    await expect(
      caller.users.setUsernameStyle({
        userId: 2,
        effect: null,
        // @ts-expect-error - invalid font on purpose
        font: 'comic-sans'
      })
    ).rejects.toThrow();
  });

  test('should refuse an unknown user', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.users.setUsernameStyle({
        userId: 999999,
        effect: UsernameEffect.FROST,
        font: null
      })
    ).rejects.toThrow('User not found');
  });
});
