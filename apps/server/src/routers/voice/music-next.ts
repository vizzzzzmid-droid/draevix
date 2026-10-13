import { z } from 'zod';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { advanceMusicLocked } from '../../helpers/music-advance';
import { throwMusicError } from '../../helpers/music';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

// every listener fires this when their element ends: the expect guard makes
// the race harmless, only the first one advances. repeat-one replays the
// current track, shuffle picks a random next, repeat-all wraps an empty
// queue back onto the current track instead of stopping. tracks that died
// upstream are dropped instead of erroring the advance forever
const musicNextRoute = protectedProcedure
  .input(
    z.object({
      // audius ids are negative hashes, so positivity is not required
      expectTrackId: z.number().int().optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

    return await runtime.runMusicExclusive(async () => {
      const current = runtime.getMusicState();

      invariant(current?.current, {
        code: 'NOT_FOUND',
        message: 'No active listening party'
      });

      try {
        await advanceMusicLocked({
          runtime,
          channelId,
          actorUserId: ctx.user.id,
          expectTrackId: input.expectTrackId,
          skipCurrent: false
        });
      } catch (error) {
        throw throwMusicError(error);
      }
    });
  });

export { musicNextRoute };
