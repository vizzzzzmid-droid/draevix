import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { useUserById } from '@/features/server/users/hooks';
import {
  formatMediaPosition,
  getMusicPositionSec
} from '@/features/server/voice/helpers';
import { useMusicState } from '@/features/server/voice/hooks';
import { useMusicVolume } from '@/helpers/music-volume';
import { getTRPCClient, type TRouterOutputs } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input
} from '@draevix/ui';
import {
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX
} from 'lucide-react';
import { memo, useCallback, useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UserAvatar } from '../../user-avatar';
import type { TDialogBaseProps } from '../types';

type TMusicResult = TRouterOutputs['voice']['musicSearch']['results'][number];

type TMusicTab = 'search' | 'queue';
type TMusicSourceTab = 'soundcloud' | 'audius';

const SOURCE_LABEL: Record<TMusicSourceTab, string> = {
  soundcloud: 'SoundCloud',
  audius: 'Audius'
};

const toQueueInput = (entry: TMusicResult) => ({
  trackId: entry.trackId,
  title: entry.title,
  author: entry.author,
  artworkUrl: entry.artworkUrl,
  durationSec: entry.durationSec,
  permalinkUrl: entry.permalinkUrl,
  source: entry.source,
  sourceId: entry.sourceId
});

const MusicPickerDialog = memo(({ isOpen, close }: TDialogBaseProps) => {
  const { t } = useTranslation(['dialogs', 'common']);
  const channelId = useCurrentVoiceChannelId();
  const music = useMusicState(channelId ?? -1);
  const [{ volume, muted }, setMusicVolume] = useMusicVolume();
  const [tab, setTab] = useState<TMusicTab>('search');
  const [source, setSource] = useState<TMusicSourceTab>('soundcloud');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TMusicResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingPlaylist, setResolvingPlaylist] = useState(false);
  const [busyTrackId, setBusyTrackId] = useState<number | null>(null);

  // progress ticks locally while playing; seeks commit through the server
  const [, forceTick] = useReducer((value: number) => value + 1, 0);
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setTab('search');
      setSource('soundcloud');
    }
  }, [isOpen]);

  const isPlaying = music?.playing === true;
  const currentTrackId = music?.current?.trackId;

  useEffect(() => {
    if (!isPlaying || currentTrackId === undefined) return;

    const timer = setInterval(forceTick, 500);

    return () => clearInterval(timer);
  }, [isPlaying, currentTrackId]);

  const position = music ? getMusicPositionSec(music) : 0;
  const shownPosition = seeking ? seekValue : position;
  const durationMax = Math.max(music?.current?.durationSec ?? 0.01, 0.01);
  const seekRatio = Math.min(100, (shownPosition / durationMax) * 100);
  const current = music?.current;

  const handlePlaylistAdd = useCallback(
    async (playlistLink: string) => {
      const trimmed = playlistLink.trim();

      if (!trimmed || resolvingPlaylist) return;

      setResolvingPlaylist(true);

      const trpc = getTRPCClient();

      try {
        const { tracks } = await trpc.voice.musicPlaylist.query({
          url: trimmed
        });
        const playable = tracks.filter((entry) => entry.streamable);

        if (playable.length === 0) {
          toast.error(t('musicPlaylistEmpty'));
          return;
        }

        const [first, ...rest] = playable;

        await trpc.voice.musicQueueAdd.mutate({
          track: toQueueInput(first!),
          tracks: rest.map(toQueueInput)
        });
        toast.success(t('common:musicQueued'));
        setTab('queue');
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedMusicTogether')));
      } finally {
        setResolvingPlaylist(false);
      }
    },
    [resolvingPlaylist, t]
  );

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();

    if (!trimmed || searching) return;

    // a playlist link in the search box resolves straight into the queue
    if (/soundcloud\.com\/[^/]+\/sets(\/|$|\?)/i.test(trimmed)) {
      await handlePlaylistAdd(trimmed);
      return;
    }

    setSearching(true);

    const trpc = getTRPCClient();

    try {
      const { results } = await trpc.voice.musicSearch.query({
        query: trimmed,
        limit: 50,
        source
      });

      setResults(results.filter((entry) => entry.streamable));
    } catch (error) {
      setResults([]);
      toast.error(getTrpcError(error, t('common:failedMusicTogether')));
    } finally {
      setSearching(false);
    }
  }, [query, searching, source, handlePlaylistAdd, t]);

  const handlePlayNow = useCallback(
    async (entry: TMusicResult) => {
      if (busyTrackId !== null) return;

      setBusyTrackId(entry.trackId);

      const trpc = getTRPCClient();

      try {
        await trpc.voice.musicPlay.mutate({ track: toQueueInput(entry) });
        toast.success(t('common:musicPartyStarted'));
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedMusicTogether')));
      } finally {
        setBusyTrackId(null);
      }
    },
    [busyTrackId, t]
  );

  const handleQueueAdd = useCallback(
    async (entry: TMusicResult) => {
      if (busyTrackId !== null) return;

      setBusyTrackId(entry.trackId);

      const trpc = getTRPCClient();

      try {
        await trpc.voice.musicQueueAdd.mutate({ track: toQueueInput(entry) });
        toast.success(t('common:musicQueued'));
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedMusicTogether')));
      } finally {
        setBusyTrackId(null);
      }
    },
    [busyTrackId, t]
  );

  const handleTogglePlay = useCallback(async () => {
    if (!music?.current) return;

    const trpc = getTRPCClient();

    try {
      if (music.playing) {
        await trpc.voice.musicPause.mutate({
          positionSec: getMusicPositionSec(music)
        });
      } else {
        await trpc.voice.musicResume.mutate({
          positionSec: getMusicPositionSec(music)
        });
      }
    } catch (error) {
      toast.error(getTrpcError(error, t('common:failedMusicTogether')));
    }
  }, [music, t]);

  const handleSeekCommit = useCallback(
    async (value: number) => {
      setSeeking(false);

      const trpc = getTRPCClient();

      try {
        await trpc.voice.musicSeek.mutate({ positionSec: value });
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedMusicTogether')));
      }
    },
    [t]
  );

  const handleSkipNext = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicNext.mutate({});
    } catch (error) {
      toast.error(getTrpcError(error, t('common:failedMusicTogether')));
    }
  }, [t]);

  const handleShuffleToggle = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicSetShuffle.mutate({
        shuffled: !(music?.shuffle ?? false)
      });
    } catch (error) {
      toast.error(getTrpcError(error, t('common:failedMusicTogether')));
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
      toast.error(getTrpcError(error, t('common:failedMusicTogether')));
    }
  }, [music?.repeatMode, t]);

  const handleQueueRemove = useCallback(
    async (index: number) => {
      const trpc = getTRPCClient();

      try {
        await trpc.voice.musicQueueRemove.mutate({ index });
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedMusicTogether')));
      }
    },
    [t]
  );

  const tabs: { id: TMusicTab; label: string }[] = [
    { id: 'search', label: t('musicTabSearch') },
    {
      id: 'queue',
      label: `${t('musicTabQueue')}${
        music && music.queue.length > 0 ? ` (${music.queue.length})` : ''
      }`
    }
  ];

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="max-h-[85vh] w-full max-w-2xl overflow-x-clip overflow-y-auto sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('musicPickerTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('musicPickerDesc')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-1 border-b border-border/50 pb-2">
          {tabs.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant={tab === entry.id ? 'default' : 'ghost'}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {(Object.keys(SOURCE_LABEL) as TMusicSourceTab[]).map((entry) => (
            <Button
              key={entry}
              size="sm"
              variant={source === entry ? 'default' : 'outline'}
              onClick={() => {
                setSource(entry);
                setResults([]);
              }}
            >
              {SOURCE_LABEL[entry]}
            </Button>
          ))}
        </div>

        {tab === 'search' && (
          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleSearch();
                }}
                placeholder={t('musicSearchPlaceholder')}
                className="min-w-0"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSearch()}
                disabled={searching || resolvingPlaylist || !query.trim()}
              >
                {t('musicFind')}
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              {t('musicPlaylistHint')}
            </span>
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {searching && (
                <span className="text-sm text-muted-foreground">
                  {t('musicSearching')}
                </span>
              )}
              {results.map((entry) => (
                <div
                  key={entry.trackId}
                  className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
                >
                  {entry.artworkUrl ? (
                    <img
                      src={entry.artworkUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded object-cover"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <Music2 className="h-10 w-10 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{entry.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        entry.author,
                        entry.durationSec
                          ? formatMediaPosition(entry.durationSec)
                          : ''
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleQueueAdd(entry)}
                    disabled={busyTrackId !== null}
                    title={t('musicQueueAdd')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void handlePlayNow(entry)}
                    disabled={busyTrackId !== null}
                    title={t('musicPlayNow')}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'queue' && (
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {(music?.queue.length ?? 0) === 0 && (
              <span className="text-sm text-muted-foreground">
                {t('musicQueueEmpty')}
              </span>
            )}
            {(music?.queue ?? []).map((entry, index) => (
              <QueueRow
                key={`${entry.trackId}-${index}`}
                index={index}
                title={entry.title}
                author={entry.author}
                artworkUrl={entry.artworkUrl}
                addedByUserId={entry.addedByUserId}
                source={entry.source}
                onRemove={() => void handleQueueRemove(index)}
              />
            ))}
          </div>
        )}

        {current && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-card p-2.5">
            <div className="flex items-center gap-2">
              {current.artworkUrl ? (
                <img
                  src={current.artworkUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <Music2 className="h-12 w-12 shrink-0 text-muted-foreground" />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {current.title}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {[current.author, SOURCE_LABEL[current.source]]
                    .filter(Boolean)
                    .join(' • ')}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleTogglePlay}
                title={music?.playing ? t('musicPause') : t('musicPlay')}
              >
                {music?.playing ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSkipNext}
                disabled={(music?.queue.length ?? 0) === 0}
                title={t('musicNext')}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatMediaPosition(shownPosition)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(current.durationSec, shownPosition, 0.01)}
                step={0.1}
                value={Math.min(
                  shownPosition,
                  Math.max(current.durationSec, 0.01)
                )}
                onChange={(event) => {
                  setSeeking(true);
                  setSeekValue(Number(event.target.value));
                }}
                onPointerUp={(event) =>
                  void handleSeekCommit(
                    Number((event.target as HTMLInputElement).value)
                  )
                }
                aria-label={t('musicSeek')}
                className="music-seek min-w-0 flex-1"
                style={{
                  background: `linear-gradient(to right, #7f1d1d 0%, #ef4444 ${seekRatio}%, rgb(255 255 255 / 0.2) ${seekRatio}%)`
                }}
              />
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatMediaPosition(current.durationSec)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleShuffleToggle}
                title={t('musicShuffle')}
                className={
                  music?.shuffle
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
                  music?.repeatMode === 'off'
                    ? t('musicRepeatOff')
                    : music?.repeatMode === 'all'
                      ? t('musicRepeatAll')
                      : t('musicRepeatOne')
                }
                className={
                  music && music.repeatMode !== 'off'
                    ? 'border border-primary ring-2 ring-primary/60'
                    : ''
                }
              >
                {music?.repeatMode === 'one' ? (
                  <Repeat1 className="h-4 w-4" />
                ) : (
                  <Repeat className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setMusicVolume(volume, !muted)}
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
                onChange={(event) => {
                  const next = Number(event.target.value);

                  setMusicVolume(next, next === 0);
                }}
                aria-label={t('watchVolume')}
                className="music-seek w-20 min-w-0"
                style={{
                  background: `linear-gradient(to right, #7f1d1d 0%, #ef4444 ${(muted ? 0 : volume) * 100}%, rgb(255 255 255 / 0.2) ${(muted ? 0 : volume) * 100}%)`
                }}
              />
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round((muted ? 0 : volume) * 100)}%
              </span>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>{t('cancel')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

const QueueRow = memo(
  ({
    index,
    title,
    author,
    artworkUrl,
    addedByUserId,
    source,
    onRemove
  }: {
    index: number;
    title: string;
    author: string;
    artworkUrl: string | null;
    addedByUserId: number | null;
    source: TMusicSourceTab;
    onRemove: () => void;
  }) => {
    const { t } = useTranslation(['dialogs', 'common']);
    const addedBy = useUserById(addedByUserId ?? -1);

    return (
      <div className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm">
        <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
          {index + 1}
        </span>
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded object-cover"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Music2 className="h-8 w-8 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            {title}
            {author ? ` — ${author}` : ''}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {SOURCE_LABEL[source]}
          </span>
        </span>
        {addedBy && <UserAvatar userId={addedBy.id} />}
        <Button
          size="icon"
          variant="ghost"
          onClick={onRemove}
          title={t('musicQueueRemove')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }
);

export { MusicPickerDialog };
