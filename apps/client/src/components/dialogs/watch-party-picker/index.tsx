import { getTRPCClient, type TRouterOutputs } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@draevix/ui';
import { Clapperboard, Play } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';

type TLibraryVideo = TRouterOutputs['library']['list']['videos'][number];

const WatchPartyPickerDialog = memo(({ isOpen, close }: TDialogBaseProps) => {
  const { t } = useTranslation(['dialogs', 'common']);
  const [videos, setVideos] = useState<TLibraryVideo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);

    const trpc = getTRPCClient();

    trpc.library.list
      .query()
      .then(({ videos }) => setVideos(videos))
      .catch((error) => {
        toast.error(getTrpcError(error, t('common:failedLoadLibrary')));
        close();
      })
      .finally(() => setLoading(false));
  }, [isOpen, close, t]);

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
            <button
              key={entry.id}
              type="button"
              onClick={() => handlePick(entry.fileId)}
              className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/40"
            >
              <Play className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {entry.file.originalName}
              </span>
            </button>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>{t('cancel')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

export { WatchPartyPickerDialog };
