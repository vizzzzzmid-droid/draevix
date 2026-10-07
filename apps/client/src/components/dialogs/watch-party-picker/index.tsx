import { useCan, useInfo } from '@/features/server/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { uploadFile } from '@/helpers/upload-file';
import { getTRPCClient, type TRouterOutputs } from '@/lib/trpc';
import { getTrpcError, Permission } from '@draevix/shared';
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
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  MonitorPlay,
  Play,
  Trash2,
  Upload
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';

type TLibraryVideo = TRouterOutputs['library']['list']['videos'][number];

type TAnilibertyResult =
  TRouterOutputs['voice']['anilibertySearch']['results'][number];

type TAnilibertyDetails = TRouterOutputs['voice']['anilibertyDescribe'];

const WatchPartyPickerDialog = memo(({ isOpen, close }: TDialogBaseProps) => {
  const { t } = useTranslation(['dialogs', 'common']);
  const can = useCan();
  const info = useInfo();
  const ownUserId = useOwnUserId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [videos, setVideos] = useState<TLibraryVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [anilibertyQuery, setAnilibertyQuery] = useState('');
  const [anilibertyResults, setAnilibertyResults] = useState<
    TAnilibertyResult[]
  >([]);
  const [searchingAniliberty, setSearchingAniliberty] = useState(false);
  const [pickedRelease, setPickedRelease] = useState<TAnilibertyResult | null>(
    null
  );
  const [releaseDetails, setReleaseDetails] =
    useState<TAnilibertyDetails | null>(null);
  const [describingRelease, setDescribingRelease] = useState(false);
  const [anilibertyEpisode, setAnilibertyEpisode] = useState(1);
  const [startingAniliberty, setStartingAniliberty] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // vertical wheel over the strip scrolls it horizontally instead of moving
  // the dialog: native listener, react wheel handlers are passive here
  useEffect(() => {
    const strip = resultsRef.current;

    if (!strip) return;

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };

    strip.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      strip.removeEventListener('wheel', onWheel);
    };
  }, [anilibertyResults.length]);

  const libraryLocked = info?.watchLibraryLocked ?? true;
  const canManageLibrary = libraryLocked
    ? can(Permission.MANAGE_SETTINGS)
    : can(Permission.UPLOAD_FILES);

  const canDeleteVideo = useCallback(
    (entry: TLibraryVideo) => {
      if (can(Permission.MANAGE_SETTINGS)) return true;

      return (
        !libraryLocked &&
        entry.addedByUserId !== null &&
        entry.addedByUserId === ownUserId
      );
    },
    [can, libraryLocked, ownUserId]
  );

  const fetchVideos = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      const { videos } = await trpc.library.list.query();

      setVideos(videos);
    } catch (error) {
      toast.error(getTrpcError(error, t('common:failedLoadLibrary')));
      close();
    }
  }, [close, t]);

  useEffect(() => {
    if (!isOpen) {
      setAnilibertyQuery('');
      setAnilibertyResults([]);
      setPickedRelease(null);
      setReleaseDetails(null);
      return;
    }

    setLoading(true);
    void fetchVideos().finally(() => setLoading(false));
  }, [isOpen, fetchVideos]);

  const handlePick = useCallback(
    async (fileId: number) => {
      const trpc = getTRPCClient();

      try {
        await trpc.voice.selectWatchFile.mutate({ fileId });
        toast.success(t('common:watchPartyStarted'));
        close();
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedWatchTogether')));
      }
    },
    [close, t]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilePicked = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0];

      event.target.value = '';

      if (!picked) return;

      setUploading(true);

      try {
        const temp = await uploadFile(picked);

        if (!temp) return;

        const trpc = getTRPCClient();

        await trpc.library.add.mutate({ tempFileId: temp.id });
        await fetchVideos();
        toast.success(t('common:watchLibraryUploaded'));
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedWatchTogether')));
      } finally {
        setUploading(false);
      }
    },
    [fetchVideos, t]
  );

  const handleDelete = useCallback(
    async (fileId: number) => {
      const trpc = getTRPCClient();

      try {
        await trpc.library.remove.mutate({ fileId });
        await fetchVideos();
        toast.success(t('common:watchLibraryDeleted'));
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedWatchTogether')));
      }
    },
    [fetchVideos, t]
  );

  const scrollResults = useCallback((direction: 'left' | 'right') => {
    resultsRef.current?.scrollBy({
      left: direction === 'left' ? -240 : 240,
      behavior: 'smooth'
    });
  }, []);

  const handleAnilibertySearch = useCallback(async () => {
    const trimmed = anilibertyQuery.trim();

    if (!trimmed || searchingAniliberty) return;

    setSearchingAniliberty(true);
    setPickedRelease(null);
    setReleaseDetails(null);

    const trpc = getTRPCClient();

    try {
      const { results } = await trpc.voice.anilibertySearch.query({
        query: trimmed,
        limit: 10
      });

      setAnilibertyResults(results);
    } catch (error) {
      setAnilibertyResults([]);
      toast.error(getTrpcError(error, t('common:failedWatchTogether')));
    } finally {
      setSearchingAniliberty(false);
    }
  }, [anilibertyQuery, searchingAniliberty, t]);

  const handleAnilibertyPick = useCallback(
    async (entry: TAnilibertyResult) => {
      setPickedRelease(entry);
      setReleaseDetails(null);
      setDescribingRelease(true);

      const trpc = getTRPCClient();

      try {
        const described = await trpc.voice.anilibertyDescribe.query({
          releaseId: entry.releaseId
        });

        if (described.blocked) {
          setPickedRelease(null);
          toast.error(t('watchAnilibertyBlocked'));
          return;
        }

        setReleaseDetails(described);
        setAnilibertyEpisode(1);
      } catch (error) {
        setPickedRelease(null);
        toast.error(getTrpcError(error, t('common:failedWatchTogether')));
      } finally {
        setDescribingRelease(false);
      }
    },
    [t]
  );

  const handleAnilibertyStart = useCallback(async () => {
    if (!pickedRelease || startingAniliberty) return;

    setStartingAniliberty(true);

    const trpc = getTRPCClient();

    try {
      await trpc.voice.anilibertySelect.mutate({
        releaseId: pickedRelease.releaseId,
        episode: anilibertyEpisode
      });
      toast.success(t('common:watchPartyStarted'));
      close();
    } catch (error) {
      toast.error(getTrpcError(error, t('common:failedWatchTogether')));
    } finally {
      setStartingAniliberty(false);
    }
  }, [pickedRelease, startingAniliberty, anilibertyEpisode, close, t]);

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('watchPickerTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('watchPickerDesc')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {loading && (
            <span className="text-sm text-muted-foreground">
              {t('watchPickerLoading')}
            </span>
          )}
          {!loading && videos.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clapperboard className="h-4 w-4" />
              {t('watchPickerEmpty')}
            </div>
          )}
          {videos.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
            >
              <button
                type="button"
                onClick={() => handlePick(entry.fileId)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Play className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {entry.file.originalName}
                </span>
              </button>
              {canDeleteVideo(entry) && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(entry.fileId)}
                  title={t('common:watchDelete')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {canManageLibrary && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFilePicked}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              <Upload className="h-4 w-4" />
              {t('common:watchUploadMovie')}
            </Button>
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2 border-t border-border/50 pt-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <MonitorPlay className="h-4 w-4" />
            {t('watchAnilibertyTitle')}
          </span>
          <div className="flex items-center gap-2">
            <Input
              value={anilibertyQuery}
              onChange={(event) => setAnilibertyQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleAnilibertySearch();
              }}
              placeholder={t('watchAnilibertyPlaceholder')}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleAnilibertySearch()}
              disabled={searchingAniliberty || !anilibertyQuery.trim()}
            >
              {t('watchAnilibertyFind')}
            </Button>
          </div>
          {searchingAniliberty && (
            <span className="text-sm text-muted-foreground">
              {t('watchPickerLoading')}
            </span>
          )}
          {anilibertyResults.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => scrollResults('left')}
                title={t('watchScrollLeft')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div
                ref={resultsRef}
                className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
              >
                {anilibertyResults.map((entry) => {
                  const selected = pickedRelease?.releaseId === entry.releaseId;

                  return (
                    <button
                      key={entry.releaseId}
                      type="button"
                      onClick={() => void handleAnilibertyPick(entry)}
                      className={`group relative w-28 shrink-0 overflow-hidden rounded-lg border text-left transition ${
                        selected
                          ? 'border-primary ring-2 ring-primary/60'
                          : 'border-border/50 hover:border-primary/60'
                      }`}
                    >
                      <div className="aspect-[2/3] w-full bg-muted">
                        {entry.poster && (
                          <img
                            src={entry.poster}
                            alt={entry.title}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                        <div className="truncate text-xs font-medium text-white">
                          {entry.title}
                        </div>
                        <div className="truncate text-[11px] text-white/70">
                          {[
                            entry.year ? String(entry.year) : '',
                            entry.episodesTotal
                              ? t('watchAnilibertyEpisodes', {
                                  count: entry.episodesTotal
                                })
                              : ''
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => scrollResults('right')}
                title={t('watchScrollRight')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          {describingRelease && (
            <span className="text-sm text-muted-foreground">
              {t('watchPickerLoading')}
            </span>
          )}
          {pickedRelease && releaseDetails && !describingRelease && (
            <div className="flex gap-3 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
              {pickedRelease.poster && (
                <img
                  src={pickedRelease.poster}
                  alt={pickedRelease.title}
                  className="h-28 w-20 shrink-0 rounded-md object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {pickedRelease.title}
                  </div>
                  {pickedRelease.titleOrig && (
                    <div className="truncate text-xs text-muted-foreground">
                      {pickedRelease.titleOrig}
                    </div>
                  )}
                </div>
                {releaseDetails.episodes.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t('watchNoEpisodes')}
                  </span>
                ) : (
                  <>
                    <select
                      value={anilibertyEpisode}
                      onChange={(event) =>
                        setAnilibertyEpisode(Number(event.target.value))
                      }
                      className="w-full truncate rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      aria-label={t('watchAnilibertyEpisode')}
                    >
                      {releaseDetails.episodes.map((ep) => (
                        <option key={ep.ordinal} value={ep.ordinal}>
                          {t('watchEpisodeN', { episode: ep.ordinal })}
                          {ep.name ? ` — ${ep.name}` : ''}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => void handleAnilibertyStart()}
                      disabled={startingAniliberty}
                      className="w-full"
                    >
                      <Play className="h-4 w-4" />
                      {t('watchAnilibertyWatch')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>{t('cancel')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

export { WatchPartyPickerDialog };
