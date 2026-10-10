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
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
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

const YoutubeAudio = memo((props: TYoutubeAudioProps) => {
  const { handleRef } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<TYtPlayer | null>(null);
  const readyRef = useRef(false);
  const durationReportedRef = useRef(false);
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

    const poll = () => {
      const player = playerRef.current;
      const snapshot = propsRef.current;

      if (!player || !readyRef.current) return;

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

      if (!snapshot.seeking()) {
        snapshot.onTimeUpdate(current);

        const drift = Math.abs(serverTarget() - current);

        if (drift > DRIFT_THRESHOLD_SEC) {
          logVoice('music: reconcile', {
            target: serverTarget(),
            current,
            drift
          });

          try {
            player.seekTo(serverTarget(), true);
          } catch {
            // player is tearing down, the next poll retries
          }
        }
      }
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

              if (data === window.YT.PlayerState.ENDED) {
                propsRef.current.onEnded();
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
      handleRef.current = null;
    };
  }, [handleRef]);

  // track switch while staying joined: load the new video at the server position
  const { videoId, playing, volume, muted } = props;

  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;

    durationReportedRef.current = false;

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
