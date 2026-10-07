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
import { Clapperboard, MonitorPlay, Play, Trash2, Upload } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';

type TLibraryVideo = TRouterOutputs['library']['list']['videos'][number];

type TKodikResult = TRouterOutputs['voice']['kodikSearch']['results'][number];

type TKodikDetails = TRouterOutputs['voice']['kodikDescribe'];

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
  const [kodikQuery, setKodikQuery] = useState('');
  const [kodikResults, setKodikResults] = useState<TKodikResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<TKodikResult | null>(null);
  const [details, setDetails] = useState<TKodikDetails | null>(null);
  const [describing, setDescribing] = useState(false);
  const [translationId, setTranslationId] = useState('');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [startingKodik, setStartingKodik] = useState(false);
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
      setKodikQuery('');
      setKodikResults([]);
      setPicked(null);
      setDetails(null);
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

  const handleKodikSearch = useCallback(async () => {
    const trimmed = kodikQuery.trim();

    if (!trimmed || searching) return;

    setSearching(true);
    setPicked(null);
    setDetails(null);

    const trpc = getTRPCClient();

    try {
      const { results } = await trpc.voice.kodikSearch.query({
        query: trimmed,
        limit: 10
      });

      setKodikResults(results);
    } catch (error) {
      setKodikResults([]);
      toast.error(getTrpcError(error, t('common:failedWatchTogether')));
    } finally {
      setSearching(false);
    }
  }, [kodikQuery, searching, t]);

  const handleKodikPick = useCallback(
    async (entry: TKodikResult) => {
      if (entry.blocked) {
        toast.error(t('watchKodikBlocked'));
        return;
      }

      if (entry.kind !== 'serial') {
        setPicked(entry);
        setDetails(null);
        setTranslationId(entry.translation.id);
        setSeason(1);
        setEpisode(0);
        return;
      }

      setPicked(entry);
      setDetails(null);
      setDescribing(true);

      const trpc = getTRPCClient();

      try {
        const described = await trpc.voice.kodikDescribe.query({
          link: entry.link
        });

        setDetails(described);

        const preferred =
          described.translations.find((tr) => tr.id === entry.translation.id) ??
          described.translations.find((tr) => tr.selected) ??
          described.translations[0];

        setTranslationId(preferred?.id ?? '');
        setSeason(described.seasons[0] ?? 1);
        setEpisode(1);
      } catch (error) {
        setPicked(null);
        toast.error(getTrpcError(error, t('common:failedWatchTogether')));
      } finally {
        setDescribing(false);
      }
    },
    [t]
  );

  const handleKodikStart = useCallback(async () => {
    if (!picked || startingKodik) return;

    setStartingKodik(true);

    const trpc = getTRPCClient();

    try {
      await trpc.voice.kodikSelect.mutate({
        link: picked.link,
        kodikId: picked.kodikId,
        title: picked.title,
        titleOrig: picked.titleOrig,
        translationId: translationId || undefined,
        translationTitle:
          details?.translations.find((tr) => tr.id === translationId)?.title ??
          picked.translation.title,
        season: picked.kind === 'serial' ? season : undefined,
        episode: picked.kind === 'serial' ? episode : undefined,
        poster: picked.poster ?? undefined
      });
      toast.success(t('common:watchPartyStarted'));
      close();
    } catch (error) {
      toast.error(getTrpcError(error, t('common:failedWatchTogether')));
    } finally {
      setStartingKodik(false);
    }
  }, [
    picked,
    startingKodik,
    translationId,
    details,
    season,
    episode,
    close,
    t
  ]);

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
          toast.error(t('watchKodikBlocked'));
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
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <MonitorPlay className="h-4 w-4" />
            {t('watchKodikTitle')}
          </span>
          <div className="flex items-center gap-2">
            <Input
              value={kodikQuery}
              onChange={(event) => setKodikQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleKodikSearch();
              }}
              placeholder={t('watchKodikPlaceholder')}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleKodikSearch()}
              disabled={searching || !kodikQuery.trim()}
            >
              {t('watchKodikFind')}
            </Button>
          </div>
          {kodikResults.map((entry) => (
            <div
              key={`${entry.kodikId}-${entry.translation.id}`}
              className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
            >
              {entry.poster && (
                <img
                  src={entry.poster}
                  alt=""
                  className="h-10 w-7 shrink-0 rounded object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => void handleKodikPick(entry)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Play className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {entry.title}
                    {entry.year ? ` (${entry.year})` : ''}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      entry.translation.title,
                      entry.kind === 'serial' && entry.episodesCount
                        ? t('watchKodikEpisodes', {
                            count: entry.episodesCount
                          })
                        : '',
                      entry.quality
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </span>
                </span>
              </button>
            </div>
          ))}
          {describing && (
            <span className="text-sm text-muted-foreground">
              {t('watchPickerLoading')}
            </span>
          )}
          {picked && !describing && (
            <div className="flex flex-col gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm">
              <span className="truncate font-medium">{picked.title}</span>
              {details && picked.kind === 'serial' && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={translationId}
                    onChange={(event) => setTranslationId(event.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                    aria-label={t('watchKodikTranslation')}
                  >
                    {details.translations.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.title}
                        {tr.type === 'subtitles' ? ' (sub)' : ''}
                      </option>
                    ))}
                  </select>
                  {details.seasons.length > 1 && (
                    <select
                      value={season}
                      onChange={(event) =>
                        setSeason(Number(event.target.value))
                      }
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                      aria-label={t('watchKodikSeason')}
                    >
                      {details.seasons.map((s) => (
                        <option key={s} value={s}>
                          {t('watchKodikSeasonN', { season: s })}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    value={episode}
                    onChange={(event) => setEpisode(Number(event.target.value))}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                    aria-label={t('watchKodikEpisode')}
                  >
                    {(details.episodes.length > 0
                      ? details.episodes.map((ep) => ep.episode)
                      : Array.from(
                          { length: picked.episodesCount ?? 1 },
                          (_, i) => i + 1
                        )
                    ).map((ep) => (
                      <option key={ep} value={ep}>
                        {t('watchKodikEpisodeN', { episode: ep })}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                size="sm"
                onClick={() => void handleKodikStart()}
                disabled={startingKodik}
              >
                <Play className="h-4 w-4" />
                {t('watchKodikWatch')}
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
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
              {t('watchKodikFind')}
            </Button>
          </div>
          {anilibertyResults.map((entry) => (
            <div
              key={entry.releaseId}
              className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
            >
              {entry.poster && (
                <img
                  src={entry.poster}
                  alt=""
                  className="h-10 w-7 shrink-0 rounded object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => void handleAnilibertyPick(entry)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Play className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {entry.title}
                    {entry.year ? ` (${entry.year})` : ''}
                  </span>
                  {entry.episodesTotal ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {t('watchKodikEpisodes', {
                        count: entry.episodesTotal
                      })}
                    </span>
                  ) : null}
                </span>
              </button>
            </div>
          ))}
          {describingRelease && (
            <span className="text-sm text-muted-foreground">
              {t('watchPickerLoading')}
            </span>
          )}
          {pickedRelease && releaseDetails && !describingRelease && (
            <div className="flex flex-col gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm">
              <span className="truncate font-medium">
                {pickedRelease.title}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={anilibertyEpisode}
                  onChange={(event) =>
                    setAnilibertyEpisode(Number(event.target.value))
                  }
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  aria-label={t('watchKodikEpisode')}
                >
                  {releaseDetails.episodes.map((ep) => (
                    <option key={ep.ordinal} value={ep.ordinal}>
                      {t('watchEpisodeN', { episode: ep.ordinal })}
                      {ep.name ? ` — ${ep.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                onClick={() => void handleAnilibertyStart()}
                disabled={startingAniliberty}
              >
                <Play className="h-4 w-4" />
                {t('watchKodikWatch')}
              </Button>
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
