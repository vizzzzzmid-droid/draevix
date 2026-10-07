import type Hls from 'hls.js';
import {
  memo,
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
  onError?: () => void;
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
    onError
  }: THlsVideoProps) => {
    const { t } = useTranslation();
    const hlsRef = useRef<Hls | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      const video = videoRef.current;

      if (!video || !src) return;

      let cancelled = false;
      let hls: Hls | null = null;

      setFailed(false);

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else {
        void import('hls.js').then(({ default: HlsClass }) => {
          if (cancelled) return;

          if (!HlsClass.isSupported()) {
            setFailed(true);
            return;
          }

          hls = new HlsClass();
          hlsRef.current = hls;
          hls.on(HlsClass.Events.ERROR, (_, data) => {
            if (data.fatal) setFailed(true);
          });
          hls.loadSource(src);
          hls.attachMedia(video);
        });
      }

      return () => {
        cancelled = true;
        hls?.destroy();
        hlsRef.current = null;
        video.removeAttribute('src');
        video.load();
      };
    }, [src, videoRef]);

    // same gating as the file player: only flip the element when it disagrees
    useEffect(() => {
      const video = videoRef.current;

      if (!video) return;

      if (video.paused && playing) {
        try {
          const result = video.play() as unknown as Promise<void> | undefined;

          void result?.catch(() => {});
        } catch {
          // autoplay blocked until the user interacts with the page
        }
      }

      if (!video.paused && !playing) {
        video.pause();
      }
    });

    if (failed) {
      return (
        <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
          {t('watchStreamFailed')}
        </div>
      );
    }

    return (
      <video
        ref={videoRef}
        playsInline
        width="100%"
        height="100%"
        style={{ colorScheme: 'dark', width: '100%', height: '100%' }}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onError={onError}
      />
    );
  }
);

export { HlsVideo };
