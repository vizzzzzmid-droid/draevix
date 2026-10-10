import { useOwnUserId, useUserById } from '@/features/server/users/hooks';
import { getWatchPositionSec } from '@/features/server/voice/helpers';
import { useWatchState } from '@/features/server/voice/hooks';
import { logVoice } from '@/helpers/browser-logger';
import { getFileUrl } from '@/helpers/get-file-url';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import { Button } from '@draevix/ui';
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
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
// would starve the buffer forever: only the settled position gets applied.
// snaps also fire when the player gets ready (fresh join), because a timed
// snap can land before hls even parsed the manifest and get lost
const SNAP_SETTLE_MS = 700;

const WatchPartyPanel = memo(({ channelId }: TWatchPartyPanelProps) => {
  const { t } = useTranslation();
  const watch = useWatchState(channelId);
  const controller = useUserById(watch?.controllerUserId ?? -1);
  const ownUserId = useOwnUserId();
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const seekingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [duration, setDuration] = useState(0);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [episodes, setEpisodes] = useState<
    { ordinal: number; name: string | null }[]
  >([]);
  const [seasons, setSeasons] = useState<
    { releaseId: number; title: string }[]
  >([]);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const snapToTarget = useCallback(() => {
    const player = playerRef.current;

    if (!player || seekingRef.current || !watch) return;

    const target = getWatchPositionSec(watch);
    const current = player.currentTime || 0;
    const drift = Math.abs(target - current);

    logVoice('watch: reconcile', { target, current, drift });

    if (drift > POSITION_SYNC_THRESHOLD_SEC) {
      player.currentTime = target;
    }
  }, [watch]);

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

      snapToTarget();
    }, SNAP_SETTLE_MS);

    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [watch, snapToTarget]);

  // volume and mute are per-viewer, never broadcast: applied to whatever
  // element is mounted (file player or hls) on every render, same as playing
  useEffect(() => {
    const player = playerRef.current;

    if (!player) return;

    player.volume = volume;
    player.muted = muted;
  });

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement != null);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // episode and season lists for the in-player switcher; switching re-selects
  // the title for everyone from the start, like picking it from the dialog
  useEffect(() => {
    const releaseId = watch?.aniliberty?.releaseId;

    if (!releaseId) {
      setEpisodes([]);
      setSeasons([]);
      return;
    }

    let cancelled = false;
    const trpc = getTRPCClient();

    void Promise.all([
      trpc.voice.anilibertyDescribe.query({ releaseId }),
      trpc.voice.anilibertyFranchise.query({ releaseId })
    ])
      .then(([described, franchise]) => {
        if (cancelled) return;

        setEpisodes(
          described.episodes.map((episode) => ({
            ordinal: episode.ordinal,
            name: episode.name
          }))
        );
        setSeasons(
          franchise.releases.map((release) => ({
            releaseId: release.releaseId,
            title: release.title
          }))
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [watch?.aniliberty?.releaseId]);

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

  // opening/ending skip is a shared seek: everyone jumps together, like any
  // other seek. shown only while the shared position sits inside a segment
  const handleSkipSegment = useCallback(
    async (position: number) => {
      seekingRef.current = false;
      setDisplayPosition(position);

      logVoice('watch: send skip segment', { positionSec: position });

      if (playerRef.current) {
        playerRef.current.currentTime = position;
      }

      const trpc = getTRPCClient();

      try {
        await trpc.voice.seekWatch.mutate({ positionSec: position });
      } catch (error) {
        toast.error(getTrpcError(error, t('failedWatchTogether')));
      }
    },
    [t]
  );

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

  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);

      setVolume(next);
      setMuted(next === 0);
    },
    []
  );

  const handleMuteToggle = useCallback(() => {
    setMuted((previous) => !previous);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }

    void panelRef.current?.requestFullscreen().catch(() => {});
  }, []);

  const handleSwitchEpisode = useCallback(
    async (episode: number) => {
      const releaseId = watch?.aniliberty?.releaseId;

      if (!releaseId) return;

      logVoice('watch: switch episode', { releaseId, episode });

      const trpc = getTRPCClient();

      try {
        await trpc.voice.anilibertySelect.mutate({ releaseId, episode });
      } catch (error) {
        toast.error(getTrpcError(error, t('failedWatchTogether')));
      }
    },
    [watch?.aniliberty?.releaseId, t]
  );

  const handleSwitchSeason = useCallback(
    async (releaseId: number) => {
      logVoice('watch: switch season', { releaseId });

      const trpc = getTRPCClient();

      try {
        await trpc.voice.anilibertySelect.mutate({ releaseId, episode: 1 });
      } catch (error) {
        toast.error(getTrpcError(error, t('failedWatchTogether')));
      }
    },
    [t]
  );

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
      snapToTarget();
    },
    [snapToTarget]
  );

  const handlePlayerReady = useCallback(() => {
    snapToTarget();
  }, [snapToTarget]);

  const sourceUrl = watch
    ? watch.aniliberty
      ? watch.aniliberty.hlsUrl
      : getFileUrl(watch.file)
    : '';

  // nobody auto-plays someone else's party: a new source shows a join prompt
  // instead of a player. the starter (controller at select time) joins
  // implicitly by starting, everyone else taps to join
  const [joinedUrl, setJoinedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceUrl) {
      setJoinedUrl(null);
      return;
    }

    if (watch?.controllerUserId === ownUserId) {
      setJoinedUrl(sourceUrl);
    }
  }, [sourceUrl, watch?.controllerUserId, ownUserId]);

  if (!watch) return null;

  const joined = joinedUrl !== null && joinedUrl === sourceUrl;

  const sourceName = watch.aniliberty
    ? [
        watch.aniliberty.title,
        watch.aniliberty.episode > 0
          ? t('watchEpisodeN', { episode: watch.aniliberty.episode })
          : ''
      ]
        .filter(Boolean)
        .join(' — ')
    : (watch.file?.originalName ?? '');

  const currentEpisode = watch.aniliberty?.episode ?? 0;
  const episodeOrdinals = episodes.map((entry) => entry.ordinal);
  const episodeIndex = episodeOrdinals.indexOf(currentEpisode);
  const prevEpisode =
    episodeIndex > 0 ? (episodeOrdinals[episodeIndex - 1] ?? null) : null;
  const nextEpisode =
    episodeIndex >= 0 && episodeIndex < episodeOrdinals.length - 1
      ? (episodeOrdinals[episodeIndex + 1] ?? null)
      : null;

  const skipTarget = ((): number | null => {
    const source = watch.aniliberty;

    if (!source || seekingRef.current) return null;

    for (const segment of [source.opening, source.ending]) {
      if (
        segment &&
        displayPosition >= segment.start &&
        displayPosition < segment.stop
      ) {
        return segment.stop;
      }
    }

    return null;
  })();

  return (
    <div
      ref={panelRef}
      className={`flex flex-col gap-2 rounded-lg border border-border/50 bg-card/50 p-3 ${isFullscreen ? 'h-full justify-center bg-black' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t('watchPartyTitle')}</span>
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-xs text-muted-foreground">
            {t('watchControlledBy', {
              name: controller ? getRenderedUsername(controller) : '?'
            })}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleStop}
            title={t('watchStop')}
            className="h-6 w-6 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      {sourceName && (
        <span className="truncate text-xs text-muted-foreground">
          {sourceName}
        </span>
      )}
      {joined ? (
        <>
          {watch.aniliberty && episodes.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (prevEpisode !== null)
                    void handleSwitchEpisode(prevEpisode);
                }}
                disabled={prevEpisode === null}
                title={t('watchPrevEpisode')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <select
                value={currentEpisode}
                onChange={(event) =>
                  void handleSwitchEpisode(Number(event.target.value))
                }
                className="min-w-0 flex-1 truncate rounded-md border border-border/50 bg-background px-2 py-1 text-xs"
                aria-label={t('watchEpisode')}
              >
                {episodes.map((entry) => (
                  <option key={entry.ordinal} value={entry.ordinal}>
                    {t('watchEpisodeN', { episode: entry.ordinal })}
                    {entry.name ? ` — ${entry.name}` : ''}
                  </option>
                ))}
              </select>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (nextEpisode !== null)
                    void handleSwitchEpisode(nextEpisode);
                }}
                disabled={nextEpisode === null}
                title={t('watchNextEpisode')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {seasons.length > 1 && watch.aniliberty && (
                <select
                  value={watch.aniliberty.releaseId}
                  onChange={(event) =>
                    void handleSwitchSeason(Number(event.target.value))
                  }
                  className="max-w-40 truncate rounded-md border border-border/50 bg-background px-2 py-1 text-xs"
                  aria-label={t('watchSeason')}
                >
                  {seasons.map((entry) => (
                    <option key={entry.releaseId} value={entry.releaseId}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div
            className={`relative w-full overflow-hidden rounded-md bg-black ${isFullscreen ? 'min-h-0 flex-1' : 'aspect-video max-h-[45vh]'}`}
          >
            {watch.aniliberty ? (
              <HlsVideo
                src={watch.aniliberty.hlsUrl}
                playing={watch.playing}
                videoRef={playerRef}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onCanPlay={handlePlayerReady}
                onPlaying={handlePlayerReady}
                onStaleSource={() => void handleAnilibertyError(false)}
                onRetry={() => void handleAnilibertyError(true)}
              />
            ) : (
              <ReactPlayer
                ref={playerRef}
                src={getFileUrl(watch.file)}
                playing={watch.playing}
                width="100%"
                height="100%"
                style={{ colorScheme: 'dark' }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onCanPlay={handlePlayerReady}
                onPlay={handlePlayerReady}
              />
            )}
            {skipTarget !== null && (
              <button
                type="button"
                onClick={() => void handleSkipSegment(skipTarget)}
                className="absolute right-3 bottom-3 rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-black/90"
              >
                {t('watchSkip')}
              </button>
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
              className="music-seek flex-1"
              style={{
                background: `linear-gradient(to right, #7f1d1d 0%, #ef4444 ${Math.min(100, (displayPosition / Math.max(duration, 0.01)) * 100)}%, rgb(255 255 255 / 0.2) ${Math.min(100, (displayPosition / Math.max(duration, 0.01)) * 100)}%)`
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleMuteToggle}
              title={muted ? t('watchUnmute') : t('watchMute')}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label={t('watchVolume')}
              className="music-seek w-20"
              style={{
                background: `linear-gradient(to right, #7f1d1d 0%, #ef4444 ${(muted ? 0 : volume) * 100}%, rgb(255 255 255 / 0.2) ${(muted ? 0 : volume) * 100}%)`
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleFullscreen}
              title={
                isFullscreen ? t('watchExitFullscreen') : t('watchFullscreen')
              }
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setJoinedUrl(sourceUrl)}
          className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-left transition hover:bg-primary/10"
        >
          {watch.aniliberty?.poster ? (
            <img
              src={watch.aniliberty.poster}
              alt=""
              className="h-20 w-14 shrink-0 rounded object-cover"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Clapperboard className="h-10 w-10 shrink-0 text-muted-foreground" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">
              {t('watchJoinTitle', {
                name: controller ? getRenderedUsername(controller) : '?'
              })}
            </span>
            {sourceName && (
              <span className="truncate text-xs text-muted-foreground">
                {sourceName}
              </span>
            )}
            <span className="text-sm text-primary">{t('watchJoin')}</span>
          </span>
        </button>
      )}
    </div>
  );
});

export { WatchPartyPanel };
