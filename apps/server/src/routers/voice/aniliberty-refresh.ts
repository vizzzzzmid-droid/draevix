import { publishWatchState } from '../../db/publishers';
import {
  anilibertyDescribe,
  throwAnilibertyError,
  verifyAnilibertyManifest
} from '../../helpers/aniliberty';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { logger } from '../../logger';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

// manifest urls carry a short-lived signature, so a stale player (late join
// after the links died) re-resolves the same episode without moving the
// shared position or stealing control
const anilibertyRefreshRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
  const current = runtime.getWatchState();

  invariant(current?.aniliberty, {
    code: 'NOT_FOUND',
    message: 'No active Aniliberty watch party'
  });

  try {
    logger.info(
      'aniliberty refresh requested by %s: release %s episode %s',
      ctx.user.name,
      current.aniliberty.releaseId,
      current.aniliberty.episode
    );

    const described = await anilibertyDescribe(current.aniliberty.releaseId);

    const episode = described.episodes.find(
      (ep) => ep.ordinal === current.aniliberty!.episode
    );

    invariant(episode, { code: 'NOT_FOUND', message: 'Episode not found' });

    const hlsUrl = episode.hls720 ?? episode.hls480 ?? episode.hls1080;

    invariant(hlsUrl, {
      code: 'BAD_REQUEST',
      message: 'This episode has no playable quality'
    });

    await verifyAnilibertyManifest(hlsUrl);

    const watch = {
      ...current,
      aniliberty: {
        ...current.aniliberty,
        episodeName: episode.name ?? current.aniliberty.episodeName,
        durationSec: episode.duration,
        hlsUrl
      }
    };

    runtime.setWatchState(watch);

    publishWatchState(channelId, watch);

    logger.info(
      'aniliberty refresh done for %s: %s',
      ctx.user.name,
      hlsUrl.slice(0, 90)
    );
  } catch (error) {
    throwAnilibertyError(error);
  }
});

export { anilibertyRefreshRoute };
