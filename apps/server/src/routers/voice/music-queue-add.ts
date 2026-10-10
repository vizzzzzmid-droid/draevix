import { z } from 'zod';
import { publishMusicState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import {
  resolvePlayableTrack,
  throwMusicError,
  zTrackInput
} from '../../helpers/music';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const MAX_QUEUE_LENGTH = 500;

const musicQueueAddRoute = protectedProcedure
  .input(
    z.object({
      track: zTrackInput,
      tracks: z.array(zTrackInput).max(MAX_QUEUE_LENGTH).optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);

    return await runtime.runMusicExclusive(async () => {
      try {
        const incoming = [input.track, ...(input.tracks ?? [])].map(
          (track) => ({
            trackId: track.trackId,
            title: track.title,
            author: track.author ?? '',
            artworkUrl: track.artworkUrl ?? null,
            durationSec: track.durationSec ?? 0,
            permalinkUrl: track.permalinkUrl,
            source: track.source,
            sourceId: track.sourceId,
            addedByUserId: ctx.user.id
          })
        );

        const current = runtime.getMusicState();

        // adding to an idle player starts it with the first track, the rest
        // queues behind it
        if (!current?.current) {
          const [first, ...rest] = incoming;

          invariant(first, {
            code: 'BAD_REQUEST',
            message: 'Nothing to play'
          });

          const playable = await resolvePlayableTrack(first);

          const music = {
            current: { ...playable, addedByUserId: first.addedByUserId },
            queue: rest.slice(0, MAX_QUEUE_LENGTH),
            playing: true,
            positionSec: 0,
            updatedAt: Date.now(),
            controllerUserId: ctx.user.id,
            repeatMode: 'off' as const,
            shuffle: false
          };

          runtime.setMusicState(music);

          publishMusicState(channelId, music);

          return;
        }

        invariant(current.queue.length + incoming.length <= MAX_QUEUE_LENGTH, {
          code: 'BAD_REQUEST',
          message: 'The queue is full'
        });

        const music = {
          ...current,
          queue: [...current.queue, ...incoming]
        };

        runtime.setMusicState(music);

        publishMusicState(channelId, music);
      } catch (error) {
        throw throwMusicError(error);
      }
    });
  });

export { musicQueueAddRoute };
