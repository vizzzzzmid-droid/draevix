import { MessageNotificationToast } from '@/components/message-notification-toast';
import {
  setMessageJumpTarget,
  setSelectedDmChannelId
} from '@/features/app/actions';
import {
  browserNotificationsForDmsSelector,
  browserNotificationsForMentionsSelector,
  browserNotificationsForRepliesSelector,
  browserNotificationsSelector,
  mutedNotificationUserIdsSelector,
  notificationsMutedSelector,
  threadSidebarDataSelector
} from '@/features/app/selectors';
import { store } from '@/features/store';
import { getFileUrl, isTauri as isTauriApp } from '@/helpers/get-file-url';
import { playSound } from '@/helpers/sounds';
import { sendSystemNotification } from '@/helpers/system-notifications';
import {
  getPlainTextFromHtml,
  hasMention,
  TYPING_MS,
  type TJoinedMessage
} from '@draevix/shared';
import { toast } from 'sonner';
import { markChannelAsRead, setDmsOpen } from '../actions';
import { setSelectedChannelId } from '../channels/actions';
import {
  channelByIdSelector,
  isChannelTextVisibleByIdSelector
} from '../channels/selectors';
import { pluginMetadataByIdSelector } from '../plugins/selectors';
import { serverSliceActions } from '../slice';
import { SoundType } from '../types';
import { ownUserIdSelector, userByIdSelector } from '../users/selectors';
import { threadMessagesMapSelector } from './selectors';

const sendBrowserNotification = (
  message: TJoinedMessage,
  channelId: number,
  isDm = false
) => {
  const state = store.getState();

  const user = userByIdSelector(state, message.userId);
  const plugin = pluginMetadataByIdSelector(state, message.pluginId);
  const channel = channelByIdSelector(state, channelId);
  const isPluginMessage = !!message.pluginId;

  if (!user || !channel) {
    return;
  }

  const authorName = isPluginMessage && plugin ? plugin.name : user.name;
  const textContent = getPlainTextFromHtml(message.content ?? '');

  const title = isDm
    ? `${authorName} (DM)`
    : `${authorName} in #${channel?.name ?? 'unknown'}`;

  const body = textContent ? textContent : 'Sent an attachment';
  const icon = user?.avatar ? getFileUrl(user.avatar) : undefined;

  void sendSystemNotification(title, body, icon);
};

const openChannelAtMessage = (
  channelId: number,
  messageId: number,
  isDm: boolean
) => {
  if (isDm) {
    setDmsOpen(true);
    setSelectedDmChannelId(channelId);
  } else {
    setDmsOpen(false);
    setSelectedChannelId(channelId);
  }

  setMessageJumpTarget({
    channelId,
    messageId,
    isDm,
    highlightTime: 4000
  });
};

const showMessageToast = (
  message: TJoinedMessage,
  channelId: number,
  isDm: boolean
) => {
  const state = store.getState();

  const user =
    message.userId != null
      ? userByIdSelector(state, message.userId)
      : undefined;
  const plugin = pluginMetadataByIdSelector(state, message.pluginId);
  const channel = channelByIdSelector(state, channelId);

  if (!channel) {
    return;
  }

  const authorName =
    (message.pluginId && plugin ? plugin.name : user?.name) ?? 'Unknown user';
  const channelLabel = isDm ? 'DM' : `#${channel?.name ?? 'unknown'}`;

  toast.custom(
    (toastId) => (
      <MessageNotificationToast
        message={message}
        authorName={authorName}
        authorEffect={user?.usernameEffect}
        authorFont={user?.usernameFont}
        channelLabel={channelLabel}
        onNavigate={() => {
          toast.dismiss(toastId);
          openChannelAtMessage(channelId, message.id, isDm);
        }}
      />
    ),
    { duration: 8000 }
  );
};

const typingTimeouts: { [key: string]: NodeJS.Timeout } = {};

const getTypingKey = (channelId: number, userId: number) =>
  `${channelId}-${userId}`;

