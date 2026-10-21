import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TSearchResults, TSearchScope } from './types';

const EMPTY_RESULTS: TSearchResults = {
  messages: [],
  files: [],
  photos: [],
  videos: [],
  audio: [],
  links: [],
  truncated: false
};
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export const useSearch = (isOpen: boolean, scope: TSearchScope) => {
  const { t } = useTranslation('common');

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TSearchResults>(EMPTY_RESULTS);

  useEffect(() => {
    // reset state when dialog is closed
    if (!isOpen) {
      setQuery('');
      setResults(EMPTY_RESULTS);
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const trimmed = query.trim();

    if (!isOpen || trimmed.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY_RESULTS);
      setLoading(false);

      return;
    }

    let cancelled = false;

    const load = async () => {
      const trpc = getTRPCClient();

      setLoading(true);

      try {
        const next = await trpc.messages.search.query({
          query: trimmed,
          scope
        });

        if (!cancelled) {
          // older servers do not return the attachment buckets yet
          setResults({
            messages: next.messages ?? [],
            files: next.files ?? [],
            photos: next.photos ?? [],
            videos: next.videos ?? [],
            audio: next.audio ?? [],
            links: next.links ?? [],
            truncated: next.truncated ?? false
          });
        }
      } catch (error) {
        toast.error(getTrpcError(error, t('common:failedLoadSearchResults')));

        setResults(EMPTY_RESULTS);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(load, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      cancelled = true;
    };
  }, [query, scope, isOpen, t]);

  const canSearch = query.trim().length >= MIN_QUERY_LENGTH;

  return {
    query,
    setQuery,
    loading,
    canSearch,
    results
  };
};
