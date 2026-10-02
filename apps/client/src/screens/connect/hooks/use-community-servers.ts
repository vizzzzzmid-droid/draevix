import { normalizeServerAddress } from '@/helpers/get-file-url';
import { useStrictEffect } from '@/hooks/use-strict-effect';
import {
  parseServersRegistry,
  SERVERS_REGISTRY_URL,
  type TFile,
  type TRegistryServerEntry,
  type TServerInfo
} from '@draevix/shared';
import { useState } from 'react';

type TCommunityServer = TRegistryServerEntry & {
  liveName?: string;
  onlineCount?: number;
  logoUrl?: string;
};

const fetchJson = async (url: string, timeoutMs: number): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
};

const getRemoteFileUrl = (
  base: string,
  file: TFile | null | undefined
): string | undefined => {
  if (!file) return undefined;

  let url = `${base}/public/${file.name}`;

  if (file._accessToken) {
    url += `?accessToken=${file._accessToken}`;

    if (file._accessTokenExpiresAt) {
      url += `&expires=${file._accessTokenExpiresAt}`;
    }
  }

  return encodeURI(url);
};

const loadCommunityServers = async (): Promise<TCommunityServer[]> => {
  let registry: unknown = [];

  try {
    registry = await fetchJson(SERVERS_REGISTRY_URL, 8000);
  } catch {
    return [];
  }

  const settled = await Promise.allSettled(
    parseServersRegistry(registry).map(
      async (entry): Promise<TCommunityServer> => {
        const { host, secure } = normalizeServerAddress(entry.address);
        const base = `${secure ? 'https' : 'http'}://${host}`;

        try {
          const info = (await fetchJson(`${base}/info`, 5000)) as TServerInfo;

          return {
            ...entry,
            liveName: info.name,
            onlineCount: info.onlineCount,
            logoUrl: getRemoteFileUrl(base, info.logo)
          };
        } catch {
          return { ...entry };
        }
      }
    )
  );

  return settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  );
};

const useCommunityServers = (enabled: boolean) => {
  const [servers, setServers] = useState<TCommunityServer[] | undefined>(
    undefined
  );

  useStrictEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    loadCommunityServers().then((loaded) => {
      if (!cancelled) setServers(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return servers;
};

export { loadCommunityServers, useCommunityServers };
export type { TCommunityServer };
