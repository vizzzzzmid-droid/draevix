import { getChannelsForUser } from '../db/queries/channels';
import { getDirectMessageChannelIdsForUser } from '../db/queries/dms';

type TSearchScope = 'server' | 'dms';

const getSearchChannelIds = async (
  userId: number,
  scope: TSearchScope,
  directMessagesEnabled: boolean,
  channelId?: number
): Promise<number[]> => {
  const channelIds =
    scope === 'dms'
      ? directMessagesEnabled
        ? await getDirectMessageChannelIdsForUser(userId)
        : []
      : (await getChannelsForUser(userId))
          .filter((channel) => !channel.isDm)
          .map((channel) => channel.id);

  if (channelId === undefined) {
    return channelIds;
  }

  return channelIds.includes(channelId) ? [channelId] : [];
};

export { getSearchChannelIds };
