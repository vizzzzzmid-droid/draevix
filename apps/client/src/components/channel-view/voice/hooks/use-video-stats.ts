import { useCallback, useEffect, useRef, useState } from 'react';

type VideoStats = {
  width: number;
  height: number;
  frameRate: number;
};

const UPDATE_INTERVAL_MS = 1000;

const useVideoStats = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
) => {
  const [stats, setStats] = useState<VideoStats | null>(null);
  const frameCountRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const callbackIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenRef = useRef(false);

  const onFrame = useCallback(() => {
    frameCountRef.current++;

    const video = videoRef.current;

    if (!video || hiddenRef.current) return;

    callbackIdRef.current = video.requestVideoFrameCallback(onFrame);
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;

    if (!enabled || !video) {
      setStats(null);

      frameCountRef.current = 0;
      lastUpdateRef.current = 0;

      return;
    }

    const startTracking = () => {
      frameCountRef.current = 0;
      lastUpdateRef.current = performance.now();
      callbackIdRef.current = video.requestVideoFrameCallback(onFrame);

      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          if (hiddenRef.current) return;

          const now = performance.now();
          const elapsed = (now - lastUpdateRef.current) / 1000;

          if (elapsed <= 0) return;

          const fps = frameCountRef.current / elapsed;

          frameCountRef.current = 0;
          lastUpdateRef.current = now;

          const width = video.videoWidth || 0;
          const height = video.videoHeight || 0;

          if (width > 0 && height > 0) {
            setStats({ width, height, frameRate: Math.round(fps) });
          } else {
            setStats(null);
          }
        }, UPDATE_INTERVAL_MS);
      }
    };

    const stopTracking = () => {
      if (callbackIdRef.current !== null) {
        video.cancelVideoFrameCallback(callbackIdRef.current);
        callbackIdRef.current = null;
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenRef.current = true;
        stopTracking();
      } else {
        hiddenRef.current = false;
        startTracking();
      }
    };

    if (!document.hidden) {
      startTracking();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopTracking();
      setStats(null);
      frameCountRef.current = 0;
      lastUpdateRef.current = 0;
    };
  }, [enabled, videoRef, onFrame]);

  return stats;
};

export { useVideoStats };
