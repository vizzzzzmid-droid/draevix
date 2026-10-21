import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  TAttachmentCursor,
  TAttachmentItem,
  TSearchScope,
  TSearchTab
} from './types';

const MIN_FILTER_LENGTH = 2;
const DEBOUNCE_MS = 300;
const PAGE_SIZE = 25;

export const useAttachments = (
  isOpen: boolean,
  scope: TSearchScope,
  tab: TSearchTab,
  query: string
) => {
  const { t } = useTranslation('common');
  const requestRef = useRef(0);

  const [items, setItems] = useState<TAttachmentItem[]>([]);
  const [cursor, setCursor] = useState<TAttachmentCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const trimmed = query.trim();

    if (!isOpen || tab === 'messages') {
      setItems([]);
      setCursor(null);
      setLoading(false);
      setLoadingMore(false);

      return;
    }

    let cancelled = false;

    setItems([]);
    setCursor(null);
    setLoading(true);
    setLoadingMore(false);

    const load = async () => {
      try {
        const trpc = getTRPCClient();
        const page = await trpc.messages.browseAttachments.query({
          scope,
          type: tab,
          query: trimmed.length >= MIN_FILTER_LENGTH ? trimmed : undefined,
          cursor: null,
          limit: PAGE_SIZE
        });

        if (!cancelled && requestRef.current === requestId) {
          setItems(page.items);
          setCursor(page.nextCursor);
        }
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedLoadSearchResults')));

        if (!cancelled && requestRef.current === requestId) {
          setItems([]);
          setCursor(null);
        }
      } finally {
        if (!cancelled && requestRef.current === requestId) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(
      load,
      trimmed.length >= MIN_FILTER_LENGTH ? DEBOUNCE_MS : 0
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, scope, tab, query, t]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || tab === 'messages') {
      return;
    }

    const requestId = requestRef.current;
    const trimmed = query.trim();

    setLoadingMore(true);

    try {
      const trpc = getTRPCClient();
      const page = await trpc.messages.browseAttachments.query({
        scope,
        type: tab,
        query: trimmed.length >= MIN_FILTER_LENGTH ? trimmed : undefined,
        cursor,
        limit: PAGE_SIZE
      });

      if (requestRef.current === requestId) {
        setItems((previous) => [...previous, ...page.items]);
        setCursor(page.nextCursor);
      }
    } catch (error) {
      toast.error(getTrpcError(error, t('common:failedLoadSearchResults')));
    } finally {
      if (requestRef.current === requestId) {
        setLoadingMore(false);
      }
    }
  }, [cursor, loadingMore, scope, tab, query, t]);

  return {
    items,
    loading,
    loadingMore,
    hasMore: !!cursor,
    loadMore
  };
};
