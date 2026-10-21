import { AudioPlayer } from '@/components/channel-view/text/overrides/audio-player';
import { getFileUrl } from '@/helpers/get-file-url';
import type { TMessageJumpToTarget } from '@/types';
import { FileCategory, getFileCategory } from '@draevix/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@draevix/ui';
import { FileText, MessageCircleMore } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TSearchResultFile } from './types';

type TSearchFilePreviewProps = {
  result: TSearchResultFile | null;
  onClose: () => void;
  onJump: (target: TMessageJumpToTarget) => void;
};

const SearchFilePreview = memo(
  ({ result, onClose, onJump }: TSearchFilePreviewProps) => {
    const { t } = useTranslation('dialogs');

    const url = useMemo(
      () => (result ? getFileUrl(result.file) : ''),
      [result]
    );
    const category = useMemo(() => {
      if (!result) return FileCategory.OTHER;

      const extension = result.file.extension.startsWith('.')
        ? result.file.extension
        : `.${result.file.extension}`;

      return getFileCategory(extension);
    }, [result]);

    const handleJump = useCallback(() => {
      if (!result) return;

      onJump({
        channelId: result.channelId,
        messageId: result.messageId,
        isDm: result.channelIsDm
      });
    }, [onJump, result]);

    return (
      <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="z-[70] flex h-[86vh] max-w-5xl flex-col gap-0 overflow-hidden p-0"
          close={onClose}
        >
          <DialogHeader className="flex flex-row items-center gap-3 border-b border-border px-4 py-3 pr-12 text-left">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm">
                {result?.file.originalName ?? ''}
              </DialogTitle>
              <DialogDescription className="mt-1 flex min-w-0 items-center gap-1 text-xs">
                {result?.channelIsDm && (
                  <>
                    <MessageCircleMore className="h-3 w-3 shrink-0" />
                    <span className="truncate">{t('directMessages')}</span>
                  </>
                )}
              </DialogDescription>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={handleJump}
            >
              {t('jumpToMessage')}
            </Button>
          </DialogHeader>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            {category === FileCategory.IMAGE && (
              <img
                src={url}
                alt={result?.file.originalName ?? ''}
                className="max-h-full max-w-full object-contain"
              />
            )}

            {category === FileCategory.VIDEO && (
              <video
                src={url}
                controls
                autoPlay
                className="max-h-full max-w-full"
              />
            )}

            {category === FileCategory.AUDIO && (
              <div className="w-full px-6">
                <AudioPlayer url={url} className="w-full" />
              </div>
            )}

            {category !== FileCategory.IMAGE &&
              category !== FileCategory.VIDEO &&
              category !== FileCategory.AUDIO && (
                <div className="flex flex-col items-center gap-3 px-6 text-center text-white/80">
                  <FileText className="h-12 w-12" />
                  <span className="max-w-full truncate text-sm">
                    {result?.file.originalName}
                  </span>
                </div>
              )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export { SearchFilePreview };
