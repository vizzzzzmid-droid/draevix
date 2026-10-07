import { useUserById } from '@/features/server/users/hooks';
import { getWatchPositionSec } from '@/features/server/voice/helpers';
import { useWatchState } from '@/features/server/voice/hooks';
import { logVoice } from '@/helpers/browser-logger';
import { getFileUrl } from '@/helpers/get-file-url';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import { Button } from '@draevix/ui';
import { Pause, Play, Square } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactPlayer from 'react-player';
import { toast } from 'sonner';
import { HlsVideo } from './hls-video';

type TWatchPartyPanelProps = {
  channelId: number;
};

// events only arrive on change, so a local player further than this from the
// shared position gets snapped to it instead of drifting apart forever
const POSITION_SYNC_THRESHOLD_SEC = 3;

// a snap aborts the in-flight range download, so back-to-back snaps (scrubbing)
// would starve the buffer forever: only the settled position gets applied
const SNAP_SETTLE_MS = 700;

const WatchPartyPanel = memo(({ channelId }: TWatchPartyPanelProps) => {
  const { t } = useTranslation();
  const watch = useWatchState(channelId);
  const controller = useUserById(watch?.controllerUserId ?? -1);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const seekingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [duration, setDuration] = useState(0);
  const [displayPosition, setDisplayPosition] = useState(0);

  useEffect(() => {
    if (!watch) {
      setDisplayPosition(0);
      setDuration(0);

      return;
    }

    if (seekingRef.current) return;

    const target = getWatchPositionSec(watch);

    setDisplayPosition(target);

    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;

      const player = playerRef.current;

      if (!player || seekingRef.current) return;

      const freshTarget = getWatchPositionSec(watch);
      const current = player.currentTime || 0;
      const drift = Math.abs(freshTarget - current);

      logVoice('watch: reconcile', { target: freshTarget, current, drift });

      if (drift > POSITION_SYNC_THRESHOLD_SEC) {
        player.currentTime = freshTarget;
      }
    }, SNAP_SETTLE_MS);

    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [watch]);

  const handlePlay = useCallback(async () => {
    const position = playerRef.current?.currentTime ?? displayPosition;

    logVoice('watch: send play', { positionSec: position });

    const trpc = getTRPCClient();

    try {
      await trpc.voice.playWatch.mutate({ positionSec: position });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [displayPosition, t]);

  const handlePause = useCallback(async () => {
    const position = playerRef.current?.currentTime ?? displayPosition;

    logVoice('watch: send pause', { positionSec: position });

    const trpc = getTRPCClient();

    try {
      await trpc.voice.pauseWatch.mutate({ positionSec: position });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [displayPosition, t]);

  const handleSeekCommit = useCallback(async () => {
    seekingRef.current = false;

    logVoice('watch: send seek', { positionSec: displayPosition });

    // move the local player at once instead of waiting for our own echo,
    // otherwise the thumb fights the video until the roundtrip lands
    if (playerRef.current) {
      playerRef.current.currentTime = displayPosition;
    }

    const trpc = getTRPCClient();

    try {
      await trpc.voice.seekWatch.mutate({ positionSec: displayPosition });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [displayPosition, t]);

  const handleSeekChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      seekingRef.current = true;
      setDisplayPosition(Number(event.target.value));
    },
    []
  );

  const handleSeekAbort = useCallback(() => {
    seekingRef.current = false;
  }, []);

  // arrow keys change the value (see onChange above) and need a commit, but
  // any other key (space, tab, ...) must not broadcast a phantom seek at the
  // current video position
  const handleSeekKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'Home' ||
        event.key === 'End'
      ) {
        void handleSeekCommit();
      } else {
        seekingRef.current = false;
      }
    },
    [handleSeekCommit]
  );

  const handleStop = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.stopWatch.mutate();
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [t]);

  // upstream links carry a timestamp signature that dies within hours: a dead
  // player re-resolves the same title instead of hanging on a 403
  const refreshedUrlRef = useRef<string | null>(null);

  const handleKodikError = useCallback(async () => {
    const mp4Url = watch?.kodik?.mp4Url;

    if (!mp4Url || refreshedUrlRef.current === mp4Url) return;

    refreshedUrlRef.current = mp4Url;

    logVoice('watch: kodik refresh', { mp4Url });

    const trpc = getTRPCClient();

    try {
      await trpc.voice.kodikRefresh.mutate();
    } catch (error) {
      toast.error(getTrpcError(error, t('failedWatchTogether')));
    }
  }, [watch?.kodik?.mp4Url, t]);

  // aniliberty manifest urls die within minutes: a stale player (late join
  // included) re-resolves the same episode instead of giving up
  const refreshedHlsUrlRef = useRef<string | null>(null);

  const handleAnilibertyError = useCallback(
    async (force: boolean) => {
      const hlsUrl = watch?.aniliberty?.hlsUrl;

      if (!hlsUrl) return;

      if (!force && refreshedHlsUrlRef.current === hlsUrl) return;

      refreshedHlsUrlRef.current = hlsUrl;

      logVoice('watch: aniliberty refresh', { hlsUrl });

      const trpc = getTRPCClient();

      try {
        await trpc.voice.anilibertyRefresh.mutate();
      } catch (error) {
        toast.error(getTrpcError(error, t('failedWatchTogether')));
      }
    },
    [watch?.aniliberty?.hlsUrl, t]
  );

  const handleTimeUpdate = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      if (!seekingRef.current) {
        setDisplayPosition(event.currentTarget.currentTime);
      }
    },
    []
  );

  const handleLoadedMetadata = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      setDuration(event.currentTarget.duration);
    },
    []
  );

  if (!watch) return null;

  const sourceName = watch.aniliberty
    ? [
        watch.aniliberty.title,
        watch.aniliberty.episode > 0
          ? t('watchEpisodeN', { episode: watch.aniliberty.episode })
          : ''
      ]
        .filter(Boolean)
        .join(' — ')
    : watch.kodik
      ? [
          watch.kodik.title,
          watch.kodik.translationTitle,
          watch.kodik.episode > 0 ? `E${watch.kodik.episode}` : ''
        ]
          .filter(Boolean)
          .join(' — ')
      : (watch.file?.originalName ?? '');

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('watchPartyTitle')}</span>
        <span className="text-xs text-muted-foreground">
          {t('watchControlledBy', {
            name: controller ? getRenderedUsername(controller) : '?'
          })}
        </span>
      </div>
      {sourceName && (
        <span className="truncate text-xs text-muted-foreground">
          {sourceName}
        </span>
      )}
      <div className="aspect-video max-h-[45vh] w-full overflow-hidden rounded-md bg-black">
        {watch.aniliberty ? (
          <HlsVideo
            src={watch.aniliberty.hlsUrl}
            playing={watch.playing}
            videoRef={playerRef}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onStaleSource={() => void handleAnilibertyError(false)}
            onRetry={() => void handleAnilibertyError(true)}
          />
        ) : (
          <ReactPlayer
            ref={playerRef}
            src={watch.kodik ? watch.kodik.mp4Url : getFileUrl(watch.file)}
            playing={watch.playing}
            width="100%"
            height="100%"
            style={{ colorScheme: 'dark' }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={watch.kodik ? handleKodikError : undefined}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        {watch.playing ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={handlePause}
            title={t('watchPause')}
          >
            <Pause className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            onClick={handlePlay}
            title={t('watchPlay')}
          >
            <Play className="h-4 w-4" />
          </Button>
        )}
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.1}
          value={Math.min(displayPosition, Math.max(duration, 0.01))}
          onChange={handleSeekChange}
          onPointerUp={handleSeekCommit}
          onPointerCancel={handleSeekAbort}
          onLostPointerCapture={handleSeekAbort}
          onKeyUp={handleSeekKeyUp}
          aria-label={t('watchSeek')}
          className="flex-1"
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={handleStop}
          title={t('watchStop')}
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

export { WatchPartyPanel };
