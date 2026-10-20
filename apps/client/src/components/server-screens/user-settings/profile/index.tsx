import { ImagePicker } from '@/components/image-picker';
import { SettingsSection } from '@/components/server-screens/settings-shell/section';
import { useSettingsForm } from '@/components/server-screens/settings-shell/use-settings-form';
import { UserAvatar } from '@/components/user-avatar';
import { USERNAME_FONT_OPTIONS } from '@/components/username-font-options';
import { useCan } from '@/features/server/hooks';
import { useOwnPublicUser } from '@/features/server/users/hooks';
import {
  ensureBundledFontLoaded,
  isBundledUsernameFont
} from '@/helpers/bundled-fonts';
import { getFileUrl } from '@/helpers/get-file-url';
import type { TPickedImage } from '@/hooks/use-pick-image';
import { getTRPCClient } from '@/lib/trpc';
import {
  DEFAULT_PROFILE_COLOR,
  Permission,
  USERNAME_FONT_STACKS,
  UsernameFont,
  parseUsernameFont
} from '@draevix/shared';
import {
  ColorPicker,
  Group,
  ImageSwatchPicker,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@draevix/ui';
import { memo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

type TProfileValues = {
  name: string;
  profileColor: string;
  bio: string;
  bioFont: UsernameFont;
  // undefined means untouched, null means remove
  avatar?: TPickedImage | null;
  banner?: TPickedImage | null;
};

const Profile = memo(() => {
  const { t } = useTranslation('settings');
  const ownPublicUser = useOwnPublicUser();
  const can = useCan();
  // bio font is admin-only: non-admins never send it, so it keeps its value
  const canEditBioFont = can(Permission.MANAGE_USERS);

  const onSave = useCallback(
    async (values: TProfileValues) => {
      const trpc = getTRPCClient();

      await trpc.users.update.mutate({
        name: values.name,
        profileColor: values.profileColor,
        bio: values.bio,
        ...(canEditBioFont ? { bioFont: values.bioFont } : {})
      });

      if (values.avatar !== undefined) {
        await trpc.users.changeAvatar.mutate({ fileId: values.avatar?.fileId });
      }

      if (values.banner !== undefined) {
        await trpc.users.changeBanner.mutate({ fileId: values.banner?.fileId });
      }
    },
    [canEditBioFont]
  );

  const { r, values, onChange } = useSettingsForm<TProfileValues>({
    initialValues: {
      name: ownPublicUser?.name ?? '',
      profileColor: ownPublicUser?.profileColor ?? DEFAULT_PROFILE_COLOR,
      bio: ownPublicUser?.bio ?? '',
      bioFont: parseUsernameFont(ownPublicUser?.bioFont)
    },
    onSave,
    successMessage: t('profileUpdated'),
    errorMessage: t('failedUpdateProfile')
  });

  // the textarea doubles as a live preview: bundled families load on demand
  useEffect(() => {
    if (isBundledUsernameFont(values.bioFont)) {
      ensureBundledFontLoaded(values.bioFont).catch(() => {
        // the fallback stack in the textarea style covers this
      });
    }
  }, [values.bioFont]);

  const handleBioFontChange = useCallback(
    (value: string) => onChange('bioFont', value as UsernameFont),
    [onChange]
  );

  const handleColorChange = useCallback(
    (color: string) => onChange('profileColor', color),
    [onChange]
  );

  const handleAvatarChange = useCallback(
    (picked: TPickedImage | null) => onChange('avatar', picked),
    [onChange]
  );

  const handleBannerChange = useCallback(
    (picked: TPickedImage | null) => onChange('banner', picked),
    [onChange]
  );

  if (!ownPublicUser) return null;

  const userAvatarUrl =
    values.avatar?.previewUrl ?? getFileUrl(ownPublicUser.avatar);
  const userBannerUrl =
    values.banner?.previewUrl ?? getFileUrl(ownPublicUser.banner);

  return (
    <SettingsSection title={t('profileTitle')} description={t('profileDesc')}>
      <div className="flex flex-wrap items-start gap-4">
        <ImagePicker
          label={t('avatarLabel')}
          className="h-32 w-32 rounded-full"
          currentUrl={getFileUrl(ownPublicUser.avatar)}
          draft={values.avatar}
          onChange={handleAvatarChange}
          cropAspect={1}
          cropRound
          fallback={
            <UserAvatar
              userId={ownPublicUser.id}
              className="h-32 w-32 rounded-full bg-muted"
              showStatusBadge={false}
              showUserPopover={false}
            />
          }
        />

        <ImagePicker
          label={t('bannerLabel')}
          className="h-32 w-80"
          currentUrl={getFileUrl(ownPublicUser.banner)}
          draft={values.banner}
          onChange={handleBannerChange}
          cropAspect={3}
        />

        <Group label={t('profileColorLabel')}>
          <ColorPicker
            value={values.profileColor}
            onChange={handleColorChange}
            defaultValue={DEFAULT_PROFILE_COLOR}
          />
          <ImageSwatchPicker src={userAvatarUrl} onChange={handleColorChange} />
          <ImageSwatchPicker src={userBannerUrl} onChange={handleColorChange} />
        </Group>
      </div>

      <Group label={t('usernameLabel')}>
        <Input placeholder={t('usernamePlaceholder')} {...r('name')} />
      </Group>

      <Group label={t('bioLabel')}>
        {canEditBioFont && (
          <Select value={values.bioFont} onValueChange={handleBioFontChange}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t('bioFontPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {USERNAME_FONT_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    style={
                      option.value === UsernameFont.DEFAULT
                        ? undefined
                        : { fontFamily: USERNAME_FONT_STACKS[option.value] }
                    }
                  >
                    {option.label ??
                      (option.labelKey ? t(option.labelKey) : option.value)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        <Textarea
          placeholder={t('bioPlaceholder')}
          maxLength={160}
          {...r('bio')}
          style={
            values.bioFont === UsernameFont.DEFAULT
              ? undefined
              : { fontFamily: USERNAME_FONT_STACKS[values.bioFont] }
          }
        />
      </Group>
    </SettingsSection>
  );
});

export { Profile };
