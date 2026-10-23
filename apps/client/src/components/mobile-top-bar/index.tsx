import { openDialog } from '@/features/dialogs/actions';
import {
  usePublicServerSettings,
  useServerName
} from '@/features/server/hooks';
import { Button } from '@draevix/ui';
import { Menu, PanelRight, PanelRightClose, Search } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../dialogs/dialogs';

type TMobileTopBarProps = {
  onToggleChannels: () => void;
  onToggleMembers: () => void;
  isChannelsOpen: boolean;
  isMembersOpen: boolean;
};

const MobileTopBar = memo(
  ({
    onToggleChannels,
    onToggleMembers,
    isChannelsOpen,
    isMembersOpen
  }: TMobileTopBarProps) => {
    const { t } = useTranslation('topbar');
    const serverName = useServerName();
    const settings = usePublicServerSettings();

    const openSearch = useCallback(() => {
      openDialog(Dialog.SEARCH);
    }, []);

    return (
      <div className="flex h-12 w-full shrink-0 items-center gap-1 border-b border-border bg-card px-2 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onToggleChannels}
          aria-label={
            isChannelsOpen
              ? t('closeChannelsSidebar')
              : t('openChannelsSidebar')
          }
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </Button>

        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {serverName}
        </span>

        {settings?.enableSearch && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={openSearch}
            aria-label={t('searchContent')}
          >
            <Search className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onToggleMembers}
          aria-label={
            isMembersOpen ? t('closeMembersSidebar') : t('openMembersSidebar')
          }
        >
          {isMembersOpen ? (
            <PanelRightClose className="h-4 w-4 text-muted-foreground" />
          ) : (
            <PanelRight className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
    );
  }
);

MobileTopBar.displayName = 'MobileTopBar';

export { MobileTopBar };
