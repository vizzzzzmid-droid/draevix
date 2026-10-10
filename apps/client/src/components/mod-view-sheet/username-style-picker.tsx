import { getTRPCClient } from '@/lib/trpc';
import {
  USERNAME_FONT_STACKS,
  UsernameEffect,
  UsernameFont,
  getTrpcError
} from '@draevix/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@draevix/ui';
import { Type } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Username } from '../username';
import { useModViewContext } from './context';

const NO_EFFECT = 'none';
const DEFAULT_FONT = UsernameFont.DEFAULT;

const EFFECT_OPTIONS: { value: UsernameEffect; labelKey: string }[] = [
  { value: UsernameEffect.FIRE, labelKey: 'usernameEffectFire' },
  { value: UsernameEffect.FROST, labelKey: 'usernameEffectFrost' },
  { value: UsernameEffect.NEON, labelKey: 'usernameEffectNeon' },
  { value: UsernameEffect.RAINBOW, labelKey: 'usernameEffectRainbow' },
  { value: UsernameEffect.GOLD, labelKey: 'usernameEffectGold' }
];

const FONT_OPTIONS: { value: UsernameFont; labelKey: string }[] = [
  { value: UsernameFont.DEFAULT, labelKey: 'usernameFontDefault' },
  { value: UsernameFont.MONO, labelKey: 'usernameFontMono' },
  { value: UsernameFont.SERIF, labelKey: 'usernameFontSerif' },
  { value: UsernameFont.ROUNDED, labelKey: 'usernameFontRounded' }
];

const UsernameStylePicker = memo(() => {
  const { t } = useTranslation('settings');
  const { user, refetch } = useModViewContext();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (effect: UsernameEffect | null, font: UsernameFont | null) => {
      setSaving(true);

      const trpc = getTRPCClient();

      try {
        await trpc.users.setUsernameStyle.mutate({
          userId: user.id,
          effect,
          font
        });
        toast.success(t('usernameStyleUpdated'));
        refetch();
      } catch (error) {
        toast.error(getTrpcError(error, t('failedUpdateUsernameStyle')));
      } finally {
        setSaving(false);
      }
    },
    [user.id, refetch, t]
  );

  const handleEffectChange = useCallback(
    (value: string) => {
      void save(
        value === NO_EFFECT ? null : (value as UsernameEffect),
        user.usernameFont as UsernameFont | null
      );
    },
    [user.usernameFont, save]
  );

  const handleFontChange = useCallback(
    (value: string) => {
      void save(
        user.usernameEffect as UsernameEffect | null,
        value as UsernameFont
      );
    },
    [user.usernameEffect, save]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Type className="h-5 w-5" />
          {t('usernameStyleTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('usernameStyleDesc')}
        </p>
        <Username
          name={user.name}
          effect={user.usernameEffect}
          font={user.usernameFont}
          className="text-lg font-semibold"
        />
        <div className="flex flex-wrap gap-2">
          <Select
            value={user.usernameEffect ?? NO_EFFECT}
            onValueChange={handleEffectChange}
            disabled={saving}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t('usernameEffectTitle')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_EFFECT}>
                {t('usernameEffectNone')}
              </SelectItem>
              {EFFECT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={user.usernameFont ?? DEFAULT_FONT}
            onValueChange={handleFontChange}
            disabled={saving}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t('usernameFontTitle')} />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  style={
                    option.value === UsernameFont.DEFAULT
                      ? undefined
                      : { fontFamily: USERNAME_FONT_STACKS[option.value] }
                  }
                >
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
});

UsernameStylePicker.displayName = 'UsernameStylePicker';

export { UsernameStylePicker };
