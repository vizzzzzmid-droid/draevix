import { z } from 'zod';
import { publishWatchState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import {
  getRutubeMeta,
  RUTUBE_ID_RE,
  throwRutubeError
} from '../../helpers/rutube';
import { generateRutubeToken } from '../../helpers/rutube-crypto';
import { protectedProcedure } from '../../utils/trpc';

// proxy tokens outlive a movie night but stay short enough that a leaked
// watch link stops working on its own
const RUTUBE_WATCH_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const selectRutubeWatchRoute = protectedProcedure
  .input(
    z.object({
      videoId: z.string().regex(RUTUBE_ID_RE, 'Invalid Rutube video id')
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

    try {
      const meta = await getRutubeMeta(input.videoId);
      const expiresAt = Date.now() + RUTUBE_WATCH_TOKEN_TTL_MS;

      const watch = {
        file: null,
        rutube: {
          videoId: meta.videoId,
          title: meta.title,
          authorName: meta.authorName,
          durationSec: meta.durationSec,
          thumbnailUrl: meta.thumbnailUrl,
          _accessToken: generateRutubeToken(meta.videoId, expiresAt),
          _accessTokenExpiresAt: expiresAt
        },
        playing: true,
        positionSec: 0,
        updatedAt: Date.now(),
        controllerUserId: ctx.user.id
      };

      runtime.setWatchState(watch);

      publishWatchState(channelId, watch);
    } catch (error) {
      throwRutubeError(error);
    }
  });

export { selectRutubeWatchRoute };
