import { getLocalStorageItem, LocalStorageKey } from '@/helpers/storage';
import type { TFile } from '@draevix/shared';

const DEFAULT_SERVER_ADDRESS = 'official.draevix.bond';

type TServerAddress = {
  host: string;
  secure: boolean;
};

const isTauri = () => {
  if (typeof window === 'undefined') return false;

  return (
    '__TAURI__' in window ||
    '__TAURI_INTERNALS__' in window ||
    window.location.hostname === 'tauri.localhost'
  );
};

const normalizeServerAddress = (raw: string): TServerAddress => {
  const trimmed = raw.trim().replace(/\/+$/, '');

  if (trimmed.startsWith('http://')) {
    return { host: trimmed.slice('http://'.length), secure: false };
  }

  if (trimmed.startsWith('https://')) {
    return { host: trimmed.slice('https://'.length), secure: true };
  }

  return { host: trimmed, secure: true };
};

const getServerAddress = (): TServerAddress => {
  if (import.meta.env.MODE === 'development') {
    return { host: 'localhost:4991', secure: false };
  }

  if (isTauri()) {
    return normalizeServerAddress(
      getLocalStorageItem(LocalStorageKey.SERVER_ADDRESS) ||
        DEFAULT_SERVER_ADDRESS
    );
  }

  return {
    host: window.location.host,
    secure: window.location.protocol === 'https:'
  };
};

const getHostFromServer = () => getServerAddress().host;

const getServerWsProtocol = () => (getServerAddress().secure ? 'wss' : 'ws');

const getUrlFromServer = () => {
  const { host, secure } = getServerAddress();

  return `${secure ? 'https' : 'http'}://${host}`;
};

const getFileUrl = (file: TFile | undefined | null) => {
  if (!file) return '';

  const url = getUrlFromServer();

  let baseUrl = `${url}/public/${file.name}`;

  if (file._accessToken) {
    baseUrl += `?accessToken=${file._accessToken}`;

    if (file._accessTokenExpiresAt) {
      baseUrl += `&expires=${file._accessTokenExpiresAt}`;
    }
  }

  return encodeURI(baseUrl);
};

export {
  DEFAULT_SERVER_ADDRESS,
  getFileUrl,
  getHostFromServer,
  getServerWsProtocol,
  getUrlFromServer,
  isTauri,
  normalizeServerAddress
};
