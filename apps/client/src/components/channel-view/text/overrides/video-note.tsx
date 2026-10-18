import { formatMediaPosition } from '@/features/server/voice/helpers';
import { cn } from '@/lib/utils';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { OverrideLayout } from './layout';

type TVideoNoteOverrideProps = {
  src: string;
};

// square Telegram-style video message: autoplays muted in a loop, tapping
// unmutes and restarts from the beginning; a second tap toggles play/pause
const VideoNoteOverride = memo(({ src }: TVideoNoteOverrideProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const handleToggle = useCallback(() => {
    const video = videoRef.current;

    if (!video) return;

    if (video.muted) {
      video.muted = false;
      video.currentTime = 0;
      setMuted(false);
      setPaused(false);
      video.play().catch(() => {});

      return;
    }

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const handleMuteToggle = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();

      const video = videoRef.current;

      if (!video) return;

      const nextMuted = !video.muted;

      video.muted = nextMuted;
      setMuted(nextMuted);
    },
    []
  );

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;

    if (!video) return;

    setCurrentTime(video.currentTime || 0);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;

    if (!video) return;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
    }
  }, []);

  const handlePlay = useCallback(() => {
    setPaused(false);
  }, []);

  const handlePause = useCallback(() => {
    setPaused(true);
  }, []);

  const progressRatio =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const remainingSec =
    duration > 0 ? Math.max(0, duration - currentTime) : currentTime;

  return (
    <OverrideLayout>
      <div
        onClick={handleToggle}
        className={cn(
          'group relative aspect-square w-60 max-w-full cursor-pointer select-none overflow-hidden rounded-2xl border-2 bg-black/80 shadow-md transition-all duration-200',
          muted ? 'border-primary/40 hover:border-primary/80' : 'border-primary'
        )}
      >
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          className="size-full object-cover"
        />

        {paused && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="rounded-full bg-black/60 p-3 text-white">
              <Play className="size-6 fill-current" />
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-xs">
            {formatMediaPosition(remainingSec)}
          </span>

          <button
            type="button"
            onClick={handleMuteToggle}
            className="pointer-events-auto flex size-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs transition hover:bg-black/80"
          >
            {muted ? (
              <VolumeX className="size-3.5" />
            ) : paused ? (
              <Pause className="size-3.5" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/15">
          <div
            className="h-full bg-primary transition-[width] duration-100"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
      </div>
    </OverrideLayout>
  );
});

VideoNoteOverride.displayName = 'VideoNoteOverride';

export { VideoNoteOverride };
