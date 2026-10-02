import { afterEach, describe, expect, test } from 'bun:test';
import {
  getHostFromServer,
  getServerWsProtocol,
  getUrlFromServer,
  normalizeServerAddress
} from '../get-file-url';
import { LocalStorageKey } from '../storage';

const setWindow = (window: unknown) => {
  (globalThis as { window?: unknown }).window = window;
};

const setLocalStorage = (values: Record<string, string>) => {
  const store = new Map(Object.entries(values));

  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    }
  };
};

describe('normalizeServerAddress', () => {
  test('should assume https for a bare host', () => {
    expect(normalizeServerAddress('official.draevix.bond')).toEqual({
      host: 'official.draevix.bond',
      secure: true
    });
  });

  test('should keep an explicit http scheme insecure', () => {
    expect(normalizeServerAddress('http://192.168.1.10:4991')).toEqual({
      host: '192.168.1.10:4991',
      secure: false
    });
  });

  test('should keep an explicit https scheme secure', () => {
    expect(normalizeServerAddress('https://official.draevix.bond/')).toEqual({
      host: 'official.draevix.bond',
      secure: true
    });
  });

  test('should trim whitespace and trailing slashes', () => {
    expect(normalizeServerAddress('  example.com///  ')).toEqual({
      host: 'example.com',
      secure: true
    });
  });
});

describe('server address outside tauri', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test('should follow the page the web client is served on', () => {
    setWindow({ location: { host: 'chat.example.com', protocol: 'https:' } });

    expect(getHostFromServer()).toBe('chat.example.com');
    expect(getUrlFromServer()).toBe('https://chat.example.com');
    expect(getServerWsProtocol()).toBe('wss');
  });
});

describe('server address in tauri', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test('should default to the official server', () => {
    setWindow({ __TAURI__: true });
    setLocalStorage({});

    expect(getHostFromServer()).toBe('official.draevix.bond');
    expect(getUrlFromServer()).toBe('https://official.draevix.bond');
    expect(getServerWsProtocol()).toBe('wss');
  });

  test('should detect tauri through the internals global', () => {
    setWindow({
      __TAURI_INTERNALS__: true,
      location: { host: 'tauri.localhost', protocol: 'http:' }
    });
    setLocalStorage({});

    expect(getHostFromServer()).toBe('official.draevix.bond');
  });

  test('should detect tauri through the loopback hostname', () => {
    setWindow({
      location: {
        host: 'tauri.localhost',
        hostname: 'tauri.localhost',
        protocol: 'http:'
      }
    });
    setLocalStorage({});

    expect(getHostFromServer()).toBe('official.draevix.bond');
  });

  test('should use the stored address when one is set', () => {
    setWindow({ __TAURI__: true });
    setLocalStorage({
      [LocalStorageKey.SERVER_ADDRESS]: 'http://192.168.1.10:4991'
    });

    expect(getHostFromServer()).toBe('192.168.1.10:4991');
    expect(getUrlFromServer()).toBe('http://192.168.1.10:4991');
    expect(getServerWsProtocol()).toBe('ws');
  });
});