export const setChannelMessages = (
  channelId: number,
  messages: TJoinedMessage[],
  detached: boolean
) => {
  store.dispatch(
    serverSliceActions.setChannelMessages({ channelId, messages, detached })
  );
};

export const trimChannelMessages = (channelId: number) => {
  store.dispatch(serverSliceActions.trimChannelMessages(channelId));
};

export const addMessages = (
  channelId: number,
  messages: TJoinedMessage[],
  isSubscriptionMessage = false
) => {
  const rootMessages = messages.filter((m) => !m.parentMessageId);
  const threadReplies = messages.filter((m) => !!m.parentMessageId);

  if (rootMessages.length > 0) {
    store.dispatch(
      serverSliceActions.addMessages({
        channelId,
        messages: rootMessages,
        isLive: isSubscriptionMessage
      })
    );
  }

  const repliesByParent = new Map<number, TJoinedMessage[]>();

  for (const reply of threadReplies) {
    const parentId = reply.parentMessageId!;

    if (!repliesByParent.has(parentId)) {
      repliesByParent.set(parentId, []);
    }

    repliesByParent.get(parentId)!.push(reply);
  }

  for (const [parentMessageId, replies] of repliesByParent) {
    store.dispatch(
      serverSliceActions.addThreadMessages({
        parentMessageId,
        messages: replies
      })
    );
  }

  rootMessages.forEach((message) => {
    if (message.userId) {
      removeTypingUser(channelId, message.userId);
    }
  });

  threadReplies.forEach((message) => {
    if (message.parentMessageId && message.userId) {
      removeThreadTypingUser(message.parentMessageId, message.userId);
    }
  });

  if (isSubscriptionMessage && messages.length > 0) {
    const state = store.getState();
    const ownUserId = ownUserIdSelector(state);
    const hasBrowserNotificationsEnabled = browserNotificationsSelector(state);
    const notificationsForMentionsOnly =
      browserNotificationsForMentionsSelector(state);
    const targetMessage = messages[0];
    const isFromOwnUser =
      targetMessage.userId && ownUserId === targetMessage.userId;

    const isChannelTextVisible = isChannelTextVisibleByIdSelector(
      state,
      channelId
    );

    const isWindowHidden = document?.hidden;

    // full mute and per-user mutes silence sounds, toasts and OS
    // notifications alike, without touching unread badges
    const isNotificationMuted =
      notificationsMutedSelector(state) ||
      (targetMessage.userId != null &&
        mutedNotificationUserIdsSelector(state).includes(targetMessage.userId));

    if (!isFromOwnUser && !isNotificationMuted) {
      const isThreadReply = !!targetMessage.parentMessageId;

      if (isThreadReply) {
        const { isOpen, parentMessageId } = threadSidebarDataSelector(state);

        // only play sound if the user has this thread open
        if (isOpen && parentMessageId === targetMessage.parentMessageId) {
          playSound(SoundType.MESSAGE_RECEIVED);
        }
      } else {
        playSound(SoundType.MESSAGE_RECEIVED);
      }

      // only notify if the user is not currently viewing this channel
      if (!isChannelTextVisible || isWindowHidden) {
        const channel = channelByIdSelector(state, channelId);
        const isDmChannel = !!channel?.isDm;
        const hasDmNotificationsEnabled =
          browserNotificationsForDmsSelector(state);
        const hasRepliesNotificationsEnabled =
          browserNotificationsForRepliesSelector(state);
        const isMentioned = hasMention(
          targetMessage.content ?? null,
          ownUserId
        );
        const isReplyToOwnMessage =
          !!targetMessage.replyToMessageId &&
          targetMessage.replyTo?.userId === ownUserId;

        // 'all messages' dominates: the specific toggles only narrow down
        // when it is off, so enabling mentions can never silence everything
        let shouldNotify = false;

        if (hasBrowserNotificationsEnabled) {
          shouldNotify = true;
        } else if (notificationsForMentionsOnly && isMentioned) {
          shouldNotify = true;
        } else if (isDmChannel && hasDmNotificationsEnabled) {
          shouldNotify = true;
        } else if (hasRepliesNotificationsEnabled && isReplyToOwnMessage) {
          shouldNotify = true;
        }

        if (shouldNotify) {
          // hidden window (minimized, background tab): OS-level
          // notification. visible window: rich in-app toast with navigation
          // instead of a duplicate system one. on desktop the unfocused
          // window also routes to OS: production builds have no devtools,
          // so a focus loss always means the user looks elsewhere (second
          // monitor, alt-tab). in browsers focus is ignored on purpose, a
          // focused devtools pane must not reroute while the page is visible
          const windowUnfocused = isTauriApp() && !document.hasFocus();

          if (isWindowHidden || windowUnfocused) {
            sendBrowserNotification(targetMessage, channelId, isDmChannel);
          } else {
            showMessageToast(targetMessage, channelId, isDmChannel);
          }
        }
      }
    }

    if (isChannelTextVisible && !isFromOwnUser && rootMessages.length > 0) {
      markChannelAsRead(channelId, true);
    }
  }
};

