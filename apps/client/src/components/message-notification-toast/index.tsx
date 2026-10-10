import { UserAvatar } from '@/components/user-avatar';
import { Username } from '@/components/username';
import { getPlainTextFromHtml, type TJoinedMessage } from '@draevix/shared';
import { memo } from 'react';

const SNIPPET_MAX_LENGTH = 140;

type TMessageNotificationToastProps = {
  message: TJoinedMessage;
  authorName: string;
  authorEffect?: string | null;
  authorFont?: string | null;
  channelLabel: string;
  onNavigate: () => void;
};

const truncateSnippet = (text: string): string => {
  const singleLine = text.replace(/\s+/g, ' ').trim();

  if (singleLine.length <= SNIPPET_MAX_LENGTH) return singleLine;

  return `${singleLine.slice(0, SNIPPET_MAX_LENGTH - 1).trimEnd()}…`;
};

// rich in-app notification: avatar, styled nickname, message preview and
// the chat it came from. clicking jumps straight to the message
const MessageNotificationToast = memo(
  ({
    message,
    authorName,
    authorEffect,
    authorFont,
    channelLabel,
    onNavigate
  }: TMessageNotificationToastProps) => {
    const textContent = getPlainTextFromHtml(message.content ?? '');
    const snippet = textContent
      ? truncateSnippet(textContent)
      : 'Sent an attachment';

    return (
      <button
        type="button"
        onClick={onNavigate}
        className="flex w-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-lg transition-colors hover:bg-accent/40"
      >
        <UserAvatar
          userId={message.userId ?? null}
          className="h-10 w-10 shrink-0"
          showUserPopover={false}
          showStatusBadge={false}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <Username
              name={authorName}
              effect={authorEffect}
              font={authorFont}
              className="truncate text-sm font-semibold"
            />
            <span className="shrink-0 truncate text-xs text-muted-foreground">
              {channelLabel}
            </span>
          </span>
          <span className="line-clamp-2 break-words text-sm text-foreground/90">
            {snippet}
          </span>
        </span>
      </button>
    );
  }
);

MessageNotificationToast.displayName = 'MessageNotificationToast';

export { MessageNotificationToast };
