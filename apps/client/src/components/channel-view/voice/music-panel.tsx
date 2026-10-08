import { useOwnUserId, useUserById } from '@/features/server/users/hooks';
import {
  formatMediaPosition,
  getMusicPositionSec
} from '@/features/server/voice/helpers';
import { useMusicState } from '@/features/server/voice/hooks';
import { logVoice } from '@/helpers/browser-logger';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import { Button } from '@draevix/ui';
import {
  ListMusic,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HlsVideo } from './hls-video';

type TMusicPanelProps = {
  channelId: number;
};

const POSITION_SYNC_THRESHOLD_SEC = 3;
const SNAP_SETTLE_MS = 700;

const isHlsUrl = (url: string): boolean => /\.m3u8(\?|$)/i.test(url);

const MusicPanel = memo(({ channelId }: TMusicPanelProps) => {
  const { t } = useTranslation();
  const music = useMusicState(channelId);
  const controller = useUserById(music?.controllerUserId ?? -1);
  const ownUserId = useOwnUserId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsVideoRef = useRef<HTMLVideoElement | null>(null);
  const seekingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshedUrlRef = useRef<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const currentUrl = music?.current?.mp3Url ?? '';
  const isHls = isHlsUrl(currentUrl);
  const playerRef = isHls ? hlsVideoRef : audioRef;

  const snapToTarget = useCallback(() => {
    const player = playerRef.current;

    if (!player || seekingRef.current || !music) return;

    const target = getMusicPositionSec(music);
    const current = player.currentTime || 0;
    const drift = Math.abs(target - current);

    logVoice('music: reconcile', { target, current, drift });

    if (drift > POSITION_SYNC_THRESHOLD_SEC) {
      player.currentTime = target;
    }
  }, [music, playerRef]);

  useEffect(() => {
    if (!music?.current) {
      setDisplayPosition(0);
      setDuration(0);

      return;
    }

    if (seekingRef.current) return;

    setDisplayPosition(getMusicPositionSec(music));

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
  }, [music, snapToTarget]);

  // volume is per-listener, never broadcast
  useEffect(() => {
    for (const ref of [audioRef, hlsVideoRef]) {
      const player = ref.current;

      if (!player) continue;

      player.volume = volume;
      player.muted = muted;
    }
  });

  // same gating as video: only flip the element when it disagrees
  useEffect(() => {
    const player = playerRef.current;

    if (!player || !music?.current) return;

    if (player.paused && music.playing) {
      try {
        const result = player.play() as unknown as Promise<void> | undefined;

        void result?.catch(() => {});
      } catch {
        // autoplay blocked until the user interacts with the page
      }
    }

    if (!player.paused && !music.playing) {
      player.pause();
    }
  });

  const handlePlay = useCallback(async () => {
    const position = playerRef.current?.currentTime ?? displayPosition;

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicResume.mutate({ positionSec: position });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [displayPosition, playerRef, t]);

  const handlePause = useCallback(async () => {
    const position = playerRef.current?.currentTime ?? displayPosition;

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicPause.mutate({ positionSec: position });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [displayPosition, playerRef, t]);

  const handleSeekCommit = useCallback(async () => {
    seekingRef.current = false;

    if (playerRef.current) {
      playerRef.current.currentTime = displayPosition;
    }

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicSeek.mutate({ positionSec: displayPosition });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [displayPosition, playerRef, t]);

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

  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);

      setVolume(next);
      setMuted(next === 0);
    },
    []
  );

  const handleStop = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicStop.mutate();
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [t]);

  // every listener fires this when their element ends: the server's expect
  // guard makes the race harmless, only the first advance lands
  const currentTrackId = music?.current?.trackId;

  const handleEnded = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicNext.mutate({
        expectTrackId: currentTrackId
      });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [currentTrackId, t]);

  const handleTimeUpdate = useCallback(
    (event: React.SyntheticEvent<HTMLMediaElement>) => {
      if (!seekingRef.current) {
        setDisplayPosition(event.currentTarget.currentTime);
      }
    },
    []
  );

  const handleLoadedMetadata = useCallback(
    (event: React.SyntheticEvent<HTMLMediaElement>) => {
      setDuration(event.currentTarget.duration);
      snapToTarget();
    },
    [snapToTarget]
  );

  const handleStaleSource = useCallback(async () => {
    if (!currentUrl || refreshedUrlRef.current === currentUrl) return;

    refreshedUrlRef.current = currentUrl;

    logVoice('music: refresh', { currentUrl });

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicRefresh.mutate();
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [currentUrl, t]);

  const handleQueueRemove = useCallback(
    async (index: number) => {
      const trpc = getTRPCClient();

      try {
        await trpc.voice.musicQueueRemove.mutate({ index });
      } catch (error) {
        toast.error(getTrpcError(error, t('failedMusicTogether')));
      }
    },
    [t]
  );

  const handleQueueClear = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicQueueClear.mutate();
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [t]);

  const handleSkipNext = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicNext.mutate({});
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [t]);

  const handleShuffleToggle = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicSetShuffle.mutate({
        shuffled: !(music?.shuffle ?? false)
      });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [music?.shuffle, t]);

  const handleRepeatCycle = useCallback(async () => {
    const next =
      music?.repeatMode === 'off'
        ? 'all'
        : music?.repeatMode === 'all'
          ? 'one'
          : 'off';

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicSetRepeat.mutate({ mode: next });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [music?.repeatMode, t]);

  const trackUrl = music?.current?.mp3Url ?? '';

  // same opt-in as watch and screen shares: someone else's party shows a
  // join prompt instead of auto-playing. the starter joins implicitly
  const [joinedUrl, setJoinedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!trackUrl) {
      setJoinedUrl(null);
      return;
    }

    if (music?.controllerUserId === ownUserId) {
      setJoinedUrl(trackUrl);
    }
  }, [trackUrl, music?.controllerUserId, ownUserId]);

  if (!music?.current) return null;

  const track = music.current;
  const joined = joinedUrl !== null && joinedUrl === track.mp3Url;
  const seekMax = Math.max(duration, track.durationSec, 0.01);
  const seekRatio = Math.min(1, Math.max(0, displayPosition / seekMax));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/50 p-3">
      <div className="flex items-center gap-2">
        {track.artworkUrl ? (
          <img
            src={track.artworkUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded object-cover"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{track.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {track.author ||
              t('musicControlledBy', {
                name: controller ? getRenderedUsername(controller) : '?'
              })}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setQueueOpen((open) => !open)}
          title={t('musicQueue')}
        >
          <ListMusic className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleStop}
          title={t('musicStop')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {joined ? (
        <>
          {isHls ? (
            <div className="hidden">
              <HlsVideo
                src={currentUrl}
                playing={music.playing}
                videoRef={hlsVideoRef}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onStaleSource={() => void handleStaleSource()}
                onRetry={() => void handleStaleSource()}
              />
            </div>
          ) : (
            <audio
              ref={audioRef}
              src={currentUrl}
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={snapToTarget}
              onEnded={() => void handleEnded()}
              onError={() => void handleStaleSource()}
            />
          )}
          <div className="flex items-center gap-2">
            {music.playing ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={handlePause}
                title={t('musicPause')}
              >
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                onClick={handlePlay}
                title={t('musicPlay')}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatMediaPosition(displayPosition)}
            </span>
            <input
              type="range"
              min={0}
              max={seekMax}
              step={0.1}
              value={Math.min(displayPosition, seekMax)}
              onChange={handleSeekChange}
              onPointerUp={() => void handleSeekCommit()}
              onPointerCancel={handleSeekAbort}
              onLostPointerCapture={handleSeekAbort}
              aria-label={t('musicSeek')}
              className="music-seek flex-1"
              style={{
                background: `linear-gradient(to right, #7f1d1d 0%, #ef4444 ${seekRatio * 100}%, rgb(255 255 255 / 0.2) ${seekRatio * 100}%)`
              }}
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatMediaPosition(Math.max(duration, track.durationSec, 0))}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSkipNext}
              disabled={
                music.queue.length === 0 &&
                !(music.repeatMode === 'all' && music.current)
              }
              title={t('musicNext')}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleShuffleToggle}
              title={t('musicShuffle')}
              className={
                music.shuffle
                  ? 'border border-primary ring-2 ring-primary/60'
                  : ''
              }
            >
              <Shuffle className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleRepeatCycle}
              title={
                music.repeatMode === 'off'
                  ? t('musicRepeatOff')
                  : music.repeatMode === 'all'
                    ? t('musicRepeatAll')
                    : t('musicRepeatOne')
              }
              className={
                music.repeatMode !== 'off'
                  ? 'border border-primary ring-2 ring-primary/60'
                  : ''
              }
            >
              {music.repeatMode === 'one' ? (
                <Repeat1 className="h-4 w-4" />
              ) : (
                <Repeat className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMuted((muted) => !muted)}
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
              className="w-20"
            />
          </div>
          {queueOpen && (
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {music.queue.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  {t('musicQueueEmpty')}
                </span>
              )}
              {music.queue.map((entry, index) => (
                <div
                  key={`${entry.trackId}-${index}`}
                  className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {entry.title}
                    {entry.author ? ` — ${entry.author}` : ''}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleQueueRemove(index)}
                    title={t('musicQueueRemove')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {music.queue.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleQueueClear()}
                >
                  {t('musicQueueClear')}
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setJoinedUrl(trackUrl)}
          className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-left transition hover:bg-primary/10"
        >
          {track.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded object-cover"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Music2 className="h-10 w-10 shrink-0 text-muted-foreground" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">
              {t('musicJoinTitle', {
                name: controller ? getRenderedUsername(controller) : '?'
              })}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {track.title}
              {track.author ? ` — ${track.author}` : ''}
            </span>
            <span className="text-sm text-primary">{t('musicJoin')}</span>
          </span>
        </button>
      )}
    </div>
  );
});

export { MusicPanel };
