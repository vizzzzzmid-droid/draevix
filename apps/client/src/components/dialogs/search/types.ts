import type { TFile, TJoinedMessage } from '@draevix/shared';

export type TSearchScope = 'server' | 'dms';

export type TSearchTab = 'messages' | 'photos' | 'videos' | 'audio' | 'links';

export type TSearchResultMessage = TJoinedMessage & {
  plainContent: string;
  channelName: string;
  channelIsDm: boolean;
};

export type TSearchResultFile = {
  file: TFile;
  messageId: number;
  channelId: number;
  messageContent: string | null;
  messageCreatedAt: number;
  channelName: string;
  channelIsDm: boolean;
};

export type TSearchResultLink = {
  links: string[];
  messageId: number;
  channelId: number;
  messageCreatedAt: number;
  channelName: string;
  channelIsDm: boolean;
  plainContent: string;
};

export type TAttachmentCursor = {
  createdAt: number;
  id: number;
};

export type TAttachmentItem =
  | ({ kind: 'file' } & TSearchResultFile)
  | ({ kind: 'link' } & TSearchResultLink);

export type TUnifiedSearchResult =
  | {
      type: 'message';
      createdAt: number;
      key: string;
      item: TSearchResultMessage;
    }
  | {
      type: 'file';
      createdAt: number;
      key: string;
      item: TSearchResultFile;
    }
  | {
      type: 'link';
      createdAt: number;
      key: string;
      item: TSearchResultLink;
    };

export type TSearchResults = {
  messages: TSearchResultMessage[];
  files: TSearchResultFile[];
  truncated: boolean;
};
