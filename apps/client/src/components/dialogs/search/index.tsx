import type { TDialogBaseProps } from '@/components/dialogs/types';
import { useSelectedDmChannelId } from '@/features/app/hooks';
import { jumpToMessage } from '@/features/server/actions';
import { useDmsOpen } from '@/features/server/hooks';
import { useOnEsc } from '@/hooks/use-on-esc';
import type { TMessageJumpToTarget } from '@/types';
import { TestId } from '@draevix/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  PaginatedList,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger
} from '@draevix/ui';
import {
  Image as ImageIcon,
  Link2,
  MessageSquare,
  Music,
  Video
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent
} from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from './hooks';
import { SearchFilePreview } from './search-file-preview';
import { SearchResultFileCard } from './search-result-file';
import { SearchResultLinkCard } from './search-result-link';
import { SearchResultMessageCard } from './search-result-message';
import type {
  TSearchResultFile,
  TSearchScope,
  TSearchTab,
  TUnifiedSearchResult
} from './types';
import { useAttachments } from './use-attachments';

const ITEMS_PER_PAGE = 12;

type TSearchDialogProps = TDialogBaseProps;

const SearchDialog = memo(({ isOpen, close }: TSearchDialogProps) => {
  const { t } = useTranslation('dialogs');

  const selectedDmChannelId = useSelectedDmChannelId();
  const dmsOpen = useDmsOpen();
  const activeDmChannelId = dmsOpen ? selectedDmChannelId : undefined;
  const [scope, setScope] = useState<TSearchScope>(
    activeDmChannelId ? 'dms' : 'server'
  );
  const [tab, setTab] = useState<TSearchTab>('messages');
  const [preview, setPreview] = useState<TSearchResultFile | null>(null);
  const isMessagesTab = tab === 'messages';
  const isFileTab = tab === 'photos' || tab === 'videos' || tab === 'audio';

  const channelId = scope === 'dms' ? activeDmChannelId : undefined;

  const handleEsc = useCallback(() => {
    if (preview) {
      setPreview(null);

      return;
    }

    close();
  }, [preview, close]);

  useOnEsc(handleEsc);

  const { query, setQuery, loading, canSearch, results } = useSearch(
    isOpen,
    scope,
    isMessagesTab,
    channelId
  );
  const attachments = useAttachments(isOpen, scope, tab, query, channelId);

  useEffect(() => {
    if (!isOpen) {
      setScope(activeDmChannelId ? 'dms' : 'server');
      setTab('messages');
      setPreview(null);
    }
  }, [isOpen, activeDmChannelId]);

  const onJump = useCallback(
    (target: TMessageJumpToTarget) => {
      jumpToMessage(target);
      close();
    },
    [close]
  );

  const onPreview = useCallback((result: TSearchResultFile) => {
    setPreview(result);
  }, []);

  const handleScopeChange = useCallback((value: string) => {
    setScope(value as TSearchScope);
  }, []);

  const handleTabChange = useCallback((value: string) => {
    setTab(value as TSearchTab);
  }, []);

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
    },
    [setQuery]
  );

  const messageItems = useMemo<TUnifiedSearchResult[]>(
    () =>
      results.messages.map((message) => ({
        type: 'message',
        createdAt: message.createdAt,
        key: `message-${message.id}`,
        item: message
      })),
    [results.messages]
  );

  const attachmentItems = useMemo<TUnifiedSearchResult[]>(
    () =>
      attachments.items.map((item) =>
        item.kind === 'link'
          ? {
              type: 'link',
              createdAt: item.messageCreatedAt,
              key: `link-${item.messageId}`,
              item
            }
          : {
              type: 'file',
              createdAt: item.messageCreatedAt,
              key: `file-${item.file.id}-${item.messageId}`,
              item
            }
      ),
    [attachments.items]
  );

  const renderEntry = useCallback(
    (entry: TUnifiedSearchResult) => {
      if (entry.type === 'message') {
        return <SearchResultMessageCard message={entry.item} onJump={onJump} />;
      }

      if (entry.type === 'link') {
        return <SearchResultLinkCard result={entry.item} onJump={onJump} />;
      }

      return (
        <SearchResultFileCard
          result={entry.item}
          onJump={onJump}
          onPreview={onPreview}
        />
      );
    },
    [onJump, onPreview]
  );

  return (
    <>
      <Dialog open={isOpen}>
        <DialogContent
          className="h-[86vh] max-h-[94vh] lg:min-w-7xl gap-0 overflow-hidden p-0"
          onInteractOutside={() => {
            if (!preview) {
              close();
            }
          }}
          close={close}
        >
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="border-b border-border bg-card/70 px-5 py-4 text-left">
              <DialogTitle className="text-base">
                {t('searchTitle')}
              </DialogTitle>
              <DialogDescription>{t('searchDesc')}</DialogDescription>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  value={query}
                  onChange={handleQueryChange}
                  placeholder={t('searchPlaceholder')}
                  data-testid={TestId.SEARCH_INPUT}
                  autoFocus
                  className="h-10 min-w-48 flex-1"
                />
                <Tabs value={scope} onValueChange={handleScopeChange}>
                  <TabsList className="h-10">
                    <TabsTrigger value="server" className="px-3">
                      {t('searchScopeServer')}
                    </TabsTrigger>
                    <TabsTrigger value="dms" className="px-3">
                    {activeDmChannelId
                      ? t('searchScopeThisDm')
                      : t('searchScopeDms')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
              <Tabs
                value={tab}
                onValueChange={handleTabChange}
                className="flex min-h-0 flex-1 flex-col gap-3"
              >
                <TabsList className="h-9 w-full max-w-full justify-start overflow-x-auto">
                  <TabsTrigger value="messages" className="flex-none px-3">
                    <MessageSquare />
                    {t('searchTabMessages')}
                  </TabsTrigger>
                  <TabsTrigger value="photos" className="flex-none px-3">
                    <ImageIcon />
                    {t('searchTabPhotos')}
                  </TabsTrigger>
                  <TabsTrigger value="videos" className="flex-none px-3">
                    <Video />
                    {t('searchTabVideos')}
                  </TabsTrigger>
                  <TabsTrigger value="audio" className="flex-none px-3">
                    <Music />
                    {t('searchTabAudio')}
                  </TabsTrigger>
                  <TabsTrigger value="links" className="flex-none px-3">
                    <Link2 />
                    {t('searchTabLinks')}
                  </TabsTrigger>
                </TabsList>

                {isMessagesTab ? (
                  <>
                    {!canSearch && (
                      <div className="flex flex-1 items-center justify-center rounded-lg bg-muted/20 px-6 text-sm text-muted-foreground">
                        {t('searchHint')}
                      </div>
                    )}

                    {canSearch && loading && (
                      <div className="flex flex-1 items-center justify-center">
                        <Spinner size="sm" />
                      </div>
                    )}

                    {canSearch && !loading && (
                      <PaginatedList
                        items={messageItems}
                        itemsPerPage={ITEMS_PER_PAGE}
                      >
                        <PaginatedList.Empty className="flex flex-1 items-center justify-center rounded-lg bg-muted/20 px-6 text-sm text-muted-foreground">
                          {t('noResults')}
                        </PaginatedList.Empty>

                        <PaginatedList.List<TUnifiedSearchResult>
                          className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
                          getItemKey={(entry) => entry.key}
                        >
                          {renderEntry}
                        </PaginatedList.List>

                        <PaginatedList.Pagination
                          alwaysShow
                          className="flex shrink-0 items-center justify-center gap-1 border-t border-border pt-3"
                        />

                        {results.truncated && (
                          <div
                            data-testid={TestId.SEARCH_TRUNCATED_NOTICE}
                            className="shrink-0 pt-2 text-center text-xs text-muted-foreground"
                          >
                            {t('searchTruncated')}
                          </div>
                        )}
                      </PaginatedList>
                    )}
                  </>
                ) : attachments.loading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Spinner size="sm" />
                  </div>
                ) : (
                  <PaginatedList
                    key={`${scope}-${channelId ?? 'all'}-${tab}`}
                    items={attachmentItems}
                    itemsPerPage={ITEMS_PER_PAGE}
                  >
                    <PaginatedList.Empty className="flex flex-1 items-center justify-center rounded-lg bg-muted/20 px-6 text-sm text-muted-foreground">
                      {t('noResults')}
                    </PaginatedList.Empty>

                    <PaginatedList.List<TUnifiedSearchResult>
                      className={
                        isFileTab
                          ? 'grid min-h-0 flex-1 content-start grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'
                          : 'min-h-0 flex-1 space-y-2 overflow-y-auto pr-1'
                      }
                      getItemKey={(entry) => entry.key}
                    >
                      {renderEntry}
                    </PaginatedList.List>

                    <PaginatedList.Pagination
                      alwaysShow
                      className="flex shrink-0 items-center justify-center gap-1 border-t border-border pt-3"
                    />

                    {attachments.hasMore && (
                      <div className="flex shrink-0 justify-center pt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={attachments.loadMore}
                          disabled={attachments.loadingMore}
                        >
                          {attachments.loadingMore ? (
                            <Spinner size="xxs" />
                          ) : (
                            t('searchLoadMore')
                          )}
                        </Button>
                      </div>
                    )}
                  </PaginatedList>
                )}
              </Tabs>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <SearchFilePreview
        result={preview}
        onClose={() => setPreview(null)}
        onJump={onJump}
      />
    </>
  );
});

export { SearchDialog };
