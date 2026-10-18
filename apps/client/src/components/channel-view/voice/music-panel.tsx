import { useOwnUserId, useUserById } from '@/features/server/users/hooks';
import {
  formatMediaPosition,
  getMusicPositionSec
} from '@/features/server/voice/helpers';
import { useMusicState } from '@/features/server/voice/hooks';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { useMusicVolume } from '@/helpers/music-volume';
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
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  getMusicPlaybackBridge,
  useMusicJoined
} from './music-playback-bridge';

type TMusicPanelProps = {
  channelId: number;
};

// The visible remote control for the listening party. Playback itself lives
// in the persistent MusicAudioHost: this panel only reads the shared music
// state, polls its clock for the slider, and sends commands through the
// playback bridge.
const MusicPanel = memo(({ channelId }: TMusicPanelProps) => {
  const { t } = useTranslation();
  const music = useMusicState(channelId);
  const controller = useUserById(music?.controllerUserId ?? -1);
  const ownUserId = useOwnUserId();
  const joined = useMusicJoined();
  const seekingRef = useRef(false);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [{ volume, muted }, setMusicVolume] = useMusicVolume();
  const [queueOpen, setQueueOpen] = useState(false);

  // the shared clock is the source of truth while the element lives in the
  // host: poll it so the slider keeps moving across track changes
  useEffect(() => {
    if (!joined || !music?.current) return;

    setDisplayPosition(getMusicPositionSec(music));

    if (!music.playing) return;

    const timer = window.setInterval(() => {
      if (seekingRef.current) return;

      setDisplayPosition(getMusicPositionSec(music));
    }, 500);

    return () => window.clearInterval(timer);
  }, [joined, music]);

  const handleSeekChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      seekingRef.current = true;
      setDisplayPosition(Number(event.target.value));
    },
    []
  );

  const handleSeekCommit = useCallback(async () => {
    seekingRef.current = false;

    await getMusicPlaybackBridge()?.seek(displayPosition);
  }, [displayPosition]);

  const handleSeekAbort = useCallback(() => {
    seekingRef.current = false;
  }, []);

  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);

      setMusicVolume(next, next === 0);
    },
    [setMusicVolume]
  );

  const handleMuteToggle = useCallback(() => {
    setMusicVolume(volume, !muted);
  }, [setMusicVolume, volume, muted]);

  // the X only closes the player for this listener: the element lives in
  // the host and goes quiet on leave, the party keeps playing for everyone
  // else. reopening is the join prompt below
  const handleLeaveClick = useCallback(() => {
    getMusicPlaybackBridge()?.leave();
  }, []);

  // stopping for everyone stays explicit and controller-only
  const handleStopParty = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicStop.mutate();
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [t]);

  const handleJoinClick = useCallback(() => {
    getMusicPlaybackBridge()?.join();
  }, []);

  const handlePlayClick = useCallback(async () => {
    await getMusicPlaybackBridge()?.play();
  }, []);

  const handlePauseClick = useCallback(async () => {
    await getMusicPlaybackBridge()?.pause();
  }, []);

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

  const handleQueueJump = useCallback(
    async (index: number) => {
      const trpc = getTRPCClient();

      try {
        await trpc.voice.musicJumpTo.mutate({ index });
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

  if (!music?.current) return null;

  const track = music.current;
  const seekMax = Math.max(track.durationSec ?? 0, 0.01);
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
        {music.controllerUserId === ownUserId && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => void handleStopParty()}
            title={t('musicStopParty')}
          >
            <Square className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleLeaveClick}
          title={t('musicLeave')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {joined ? (
        <>
          <div className="flex items-center gap-2">
            {music.playing ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void handlePauseClick()}
                title={t('musicPause')}
              >
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void handlePlayClick()}
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
              {formatMediaPosition(Math.max(track.durationSec ?? 0, 0))}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void handleSkipNext()}
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
              onClick={() => void handleShuffleToggle()}
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
              onClick={() => void handleRepeatCycle()}
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
              step={0.02}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label={t('watchVolume')}
              className="music-seek w-20"
              style={{
                background: `linear-gradient(to right, #7f1d1d 0%, #ef4444 ${(muted ? 0 : volume) * 100}%, rgb(255 255 255 / 0.2) ${(muted ? 0 : volume) * 100}%)`
              }}
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
                    onClick={() => void handleQueueJump(index)}
                    title={t('musicQueueJump')}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
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
          onClick={handleJoinClick}
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
