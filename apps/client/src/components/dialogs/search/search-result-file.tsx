import { RelativeTime } from '@/components/relative-time';
import { getFileUrl } from '@/helpers/get-file-url';
import type { TMessageJumpToTarget } from '@/types';
import { FileCategory, getFileCategory } from '@draevix/shared';
import { Button } from '@draevix/ui';
import { filesize } from 'filesize';
import { FileText, Hash, MessageCircleMore, Music, Play } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TSearchResultFile } from './types';

type TSearchResultFileCardProps = {
  result: TSearchResultFile;
  onJump: (target: TMessageJumpToTarget) => void;
};

const FileThumbnail = memo(({ result }: { result: TSearchResultFile }) => {
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
        className="h-14 w-14 shrink-0 rounded-md object-cover"
      />
    );
  }

  if (category === FileCategory.VIDEO) {
    return (
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-black/80">
        <video
          src={`${url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
          <Play className="h-4 w-4 fill-current text-white" />
        </span>
      </div>
    );
  }

  if (category === FileCategory.AUDIO) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
        <Music className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
      <FileText className="h-5 w-5 text-muted-foreground" />
    </div>
  );
});

const SearchResultFileCard = memo(
  ({ result, onJump }: TSearchResultFileCardProps) => {
    const { t } = useTranslation('dialogs');

    const handleJump = useCallback(() => {
      onJump({
        channelId: result.channelId,
        messageId: result.messageId,
        isDm: result.channelIsDm
      });
    }, [onJump, result.channelId, result.messageId, result.channelIsDm]);

    const ChannelIcon = result.channelIsDm ? MessageCircleMore : Hash;
    const channelName = result.channelIsDm
      ? t('directMessages')
      : result.channelName;

    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <FileThumbnail result={result} />

          <div className="min-w-0 flex-1">
            <a
              href={getFileUrl(result.file)}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm font-medium text-foreground hover:underline"
            >
              {result.file.originalName}
            </a>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                <ChannelIcon className="h-3 w-3" />
                <span className="truncate wrap-anywhere">{channelName}</span>
              </span>
              <RelativeTime date={new Date(result.messageCreatedAt)}>
                {(relativeTime) => <span>{relativeTime}</span>}
              </RelativeTime>
              <span>{filesize(result.file.size)}</span>
            </div>
          </div>

          <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {result.file.extension.replace(/^\./, '').toUpperCase()}
          </span>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={handleJump}
        >
          {t('jumpToMessage')}
        </Button>
      </div>
    );
  }
);

export { SearchResultFileCard };