export const updateMessage = (channelId: number, message: TJoinedMessage) => {
  if (message.parentMessageId) {
    store.dispatch(
      serverSliceActions.updateThreadMessage({
        parentMessageId: message.parentMessageId,
        message
      })
    );
  } else {
    store.dispatch(serverSliceActions.updateMessage({ channelId, message }));
  }
};

export const deleteMessage = (channelId: number, messageId: number) => {
  // delete from both maps, the message could be a thread reply or root
  store.dispatch(serverSliceActions.deleteMessage({ channelId, messageId }));

  const state = store.getState();
  const threadMessagesMap = threadMessagesMapSelector(state);

  for (const parentId in threadMessagesMap) {
    const threadMessages = threadMessagesMap[parentId];

    if (threadMessages?.some((m) => m.id === messageId)) {
      store.dispatch(
        serverSliceActions.deleteThreadMessage({
          parentMessageId: Number(parentId),
          messageId
        })
      );

      break;
    }
  }
};

export const addThreadMessages = (
  parentMessageId: number,
  messages: TJoinedMessage[]
) => {
  store.dispatch(
    serverSliceActions.addThreadMessages({
      parentMessageId,
      messages
    })
  );
};

export const clearThreadMessages = (parentMessageId: number) => {
  store.dispatch(serverSliceActions.clearThreadMessages(parentMessageId));
};

export const addTypingUser = (
  channelId: number,
  userId: number,
  parentMessageId?: number
) => {
  if (parentMessageId) {
    store.dispatch(
      serverSliceActions.addThreadTypingUser({ parentMessageId, userId })
    );

    const timeoutKey = `thread-${parentMessageId}-${userId}`;

    if (typingTimeouts[timeoutKey]) {
      clearTimeout(typingTimeouts[timeoutKey]);
    }

    typingTimeouts[timeoutKey] = setTimeout(() => {
      removeThreadTypingUser(parentMessageId, userId);

      delete typingTimeouts[timeoutKey];
    }, TYPING_MS + 500);
  } else {
    store.dispatch(serverSliceActions.addTypingUser({ channelId, userId }));

    const timeoutKey = getTypingKey(channelId, userId);

    if (typingTimeouts[timeoutKey]) {
      clearTimeout(typingTimeouts[timeoutKey]);
    }

    typingTimeouts[timeoutKey] = setTimeout(() => {
      removeTypingUser(channelId, userId);

      delete typingTimeouts[timeoutKey];
    }, TYPING_MS + 500);
  }
};

export const removeTypingUser = (channelId: number, userId: number) => {
  store.dispatch(serverSliceActions.removeTypingUser({ channelId, userId }));
};

export const removeThreadTypingUser = (
  parentMessageId: number,
  userId: number
) => {
  store.dispatch(
    serverSliceActions.removeThreadTypingUser({ parentMessageId, userId })
  );
};

export const updateReplyCount = (
  channelId: number,
  messageId: number,
  replyCount: number
) => {
  store.dispatch(
    serverSliceActions.updateReplyCount({ channelId, messageId, replyCount })
  );
};
