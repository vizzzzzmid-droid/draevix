import { logVoice } from '@/helpers/browser-logger';
import { memo, useEffect, useRef, type MutableRefObject } from 'react';

// imperative handle mirroring the bits of HTMLMediaElement the music panel
// drives: play/pause/seek/volume plus time reads
type TYoutubeAudioHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume01: number) => void;
  setMuted: (muted: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

type TYoutubeAudioProps = {
  videoId: string;
  playing: boolean;
  // server position snapshot: the drift reference for self-snapping
  positionSec: number;
  positionUpdatedAt: number;
  volume: number;
  muted: boolean;
  seeking: () => boolean;
  onTimeUpdate: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onEnded: () => void;
  onError: () => void;
  handleRef: MutableRefObject<TYoutubeAudioHandle | null>;
};

type TYtPlayer = {
  loadVideoById: (
    videoId: string | { videoId: string; startSeconds?: number }
  ) => void;
  cueVideoById: (
    videoId: string | { videoId: string; startSeconds?: number }
  ) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};

type TYtApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: TYtPlayer }) => void;
        onStateChange?: (event: { data: number; target: TYtPlayer }) => void;
        onError?: () => void;
      };
    }
  ) => TYtPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

declare global {
  interface Window {
    YT?: TYtApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

let apiPromise: Promise<TYtApi> | null = null;

const loadYoutubeApi = (): Promise<TYtApi> => {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  if (!apiPromise) {
    apiPromise = new Promise<TYtApi>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        previous?.();

        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error('YouTube IFrame API failed to load'));
      };

      const script = document.createElement('script');

      script.src = IFRAME_API_SRC;
      script.async = true;
      script.onerror = () =>
        reject(new Error('YouTube IFrame API failed to load'));
      document.head.appendChild(script);

      setTimeout(
        () => reject(new Error('YouTube IFrame API timed out')),
        20000
      );
    });

    apiPromise.catch(() => {
      apiPromise = null;
    });
  }

  return apiPromise;
};

const DRIFT_THRESHOLD_SEC = 3;
const SEEK_COOLDOWN_MS = 4000;

