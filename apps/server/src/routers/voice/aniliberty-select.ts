import { z } from 'zod';
import { publishWatchState } from '../../db/publishers';
import {
  anilibertyDescribe,
  throwAnilibertyError,
  verifyAnilibertyManifest
} from '../../helpers/aniliberty';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const anilibertySelectRoute = protectedProcedure
  .input(
    z.object({
      releaseId: z.number().int().positive(),
      episode: z.number().int().min(1).max(5000)
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

    try {
      const described = await anilibertyDescribe(input.releaseId);

      invariant(!described.blocked, {
        code: 'BAD_REQUEST',
        message: 'This title is blocked in your country'
      });

      const episode = described.episodes.find(
        (ep) => ep.ordinal === input.episode
      );

      invariant(episode, { code: 'NOT_FOUND', message: 'Episode not found' });

      const hlsUrl = episode.hls720 ?? episode.hls480 ?? episode.hls1080;

      invariant(hlsUrl, {
        code: 'BAD_REQUEST',
        message: 'This episode has no playable quality'
      });

      await verifyAnilibertyManifest(hlsUrl);

      const watch = {
        file: null,
        aniliberty: {
          releaseId: described.releaseId,
          episode: episode.ordinal,
          episodeName: episode.name ?? '',
          title: described.title,
          titleOrig: described.titleOrig,
          poster: described.poster,
          durationSec: episode.duration,
          hlsUrl
        },
        playing: true,
        positionSec: 0,
        updatedAt: Date.now(),
        controllerUserId: ctx.user.id
      };

      runtime.setWatchState(watch);

      publishWatchState(channelId, watch);
    } catch (error) {
      throwAnilibertyError(error);
    }
  });

export { anilibertySelectRoute };
