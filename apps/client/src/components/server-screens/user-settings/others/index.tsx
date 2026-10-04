import { useAppUpdate } from '@/components/app-updater/use-app-update';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SettingsSection } from '@/components/server-screens/settings-shell/section';
import { useSettingsForm } from '@/components/server-screens/settings-shell/use-settings-form';
import { setAutoJoinLastChannel } from '@/features/app/actions';
import { useAutoJoinLastChannel } from '@/features/app/hooks';
import { isTauri } from '@/helpers/get-file-url';
import { Button, Group, Switch } from '@draevix/ui';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

type TOthersValues = {
  autoJoinLastChannel: boolean;
};

const Others = memo(() => {
  const { t } = useTranslation('settings');
  const autoJoinLastChannel = useAutoJoinLastChannel();

  const onSave = useCallback(async (values: TOthersValues) => {
    setAutoJoinLastChannel(values.autoJoinLastChannel);
  }, []);

  const { values, onChange } = useSettingsForm<TOthersValues>({
    initialValues: { autoJoinLastChannel },
    onSave,
    successMessage: t('othersUpdated'),
    errorMessage: t('failedUpdateOthers')
  });

  const handleAutoJoinChange = useCallback(
    (value: boolean) => onChange('autoJoinLastChannel', value),
    [onChange]
  );

  const {
    version: appVersion,
    checking: checkingAppUpdate,
    checkNow: checkAppUpdateNow
  } = useAppUpdate();

  const handleCheckUpdates = useCallback(() => {
    void checkAppUpdateNow({ silent: false, respectSkip: false });
  }, [checkAppUpdateNow]);

  return (
    <SettingsSection title={t('othersTitle')} description={t('othersDesc')}>
      <Group
        label={t('autoJoinLastChannelLabel')}
        description={t('autoJoinLastChannelDesc')}
      >
        <Switch
          checked={values.autoJoinLastChannel}
          onCheckedChange={handleAutoJoinChange}
        />
      </Group>

      <Group label={t('languageLabel')} description={t('languageDesc')}>
        <LanguageSwitcher />
      </Group>

      {isTauri() && (
        <Group label={t('appUpdatesLabel')} description={t('appUpdatesDesc')}>
          <div className="flex items-center gap-3">
            {appVersion && (
              <span className="text-sm text-muted-foreground">
                {t('appVersion', { version: appVersion })}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleCheckUpdates}
              disabled={checkingAppUpdate}
            >
              {checkingAppUpdate
                ? t('checkingForUpdates')
                : t('checkForUpdates')}
            </Button>
          </div>
        </Group>
      )}
    </SettingsSection>
  );
});

export { Others };
