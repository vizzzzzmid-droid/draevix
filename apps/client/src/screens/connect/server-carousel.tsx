import { normalizeServerAddress } from '@/helpers/get-file-url';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TCommunityServer } from './hooks/use-community-servers';

type TServerCarouselProps = {
  servers: TCommunityServer[];
  selectedAddress: string;
  onSelect: (address: string) => void;
};

type TServerCardProps = {
  server: TCommunityServer;
  selected: boolean;
  onSelect: (address: string) => void;
};

const ServerCard = memo(({ server, selected, onSelect }: TServerCardProps) => {
  const [logoBroken, setLogoBroken] = useState(false);

  const handleClick = useCallback(() => {
    onSelect(server.address);
  }, [server.address, onSelect]);

  const handleLogoError = useCallback(() => {
    setLogoBroken(true);
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-24 shrink-0 snap-start flex-col items-center gap-1 rounded-lg border px-2 py-3 transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border/50 hover:bg-muted/40'
      )}
    >
      {server.logoUrl && !logoBroken ? (
        <img
          src={server.logoUrl}
          alt=""
          onError={handleLogoError}
          className="h-14 w-14 rounded-md object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/20 text-xl font-bold">
          {(server.liveName ?? server.name).charAt(0).toUpperCase()}
        </span>
      )}
      <span className="w-full truncate text-center text-xs font-medium">
        {server.liveName ?? server.name}
      </span>
      {server.onlineCount !== undefined && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" />
          {server.onlineCount}
        </span>
      )}
    </button>
  );
});

const ServerCarousel = memo(
  ({ servers, selectedAddress, onSelect }: TServerCarouselProps) => {
    const { t } = useTranslation('connect');
    const trackRef = useRef<HTMLDivElement>(null);
    const [page, setPage] = useState(0);
    const [pageCount, setPageCount] = useState(1);

    const updatePaging = useCallback(() => {
      const track = trackRef.current;

      if (!track || track.clientWidth === 0) return;

      setPageCount(
        Math.max(1, Math.ceil(track.scrollWidth / track.clientWidth))
      );
      setPage(
        Math.min(
          Math.max(0, Math.round(track.scrollLeft / track.clientWidth)),
          Math.max(0, Math.ceil(track.scrollWidth / track.clientWidth) - 1)
        )
      );
    }, []);

    useEffect(() => {
      updatePaging();
    }, [servers, updatePaging]);

    const scrollPage = useCallback((direction: 1 | -1) => {
      trackRef.current?.scrollBy({
        left: direction * (trackRef.current?.clientWidth ?? 0),
        behavior: 'smooth'
      });
    }, []);

    const handlePrev = useCallback(() => {
      scrollPage(-1);
    }, [scrollPage]);

    const handleNext = useCallback(() => {
      scrollPage(1);
    }, [scrollPage]);

    const selectedHost =
      selectedAddress.trim() === ''
        ? ''
        : normalizeServerAddress(selectedAddress).host;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {t('communityServersTitle')}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={handlePrev}
                aria-label={t('communityServersPrev')}
                className="rounded p-0.5 hover:bg-muted/60"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>
                {page + 1}/{pageCount}
              </span>
              <button
                type="button"
                onClick={handleNext}
                aria-label={t('communityServersNext')}
                className="rounded p-0.5 hover:bg-muted/60"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div
          ref={trackRef}
          onScroll={updatePaging}
          className="flex gap-2 overflow-x-auto pb-1 snap-x"
        >
          {servers.map((server) => (
            <ServerCard
              key={server.address}
              server={server}
              selected={
                normalizeServerAddress(server.address).host === selectedHost
              }
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }
);

export { ServerCarousel };