const YoutubeAudio = memo((props: TYoutubeAudioProps) => {
  const { handleRef } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<TYtPlayer | null>(null);
  const readyRef = useRef(false);
  const durationReportedRef = useRef(false);
  // last known player state, -1 when unknown
  const stateRef = useRef<number>(-1);
  // one snap right after playback starts closes the load latency gap;
  // further snaps only fix real drift, never a stable offset
  const syncedOnceRef = useRef(false);
  const lastSeekAtRef = useRef(0);
  const propsRef = useRef(props);

  propsRef.current = props;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const serverTarget = (): number => {
      const snapshot = propsRef.current;

      if (!snapshot.playing) return snapshot.positionSec;

      return (
        snapshot.positionSec + (Date.now() - snapshot.positionUpdatedAt) / 1000
      );
    };

    const stateName = (state: number): string => {
      const states = window.YT?.PlayerState;

      if (!states) return `unknown(${state})`;

      switch (state) {
        case states.PLAYING:
          return 'playing';
        case states.PAUSED:
          return 'paused';
        case states.BUFFERING:
          return 'buffering';
        case states.ENDED:
          return 'ended';
        case states.CUED:
          return 'cued';
        default:
          return `state(${state})`;
      }
    };

    const snap = (reason: string) => {
      const player = playerRef.current;

      if (!player) return;

      const target = serverTarget();
      let current = 0;

      try {
        current = player.getCurrentTime() || 0;
      } catch {
        return;
      }

      const drift = Math.abs(target - current);

      logVoice('music: reconcile', {
        target,
        current,
        drift,
        reason,
        state: stateName(stateRef.current)
      });

      try {
        player.seekTo(target, true);
        lastSeekAtRef.current = Date.now();
      } catch {
        // player is tearing down, the next poll retries
      }
    };

    const poll = () => {
      const player = playerRef.current;
      const snapshot = propsRef.current;

      if (!player || !readyRef.current || snapshot.seeking()) return;

      let current = 0;

      try {
        current = player.getCurrentTime() || 0;
      } catch {
        return;
      }

      const duration = player.getDuration() || 0;

      if (duration > 0 && !durationReportedRef.current) {
        durationReportedRef.current = true;
        snapshot.onDuration(duration);
      }

      snapshot.onTimeUpdate(current);

      // a fresh seek needs time to buffer: re-snapping right away restarts
      // buffering forever, which is exactly the self-seeking loop
      if (Date.now() - lastSeekAtRef.current < SEEK_COOLDOWN_MS) return;

      // only a playing player can fall behind: seeking a buffering one
      // just prolongs the stall
      if (stateRef.current !== window.YT?.PlayerState.PLAYING) return;

      const drift = Math.abs(serverTarget() - current);

      if (drift > DRIFT_THRESHOLD_SEC) snap('drift');
    };

    handleRef.current = {
      play: () => {
        try {
          playerRef.current?.playVideo();
        } catch {
          // not ready yet, onReady picks up the playing prop
        }
      },
      pause: () => {
        try {
          playerRef.current?.pauseVideo();
        } catch {
          // not ready yet, nothing is playing anyway
        }
      },
      seekTo: (seconds: number) => {
        lastSeekAtRef.current = Date.now();

        try {
          playerRef.current?.seekTo(seconds, true);
        } catch {
          // not ready yet, the start position covers it
        }
      },
      setVolume: (volume01: number) => {
        try {
          playerRef.current?.setVolume(Math.round(volume01 * 100));
        } catch {
          // applied on ready instead
        }
      },
      setMuted: (muted: boolean) => {
        try {
          if (muted) playerRef.current?.mute();
          else playerRef.current?.unMute();
        } catch {
          // applied on ready instead
        }
      },
      getCurrentTime: () => {
        try {
          return playerRef.current?.getCurrentTime() ?? 0;
        } catch {
          return 0;
        }
      },
      getDuration: () => {
        try {
          return playerRef.current?.getDuration() ?? 0;
        } catch {
          return 0;
        }
      }
    };

    loadYoutubeApi()
      .then((api) => {
        if (cancelled || !containerRef.current) return;

        const snapshot = propsRef.current;

        const player = new api.Player(containerRef.current, {
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin
          },
          events: {
            onReady: ({ target }) => {
              if (cancelled) return;

              readyRef.current = true;

              target.setVolume(Math.round(snapshot.volume * 100));

              if (snapshot.muted) target.mute();

              if (snapshot.playing) {
                target.loadVideoById({
                  videoId: snapshot.videoId,
                  startSeconds: snapshot.positionSec
                });
              } else {
                target.cueVideoById({
                  videoId: snapshot.videoId,
                  startSeconds: snapshot.positionSec
                });
              }
            },
            onStateChange: ({ data }) => {
              if (cancelled || !window.YT) return;

              stateRef.current = data;

              if (data === window.YT.PlayerState.ENDED) {
                propsRef.current.onEnded();
                return;
              }

              // the load latency gap never closes on its own: snap once
              // right when playback actually starts
              if (
                data === window.YT.PlayerState.PLAYING &&
                !syncedOnceRef.current
              ) {
                syncedOnceRef.current = true;
                snap('start');
              }
            },
            onError: () => {
              if (!cancelled) propsRef.current.onError();
            }
          }
        });

        playerRef.current = player;
        timer = setInterval(poll, 500);
      })
      .catch(() => {
        if (!cancelled) propsRef.current.onError();
      });

    return () => {
      cancelled = true;

      if (timer) clearInterval(timer);

      try {
        playerRef.current?.destroy();
      } catch {
        // already gone
      }

      playerRef.current = null;
      readyRef.current = false;
      durationReportedRef.current = false;
      stateRef.current = -1;
      syncedOnceRef.current = false;
      handleRef.current = null;
    };
  }, [handleRef]);

  // track switch while staying joined: load the new video at the server position
  const { videoId, playing, volume, muted } = props;

  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;

    durationReportedRef.current = false;
    syncedOnceRef.current = false;

    const snapshot = propsRef.current;

    try {
      if (snapshot.playing) {
        playerRef.current.loadVideoById({
          videoId,
          startSeconds: snapshot.positionSec
        });
      } else {
        playerRef.current.cueVideoById({
          videoId,
          startSeconds: snapshot.positionSec
        });
      }
    } catch {
      // tearing down, the next mount retries
    }
    // playing rides the ref on purpose: toggling play/pause must not reload
  }, [videoId]);

  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;

    try {
      if (playing) playerRef.current.playVideo();
      else playerRef.current.pauseVideo();
    } catch {
      // tearing down
    }
  }, [playing]);

  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;

    try {
      playerRef.current.setVolume(Math.round(volume * 100));

      if (muted) playerRef.current.mute();
      else playerRef.current.unMute();
    } catch {
      // tearing down
    }
  }, [volume, muted]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: 2,
        height: 2,
        overflow: 'hidden',
        opacity: 0.01,
        pointerEvents: 'none'
      }}
    >
      <div ref={containerRef} />
    </div>
  );
});

export { YoutubeAudio, type TYoutubeAudioHandle };
