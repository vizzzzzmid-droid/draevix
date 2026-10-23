import { LeftSidebar } from '@/components/left-sidebar';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { ModViewSheet } from '@/components/mod-view-sheet';
import { Protect } from '@/components/protect';
import { RightSidebar } from '@/components/right-sidebar';
import { ThreadSidebar } from '@/components/thread-sidebar';
import { TopBar } from '@/components/top-bar';
import { VoiceChatSidebar } from '@/components/voice-chat-sidebar';
import { VoiceProvider } from '@/components/voice-provider';
import { useSelectedDmChannelId, useThreadSidebar } from '@/features/app/hooks';
import { useServerScreenInfo } from '@/features/server-screens/hooks';
import { setDmsOpen } from '@/features/server/actions';
import { setSelectedChannelId } from '@/features/server/channels/actions';
import { useSelectedChannelId } from '@/features/server/channels/hooks';
import { useDmsOpen, usePublicServerSettings } from '@/features/server/hooks';
import {
  getLocalStorageItemBool,
  LocalStorageKey,
  setLocalStorageItemBool
} from '@/helpers/storage';
import { useSwipeGestures } from '@/hooks/use-swipe-gestures';
import { cn } from '@/lib/utils';
import { Permission, TestId } from '@draevix/shared';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ContentWrapper } from './content-wrapper';
import { PreventBrowser } from './prevent-browser';

const ServerView = memo(() => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileUsersOpen, setIsMobileUsersOpen] = useState(false);
  const [isDesktopRightSidebarOpen, setIsDesktopRightSidebarOpen] = useState(
    getLocalStorageItemBool(LocalStorageKey.RIGHT_SIDEBAR_STATE, true)
  );
  const dmsOpen = useDmsOpen();
  const selectedChannelId = useSelectedChannelId();
  const selectedDmChannelId = useSelectedDmChannelId();
  const publicSettings = usePublicServerSettings();
  const serverScreenInfo = useServerScreenInfo();
  const previousServerChannelIdRef = useRef<number | undefined>(undefined);
  const { isOpen: isThreadSidebarOpen } = useThreadSidebar();

  const handleDesktopRightSidebarToggle = useCallback(() => {
    setIsDesktopRightSidebarOpen((prev) => !prev);
    setLocalStorageItemBool(
      LocalStorageKey.RIGHT_SIDEBAR_STATE,
      !isDesktopRightSidebarOpen
    );
  }, [isDesktopRightSidebarOpen]);

  const handleMobileChannelsToggle = useCallback(() => {
    setIsMobileUsersOpen(false);
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  const handleMobileMembersToggle = useCallback(() => {
    setIsMobileMenuOpen(false);
    setIsMobileUsersOpen((prev) => !prev);
  }, []);

  const handleServerViewClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isMobileMenuOpen) return;

      const target = event.target as HTMLElement;

      if (
        target.closest(`[data-testid="${TestId.CHANNEL_ITEM}"]`) ||
        target.closest(`[data-testid="${TestId.DM_ITEM}"]`)
      ) {
        setIsMobileMenuOpen(false);
      }
    },
    [isMobileMenuOpen]
  );

  const handleSwipeRight = useCallback(() => {
    if (isMobileMenuOpen || isMobileUsersOpen) {
      setIsMobileMenuOpen(false);
      setIsMobileUsersOpen(false);
      return;
    }

    setIsMobileMenuOpen(true);
  }, [isMobileMenuOpen, isMobileUsersOpen]);

  const handleSwipeLeft = useCallback(() => {
    if (isMobileMenuOpen || isMobileUsersOpen) {
      setIsMobileMenuOpen(false);
      setIsMobileUsersOpen(false);

      return;
    }

    setIsMobileUsersOpen(true);
  }, [isMobileMenuOpen, isMobileUsersOpen]);

  const swipeHandlers = useSwipeGestures({
    onSwipeRight: handleSwipeRight,
    onSwipeLeft: handleSwipeLeft
  });

  useEffect(() => {
    if (publicSettings?.directMessagesEnabled === false && dmsOpen) {
      setDmsOpen(false);

      if (previousServerChannelIdRef.current) {
        setSelectedChannelId(previousServerChannelIdRef.current);
      }
    }
  }, [publicSettings?.directMessagesEnabled, dmsOpen]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [selectedChannelId, selectedDmChannelId]);

  useEffect(() => {
    if (serverScreenInfo.isOpen) {
      setIsMobileMenuOpen(false);
      setIsMobileUsersOpen(false);
    }
  }, [serverScreenInfo.isOpen]);

  return (
    <VoiceProvider>
      <div
        data-testid={TestId.SERVER_VIEW}
        className="flex h-dvh flex-col bg-background text-foreground dark"
        onClickCapture={handleServerViewClick}
        {...swipeHandlers}
      >
        <TopBar
          onToggleRightSidebar={handleDesktopRightSidebarToggle}
          isOpen={isDesktopRightSidebarOpen}
        />
        <MobileTopBar
          onToggleChannels={handleMobileChannelsToggle}
          onToggleMembers={handleMobileMembersToggle}
          isChannelsOpen={isMobileMenuOpen}
          isMembersOpen={isMobileUsersOpen}
        />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <PreventBrowser />

          {isMobileMenuOpen && (
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          {isMobileUsersOpen && (
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
              onClick={() => setIsMobileUsersOpen(false)}
            />
          )}

          <LeftSidebar
            className={cn(
              'lg:relative lg:flex fixed inset-y-0 left-0 h-full z-40 lg:z-0 transition-transform duration-300 ease-in-out max-w-[86vw]',
              isMobileMenuOpen
                ? 'translate-x-0'
                : '-translate-x-full lg:translate-x-0'
            )}
            onClose={() => setIsMobileMenuOpen(false)}
          />

          <ContentWrapper
            isDmMode={dmsOpen}
            selectedDmChannelId={selectedDmChannelId}
          />

          <VoiceChatSidebar />

          <ThreadSidebar isOpen={isThreadSidebarOpen} />

          <RightSidebar
            className={cn(
              'fixed top-0 bottom-0 right-0 h-full z-40 max-w-[86vw]',
              'lg:relative lg:z-0',
              isMobileUsersOpen
                ? 'translate-x-0 lg:translate-x-0'
                : 'translate-x-full lg:translate-x-0'
            )}
            isOpen={isMobileUsersOpen || isDesktopRightSidebarOpen}
            onClose={() => setIsMobileUsersOpen(false)}
          />

          <Protect permission={Permission.MANAGE_USERS}>
            <ModViewSheet />
          </Protect>
        </div>
      </div>
    </VoiceProvider>
  );
});

export { ServerView };
