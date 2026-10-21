import { getFileUrl } from '@/helpers/get-file-url';
import type { TMessageJumpToTarget } from '@/types';
import { FileCategory, getFileCategory } from '@draevix/shared';
import {
  ArrowRight,
  FileText,
  MessageCircleMore,
  Music,
  Play
} from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TSearchResultFile } from './types';

type TSearchResultFileCardProps = {
  result: TSearchResultFile;
  onJump: (target: TMessageJumpToTarget) => void;
  onPreview: (result: TSearchResultFile) => void;
};

const FilePreview = memo(({ result }: { result: TSearchResultFile }) => {
  const url = getFileUrl(result.file);
  const extension = result.file.extension.startsWith('.')
    ? result.file.extension.toLowerCase()
    : `.${result.file.extension.toLowerCase()}`;
  const category = getFileCategory(extension);

  if (category === FileCategory.IMAGE) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }

  if (category === FileCategory.VIDEO) {
    return (
      <>
        <video
          src={`${url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="h-4 w-4 fill-current" />
          </span>
        </span>
      </>
    );
  }

  if (category === FileCategory.AUDIO) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <Music className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <FileText className="h-8 w-8 text-muted-foreground" />
    </div>
  );
});

const SearchResultFileCard = memo(
  ({ result, onJump, onPreview }: TSearchResultFileCardProps) => {
    const { t } = useTranslation('dialogs');

    const handleJump = useCallback(() => {
      onJump({
        channelId: result.channelId,
        messageId: result.messageId,
        isDm: result.channelIsDm
      });
    }, [onJump, result.channelId, result.messageId, result.channelIsDm]);

    const handlePreview = useCallback(() => {
      onPreview(result);
    }, [onPreview, result]);

    const extension =
      result.file.extension.replace(/^\./, '').toUpperCase() || 'FILE';

    return (
      <div className="group relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={handlePreview}
          title={result.file.originalName}
          className="absolute inset-0 block text-left"
        >
          <FilePreview result={result} />
        </button>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-2 pt-8">
          <div className="min-w-0 flex-1 text-[11px] leading-tight text-white">
            <div className="truncate">{result.file.originalName}</div>
            {result.channelIsDm && (
              <div className="mt-0.5 flex min-w-0 items-center gap-1 text-white/70">
                <MessageCircleMore className="h-3 w-3 shrink-0" />
                <span className="truncate">{t('directMessages')}</span>
              </div>
            )}
          </div>

          <span className="shrink-0 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {extension}
          </span>
        </div>

        <button
          type="button"
          onClick={handleJump}
          title={t('jumpToMessage')}
          className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-black/55 text-white opacity-100 backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
);

export { SearchResultFileCard };
