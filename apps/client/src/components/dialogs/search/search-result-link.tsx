import { RelativeTime } from '@/components/relative-time';
import type { TMessageJumpToTarget } from '@/types';
import { Button } from '@draevix/ui';
import { Hash, Link2, MessageCircleMore } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TSearchResultLink } from './types';

type TSearchResultLinkCardProps = {
  result: TSearchResultLink;
  onJump: (target: TMessageJumpToTarget) => void;
};

const SearchResultLinkCard = memo(
  ({ result, onJump }: TSearchResultLinkCardProps) => {
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
    const [firstLink] = result.links;

    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Link2 className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            {firstLink && (
              <a
                href={firstLink}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm font-medium text-foreground hover:underline"
              >
                {firstLink}
              </a>
            )}

            {result.plainContent && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {result.plainContent}
              </p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                <ChannelIcon className="h-3 w-3" />
                <span className="truncate wrap-anywhere">{channelName}</span>
              </span>
              <RelativeTime date={new Date(result.messageCreatedAt)}>
                {(relativeTime) => <span>{relativeTime}</span>}
              </RelativeTime>
            </div>
          </div>
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

export { SearchResultLinkCard };
