import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'draevix-music-volume';

type TMusicVolume = {
  volume: number;
  muted: boolean;
};

const readStored = (): TMusicVolume => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return { volume: 1, muted: false };

    const parsed = JSON.parse(raw) as Partial<TMusicVolume>;
    const volume =
      typeof parsed.volume === 'number'
        ? Math.min(1, Math.max(0, parsed.volume))
        : 1;

    return { volume, muted: parsed.muted === true };
  } catch {
    return { volume: 1, muted: false };
  }
};

let state: TMusicVolume = { volume: 1, muted: false };
let listeners: (() => void)[] = [];

const emit = () => {
  for (const listener of listeners) listener();
};

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode etc: volume just resets next launch
  }
};

const setMusicVolume = (volume: number, muted: boolean) => {
  state = { volume: Math.min(1, Math.max(0, volume)), muted };
  persist();
  emit();
};

const subscribeMusicVolume = (listener: () => void) => {
  listeners = [...listeners, listener];

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
};

const getMusicVolumeSnapshot = () => state;

const useMusicVolume = (): [
  TMusicVolume,
  (volume: number, muted: boolean) => void
] => {
  const snapshot = useSyncExternalStore(
    subscribeMusicVolume,
    getMusicVolumeSnapshot,
    getMusicVolumeSnapshot
  );

  return [snapshot, setMusicVolume];
};

// refresh the in-memory copy on load (a stored value from last session wins)
try {
  state = readStored();
} catch {
  // ssr safety: never throws anyway
}

export { setMusicVolume, useMusicVolume };
export type { TMusicVolume };
