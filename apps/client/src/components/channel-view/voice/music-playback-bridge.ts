import { useSyncExternalStore } from 'react';

type TMusicPlaybackBridge = {
  join: () => void;
  leave: () => void;
  play: () => void;
  pause: () => void;
  seek: (positionSec: number) => void;
};

// The audio element lives in the persistent player host, while the controls
// live in the voice channel view which unmounts on every navigation. This
// bridge (plus the joined flag below) is the only link between the two.
let musicPlaybackBridge: TMusicPlaybackBridge | null = null;

const setMusicPlaybackBridge = (bridge: TMusicPlaybackBridge | null) => {
  musicPlaybackBridge = bridge;
};

const getMusicPlaybackBridge = () => musicPlaybackBridge;

// whether this client is currently listening: owned by the host, read by
// the channel panel to decide between player and join prompt
let joined = false;
const joinedListeners = new Set<() => void>();

const setJoinedState = (next: boolean) => {
  if (joined === next) return;
  joined = next;

  for (const listener of joinedListeners) listener();
};

const subscribeJoined = (listener: () => void) => {
  joinedListeners.add(listener);

  return () => {
    joinedListeners.delete(listener);
  };
};

const getJoinedSnapshot = () => joined;

const useMusicJoined = () =>
  useSyncExternalStore(subscribeJoined, getJoinedSnapshot, getJoinedSnapshot);

export {
  getMusicPlaybackBridge,
  setJoinedState,
  setMusicPlaybackBridge,
  useMusicJoined,
  type TMusicPlaybackBridge
};
