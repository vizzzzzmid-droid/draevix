import { getTRPCClient } from '@/lib/trpc';
import { ProfileEffect, getTrpcError } from '@draevix/shared';
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
import { Snowflake } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useModViewContext } from './context';

const NO_EFFECT = 'none';

const ProfileEffectPicker = memo(() => {
  const { t } = useTranslation('settings');
  const { user, refetch } = useModViewContext();
  const [saving, setSaving] = useState(false);

  const handleChange = useCallback(
    async (value: string) => {
      setSaving(true);

      const trpc = getTRPCClient();

      try {
        await trpc.users.setProfileEffect.mutate({
          userId: user.id,
          effect: value === NO_EFFECT ? null : (value as ProfileEffect)
        });
        toast.success(t('profileEffectUpdated'));
        refetch();
      } catch (error) {
        toast.error(getTrpcError(error, t('failedUpdateProfileEffect')));
      } finally {
        setSaving(false);
      }
    },
    [user.id, refetch, t]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Snowflake className="h-5 w-5" />
          {t('profileEffectTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('profileEffectDesc')}
        </p>
        <Select
          value={user.profileEffect ?? NO_EFFECT}
          onValueChange={handleChange}
          disabled={saving}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_EFFECT}>{t('profileEffectNone')}</SelectItem>
            <SelectItem value={ProfileEffect.SNOW}>
              {t('profileEffectSnow')}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
});

ProfileEffectPicker.displayName = 'ProfileEffectPicker';

export { ProfileEffectPicker };
