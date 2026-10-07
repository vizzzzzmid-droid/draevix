import { logVoice } from '@/helpers/browser-logger';
import type Hls from 'hls.js';
import { Play } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type SyntheticEvent
} from 'react';
import { useTranslation } from 'react-i18next';

type THlsVideoProps = {
  src: string;
  playing: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onCanPlay?: () => void;
  onPlaying?: () => void;
  onStaleSource?: (src: string) => void;
  onRetry?: () => void;
};

// native <video> + hls.js instead of the react-player hls custom element, so
// the watch reconcile keeps working on the plain currentTime api everywhere:
// safari/webkit play hls natively, chromium goes through mse here
const HlsVideo = memo(
  ({
    src,
    playing,
    videoRef,
    onTimeUpdate,
    onLoadedMetadata,
    onCanPlay,
    onPlaying,
    onStaleSource,
    onRetry
  }: THlsVideoProps) => {
    const { t } = useTranslation();
    const hlsRef = useRef<Hls | null>(null);
    const refreshedUrlRef = useRef<string | null>(null);
    const onStaleSourceRef = useRef(onStaleSource);

    onStaleSourceRef.current = onStaleSource;

    const [failed, setFailed] = useState(false);
    const [canPlay, setCanPlay] = useState(false);
    const [needsGesture, setNeedsGesture] = useState(false);

    // manifest urls carry a short-lived signature: the first failure per url
    // asks for fresh links instead of giving up, late joiners included
    const handleStaleSource = useCallback(() => {
      if (onStaleSourceRef.current && refreshedUrlRef.current !== src) {
        refreshedUrlRef.current = src;
        onStaleSourceRef.current(src);
        return;
      }

      setFailed(true);
    }, [src]);

    useEffect(() => {
      const video = videoRef.current;

      if (!video || !src) return;

      let cancelled = false;
      let hls: Hls | null = null;

      setFailed(false);
      setCanPlay(false);
      setNeedsGesture(false);
      refreshedUrlRef.current = null;

      logVoice('hls: loading source', { src: src.slice(0, 80) });

      // chromium answers 'maybe' to the mpegurl mime check but cannot play
      // hls itself, so mse support decides: hls.js everywhere it works,
      // native playback only where mse is missing (ios safari, webkit)
      void import('hls.js')
        .then(({ default: HlsClass }) => {
          if (cancelled) return;

          logVoice('hls: mse support', {
            supported: HlsClass.isSupported()
          });

          if (HlsClass.isSupported()) {
            hls = new HlsClass();
            hlsRef.current = hls;
            hls.on(HlsClass.Events.ERROR, (_, data) => {
              logVoice('hls: player error', {
                fatal: data.fatal,
                type: data.type,
                details: data.details,
                responseCode: data.response?.code,
                url: data.url?.slice(0, 80)
              });

              if (data.fatal) handleStaleSource();
            });
            hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
              logVoice('hls: manifest parsed');
            });
            hls.loadSource(src);
            hls.attachMedia(video);
            return;
          }

          if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            return;
          }

          setFailed(true);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });

      return () => {
        cancelled = true;
        hls?.destroy();
        hlsRef.current = null;
        video.removeAttribute('src');
        video.load();
      };
    }, [src, videoRef, handleStaleSource]);

    // same gating as the file player: only flip the element when it disagrees.
    // browsers block autoplay with sound until the user interacts, so a
    // rejected play surfaces a tap-to-play overlay instead of a black screen.
    // re-attempts on source/readiness flips so autoplay still lands after the
    // stream becomes playable without a render loop
    useEffect(() => {
      const video = videoRef.current;

      if (!video) return;

      if (video.paused && playing) {
        try {
          const result = video.play() as unknown as Promise<void> | undefined;

          void result?.catch(() => {
            setNeedsGesture(true);
          });
        } catch {
          setNeedsGesture(true);
        }
      }

      if (!video.paused && !playing) {
        video.pause();
      }
    }, [videoRef, playing, src, canPlay]);

    const handlePlaying = useCallback(() => {
      setNeedsGesture(false);
      setCanPlay(true);
      onPlaying?.();
    }, [onPlaying]);

    const handleCanPlay = useCallback(() => {
      setCanPlay(true);
      onCanPlay?.();
    }, [onCanPlay]);

    const handleVideoError = useCallback(() => {
      const video = videoRef.current;
      const code = video?.error?.code ?? -1;

      logVoice('hls: video element error', {
        code,
        src: video?.currentSrc?.slice(0, 80) ?? ''
      });
      handleStaleSource();
    }, [videoRef, handleStaleSource]);

    const handleOverlayPlay = useCallback(() => {
      const video = videoRef.current;

      if (!video) return;

      try {
        const result = video.play() as unknown as Promise<void> | undefined;

        void result
          ?.then(() => {
            setNeedsGesture(false);
          })
          .catch(() => {
            // stays on the overlay for another tap
          });
      } catch {
        // stays on the overlay for another tap
      }
    }, [videoRef]);

    if (failed) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
          <span>{t('watchStreamFailed')}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-border px-3 py-1 text-sm"
            >
              {t('watchRetry')}
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="relative h-full w-full">
        <video
          ref={videoRef}
          playsInline
          width="100%"
          height="100%"
          style={{ colorScheme: 'dark', width: '100%', height: '100%' }}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onPlaying={handlePlaying}
          onCanPlay={handleCanPlay}
          onError={handleVideoError}
        />
        {!canPlay && !needsGesture && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <span className="text-sm text-muted-foreground">
              {t('watchStreamLoading')}
            </span>
          </div>
        )}
        {needsGesture && (
          <button
            type="button"
            onClick={handleOverlayPlay}
            className="absolute inset-0 flex items-center justify-center bg-black/60"
            aria-label={t('watchPlay')}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Play className="h-8 w-8" />
            </span>
          </button>
        )}
      </div>
    );
  }
);

export { HlsVideo };
