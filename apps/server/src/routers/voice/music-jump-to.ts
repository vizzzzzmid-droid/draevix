import { z } from 'zod';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { throwMusicError } from '../../helpers/music';
import { advanceMusicLocked } from '../../helpers/music-advance';
import { logger } from '../../logger';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

// jumps straight to a queued track, skipping everything before it: advances
// one live track at a time until that track is current, so dead entries on
// the way are dropped without overshooting. repeat-one never replays here
// and shuffle is bypassed, so the jump always lands exactly on the picked
// track; if it dies on arrival the party moves past it to the bound below
const musicJumpToRoute = protectedProcedure
  .input(
    z.object({
      index: z.number().int().nonnegative()
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

      const target = current.queue[input.index];

      invariant(target, {
        code: 'NOT_FOUND',
        message: 'Track is no longer queued'
      });

      const targetTrackId = target.trackId;
      // each iteration advances exactly one live track, so queue length + 1
      // always suffices; the bound is only a backstop for a target that
      // dies between being picked and being reached
      const maxSteps = current.queue.length + 1;

      try {
        for (let step = 0; step < maxSteps; step += 1) {
          const state = runtime.getMusicState();

          if (!state?.current || state.current.trackId === targetTrackId) {
            break;
          }

          await advanceMusicLocked({
            runtime,
            channelId,
            actorUserId: ctx.user.id,
            expectTrackId: undefined,
            skipCurrent: true,
            ignoreShuffle: true
          });
        }
      } catch (error) {
        // client jumps are one-shot, not retried on a timer: without a log
        // line a failing jump stalls invisibly at the wrong track
        logger.error(
          'musicJumpTo failed in channel %s (user %s, index %s): %s',
          channelId,
          ctx.user.id,
          input.index,
          error
        );

        throw throwMusicError(error);
      }
    });
  });

export { musicJumpToRoute };
