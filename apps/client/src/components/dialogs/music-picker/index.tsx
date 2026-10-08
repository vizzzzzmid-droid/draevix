import { formatMediaPosition } from '@/features/server/voice/helpers';
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
import { ListMusic, Music2, Play, Plus } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';

type TSoundCloudResult =
  TRouterOutputs['voice']['musicSearch']['results'][number];

const toQueueInput = (entry: TSoundCloudResult) => ({
  trackId: entry.trackId,
  title: entry.title,
  author: entry.author,
  artworkUrl: entry.artworkUrl,
  durationSec: entry.durationSec,
  permalinkUrl: entry.permalinkUrl
});

const MusicPickerDialog = memo(({ isOpen, close }: TDialogBaseProps) => {
  const { t } = useTranslation(['dialogs', 'common']);
  const [query, setQuery] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [results, setResults] = useState<TSoundCloudResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingPlaylist, setResolvingPlaylist] = useState(false);
  const [busyTrackId, setBusyTrackId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setPlaylistUrl('');
      setResults([]);
    }
  }, [isOpen]);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();

    if (!trimmed || searching) return;

    setSearching(true);

    const trpc = getTRPCClient();

    try {
      const { results } = await trpc.voice.musicSearch.query({
        query: trimmed,
        limit: 10
      });

      setResults(results.filter((entry) => entry.streamable));
    } catch (error) {
      setResults([]);
      toast.error(getTrpcError(error, t('common:failedMusicTogether')));
    } finally {
      setSearching(false);
    }
  }, [query, searching, t]);

  const handlePlayNow = useCallback(
    async (entry: TSoundCloudResult) => {
      if (busyTrackId !== null) return;

      setBusyTrackId(entry.trackId);

      const trpc = getTRPCClient();

      try {
        await trpc.voice.musicPlay.mutate({ track: toQueueInput(entry) });
        toast.success(t('common:musicPartyStarted'));
        close();
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedMusicTogether')));
      } finally {
        setBusyTrackId(null);
      }
    },
    [busyTrackId, close, t]
  );

  const handleQueueAdd = useCallback(
    async (entry: TSoundCloudResult) => {
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

  const handlePlaylistAdd = useCallback(async () => {
    const trimmed = playlistUrl.trim();

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
      close();
    } catch (error) {
      toast.error(getTrpcError(error, t('common:failedMusicTogether')));
    } finally {
      setResolvingPlaylist(false);
    }
  }, [playlistUrl, resolvingPlaylist, close, t]);

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('musicPickerTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('musicPickerDesc')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSearch();
            }}
            placeholder={t('musicSearchPlaceholder')}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSearch()}
            disabled={searching || !query.trim()}
          >
            {t('musicFind')}
          </Button>
        </div>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
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
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <ListMusic className="h-4 w-4" />
            {t('musicPlaylistTitle')}
          </span>
          <div className="flex items-center gap-2">
            <Input
              value={playlistUrl}
              onChange={(event) => setPlaylistUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handlePlaylistAdd();
              }}
              placeholder={t('musicPlaylistPlaceholder')}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePlaylistAdd()}
              disabled={resolvingPlaylist || !playlistUrl.trim()}
            >
              {t('musicPlaylistAdd')}
            </Button>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>{t('cancel')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

export { MusicPickerDialog };
