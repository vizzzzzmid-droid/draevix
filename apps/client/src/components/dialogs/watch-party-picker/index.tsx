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
  Button
} from '@draevix/ui';
import { Clapperboard, Play, Trash2, Upload } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';

type TLibraryVideo = TRouterOutputs['library']['list']['videos'][number];

const WatchPartyPickerDialog = memo(({ isOpen, close }: TDialogBaseProps) => {
  const { t } = useTranslation(['dialogs', 'common']);
  const can = useCan();
  const info = useInfo();
  const ownUserId = useOwnUserId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [videos, setVideos] = useState<TLibraryVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    if (!isOpen) return;

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
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>{t('cancel')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

export { WatchPartyPickerDialog };
