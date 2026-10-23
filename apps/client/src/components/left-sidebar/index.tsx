import { ResizableSidebar } from '@/components/resizable-sidebar';
import { setSelectedChannelId } from '@/features/server/channels/actions';
import {
  useDmsOpen,
  usePublicServerSettings,
  useServerName
} from '@/features/server/hooks';
import { LocalStorageKey } from '@/helpers/storage';
import { cn } from '@/lib/utils';
import { TestId } from '@draevix/shared';
import { Button } from '@draevix/ui';
import { X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Categories } from './categories';
import { DirectMessages } from './direct-messages';
import { DmButton } from './direct-messages/dm-button';
import { useFollowVoiceMove, useRestoreLastSelectedChannel } from './hooks';
import { PluginButtons } from './plugin-buttons';
import { ServerDropdownMenu } from './server-dropdown';
import { UserControl } from './user-control';
import { VoiceControl } from './voice-control';

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 288; // w-72 = 288px

type TLeftSidebarProps = {
  className?: string;
  onClose?: () => void;
};

const LeftSidebar = memo(({ className, onClose }: TLeftSidebarProps) => {
  const { t } = useTranslation();
  const serverName = useServerName();
  const dmsOpen = useDmsOpen();
  const publicSettings = usePublicServerSettings();

  useRestoreLastSelectedChannel();
  useFollowVoiceMove();

  return (
    <ResizableSidebar
      storageKey={LocalStorageKey.LEFT_SIDEBAR_WIDTH}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      defaultWidth={DEFAULT_WIDTH}
      edge="right"
      className={cn('h-full', className)}
      data-testid={TestId.LEFT_SIDEBAR}
    >
      <div className="flex w-full justify-between h-12 items-center border-b border-border px-4">
        <h2
          className="font-semibold text-foreground truncate cursor-pointer"
          onClick={() => setSelectedChannelId(undefined)}
          data-testid={TestId.LEFT_SIDEBAR_SERVER_NAME}
        >
          {serverName}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <ServerDropdownMenu />
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              onClick={onClose}
              aria-label={t('close')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {publicSettings?.directMessagesEnabled && <DmButton />}
      <PluginButtons />
      <div className="flex-1 overflow-y-auto">
        {dmsOpen ? <DirectMessages /> : <Categories />}
      </div>
      <VoiceControl />
      <UserControl />
    </ResizableSidebar>
  );
});

export { LeftSidebar };
