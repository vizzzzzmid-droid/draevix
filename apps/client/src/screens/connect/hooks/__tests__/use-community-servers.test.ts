import { SERVERS_REGISTRY_URL } from '@draevix/shared';
import { afterEach, describe, expect, test } from 'bun:test';
import { loadCommunityServers } from '../use-community-servers';

const stubFetch = (
  handler: (url: string) => Promise<{ ok: boolean; json: () => unknown }>
) => {
  (globalThis as { fetch?: unknown }).fetch = handler;
};

describe('loadCommunityServers', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  test('should merge registry entries with live server details', async () => {
    stubFetch(async (url: string) => {
      if (url === SERVERS_REGISTRY_URL) {
        return {
          ok: true,
          json: async () => [
            { name: 'Official', address: 'official.draevix.bond' },
            { name: 'Local', address: 'localhost:4991' }
          ]
        };
      }

      if (url === 'https://official.draevix.bond/info') {
        return {
          ok: true,
          json: async () => ({
            name: 'Official Live',
            onlineCount: 128,
            logo: { name: 'logo.png' }
          })
        };
      }

      throw new Error('unreachable');
    });

    await expect(loadCommunityServers()).resolves.toEqual([
      {
        name: 'Official',
        address: 'official.draevix.bond',
        liveName: 'Official Live',
        onlineCount: 128,
        logoUrl: 'https://official.draevix.bond/public/logo.png'
      },
      { name: 'Local', address: 'localhost:4991' }
    ]);
  });

  test('should return nothing when the registry is unreachable', async () => {
    stubFetch(async () => {
      throw new Error('offline');
    });

    await expect(loadCommunityServers()).resolves.toEqual([]);
  });

  test('should drop malformed registry entries', async () => {
    stubFetch(async (url: string) => {
      if (url === SERVERS_REGISTRY_URL) {
        return {
          ok: true,
          json: async () => [
            { name: 'Good', address: 'good.example.com' },
            { name: 'Broken' }
          ]
        };
      }

      return { ok: false, json: async () => ({}) };
    });

    await expect(loadCommunityServers()).resolves.toEqual([
      { name: 'Good', address: 'good.example.com' }
    ]);
  });
});
