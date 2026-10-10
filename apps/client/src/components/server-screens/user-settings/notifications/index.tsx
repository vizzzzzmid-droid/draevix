import { SettingsSection } from '@/components/server-screens/settings-shell/section';
import { useSettingsForm } from '@/components/server-screens/settings-shell/use-settings-form';
import { UserAvatar } from '@/components/user-avatar';
import { Username } from '@/components/username';
import {
  setBrowserNotifications,
  setBrowserNotificationsForDms,
  setBrowserNotificationsForMentions,
  setBrowserNotificationsForReplies,
  setNotificationsMuted,
  unmuteUserNotifications
} from '@/features/app/actions';
import {
  useBrowserNotifications,
  useBrowserNotificationsForDms,
  useBrowserNotificationsForMentions,
  useBrowserNotificationsForReplies,
  useMutedNotificationUserIds,
  useNotificationsMuted
} from '@/features/app/hooks';
import { useUserById } from '@/features/server/users/hooks';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { Button, Group, Switch } from '@draevix/ui';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TNotificationsValues = {
  all: boolean;
  mentions: boolean;
  dms: boolean;
  replies: boolean;
  muted: boolean;
};

const MutedUserRow = memo(({ userId }: { userId: number }) => {
  const { t } = useTranslation('settings');
  const user = useUserById(userId);

  const handleUnmute = useCallback(() => {
    unmuteUserNotifications(userId);
  }, [userId]);

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm">
      <UserAvatar
        userId={userId}
        className="h-8 w-8 shrink-0"
        showUserPopover={false}
        showStatusBadge={false}
      />
      <span className="min-w-0 flex-1 truncate">
        {user ? (
          <Username
            name={getRenderedUsername(user)}
            effect={user.usernameEffect}
            font={user.usernameFont}
          />
        ) : (
          t('unknownUser')
        )}
      </span>
      <Button size="sm" variant="ghost" onClick={handleUnmute}>
        {t('unmuteUser')}
      </Button>
    </div>
  );
});

MutedUserRow.displayName = 'MutedUserRow';

const Notifications = memo(() => {
  const { t } = useTranslation('settings');
  const all = useBrowserNotifications();
  const mentions = useBrowserNotificationsForMentions();
  const dms = useBrowserNotificationsForDms();
  const replies = useBrowserNotificationsForReplies();
  const muted = useNotificationsMuted();
  const mutedUserIds = useMutedNotificationUserIds();

  const onSave = useCallback(async (values: TNotificationsValues) => {
    // TODO: refactor this later
    setBrowserNotifications(values.all);
    setBrowserNotificationsForMentions(values.mentions);
    setBrowserNotificationsForDms(values.dms);
    setBrowserNotificationsForReplies(values.replies);
    setNotificationsMuted(values.muted);
  }, []);

  const { values, onChange } = useSettingsForm<TNotificationsValues>({
    initialValues: { all, mentions, dms, replies, muted },
    onSave,
    successMessage: t('notificationsUpdated'),
    errorMessage: t('failedUpdateNotifications')
  });

  const handleAllChange = useCallback(
    (value: boolean) => onChange('all', value),
    [onChange]
  );
  const handleMentionsChange = useCallback(
    (value: boolean) => onChange('mentions', value),
    [onChange]
  );
  const handleDmsChange = useCallback(
    (value: boolean) => onChange('dms', value),
    [onChange]
  );
  const handleRepliesChange = useCallback(
    (value: boolean) => onChange('replies', value),
    [onChange]
  );
  const handleMutedChange = useCallback(
    (value: boolean) => onChange('muted', value),
    [onChange]
  );

  const [permission, setPermission] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  const handleRequestPermission = useCallback(async () => {
    if (!('Notification' in window)) return;

    setPermission(await Notification.requestPermission());
  }, []);

  return (
    <SettingsSection
      title={t('notificationsTitle')}
      description={t('notificationsDesc')}
    >
      <Group
        label={t('notificationPermissionLabel')}
        description={t(`notificationPermission_${permission}`)}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={handleRequestPermission}
          disabled={permission === 'granted'}
        >
          {t('notificationPermissionRequest')}
        </Button>
      </Group>
      <Group label={t('muteAllLabel')} description={t('muteAllDesc')}>
        <Switch checked={values.muted} onCheckedChange={handleMutedChange} />
      </Group>
      <Group label={t('allMessagesLabel')} description={t('allMessagesDesc')}>
        <Switch checked={values.all} onCheckedChange={handleAllChange} />
      </Group>
      <Group label={t('mentionsOnlyLabel')} description={t('mentionsOnlyDesc')}>
        <Switch
          checked={values.mentions}
          onCheckedChange={handleMentionsChange}
        />
      </Group>
      <Group
        label={t('dmNotificationsLabel')}
        description={t('dmNotificationsDesc')}
      >
        <Switch checked={values.dms} onCheckedChange={handleDmsChange} />
      </Group>
      <Group
        label={t('repliesNotificationsLabel')}
        description={t('repliesNotificationsDesc')}
      >
        <Switch
          checked={values.replies}
          onCheckedChange={handleRepliesChange}
        />
      </Group>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('mutedUsersTitle')}</span>
        <span className="text-xs text-muted-foreground">
          {t('mutedUsersDesc')}
        </span>
        {mutedUserIds.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {t('mutedUsersEmpty')}
          </span>
        )}
        {mutedUserIds.map((userId) => (
          <MutedUserRow key={userId} userId={userId} />
        ))}
      </div>
    </SettingsSection>
  );
});

export { Notifications };
