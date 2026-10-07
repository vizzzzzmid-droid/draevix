import { UserAvatar } from '@/components/user-avatar';
import { useUserById } from '@/features/server/users/hooks';
import { useVoice } from '@/features/server/voice/hooks';
import { Button } from '@draevix/ui';
import { Monitor } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TScreenSharePromptProps = {
  userId: number;
};

// someone's screen is announced but not consumed yet: a quiet tile with the
// sharer's name instead of their pixels, until tapped through
const ScreenSharePrompt = memo(({ userId }: TScreenSharePromptProps) => {
  const { t } = useTranslation();
  const user = useUserById(userId);
  const { watchScreenShare } = useVoice();
  const [starting, setStarting] = useState(false);

  const handleWatch = useCallback(async () => {
    if (starting) return;

    setStarting(true);

    try {
      await watchScreenShare(userId);
    } finally {
      setStarting(false);
    }
  }, [starting, userId, watchScreenShare]);

  if (!user) return null;

  return (
    <div className="relative flex size-full flex-col items-center justify-center gap-2 overflow-hidden rounded border border-border bg-card p-3">
      <UserAvatar userId={userId} />
      <div className="flex items-center gap-1.5 text-sm">
        <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground">
          {t('watchScreenSharingBy', { name: user.name })}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void handleWatch()}
        disabled={starting}
      >
        {t('watchScreenShare')}
      </Button>
    </div>
  );
});

ScreenSharePrompt.displayName = 'ScreenSharePrompt';

export { ScreenSharePrompt };
