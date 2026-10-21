import { getChannelsForUser } from '../db/queries/channels';
import { getDirectMessageChannelIdsForUser } from '../db/queries/dms';

type TSearchScope = 'server' | 'dms';

const getSearchChannelIds = async (
  userId: number,
  scope: TSearchScope,
  directMessagesEnabled: boolean
): Promise<number[]> => {
  if (scope === 'dms') {
    return directMessagesEnabled
      ? getDirectMessageChannelIdsForUser(userId)
      : [];
  }

  return (await getChannelsForUser(userId))
    .filter((channel) => !channel.isDm)
    .map((channel) => channel.id);
};

export { getSearchChannelIds };
