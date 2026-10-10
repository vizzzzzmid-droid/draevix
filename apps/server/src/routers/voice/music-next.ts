import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { resolvePlayableTrack, throwMusicError } from '../../helpers/music';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

// every listener fires this when their element ends: the expect guard makes
// the race harmless, only the first one advances. repeat-one replays the
// current track, shuffle picks a random next, repeat-all wraps an empty
// queue back onto the current track instead of stopping
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

      if (
        input.expectTrackId !== undefined &&
        current.current.trackId !== input.expectTrackId
      ) {
        return;
      }

      // resolving takes a network round trip: re-check the guard on fresh
      // state before writing, otherwise this overwrites whoever moved on
      // meanwhile and resurrects stale tracks or drops queue edits
      const stillExpected = (): boolean => {
        if (input.expectTrackId === undefined) return true;

        return (
          runtime.getMusicState()?.current?.trackId === input.expectTrackId
        );
      };

      try {
        if (current.repeatMode === 'one') {
          const playable = await resolvePlayableTrack(current.current);

          if (!stillExpected()) return;

          const music = {
            ...current,
            current: {
              ...playable,
              addedByUserId: current.current.addedByUserId
            },
            playing: true,
            positionSec: 0,
            updatedAt: Date.now(),
            controllerUserId: ctx.user.id
          };

          runtime.setMusicState(music);

          publishMusicState(channelId, music);

          return;
        }

        let next = current.queue[0];
        let rest = current.queue.slice(1);

        if (current.shuffle && current.queue.length > 1) {
          const pick = Math.floor(Math.random() * current.queue.length);

          next = current.queue[pick];
          rest = current.queue.filter((_, i) => i !== pick);
        }

        if (!next) {
          if (current.repeatMode === 'all') {
            const playable = await resolvePlayableTrack(current.current);

            if (!stillExpected()) return;

            const music = {
              ...current,
              current: {
                ...playable,
                addedByUserId: current.current.addedByUserId
              },
              playing: true,
              positionSec: 0,
              updatedAt: Date.now(),
              controllerUserId: ctx.user.id
            };

            runtime.setMusicState(music);

            publishMusicState(channelId, music);

            return;
          }

          runtime.clearMusicState();

          publishMusicState(channelId, undefined);

          return;
        }

        const playable = await resolvePlayableTrack(next);

        if (!stillExpected()) return;

        const music = {
          ...current,
          current: { ...playable, addedByUserId: next.addedByUserId },
          queue: rest,
          playing: true,
          positionSec: 0,
          updatedAt: Date.now(),
          controllerUserId: ctx.user.id
        };

        runtime.setMusicState(music);

        publishMusicState(channelId, music);
      } catch (error) {
        throw throwMusicError(error);
      }
    });
  });

export { musicNextRoute };
