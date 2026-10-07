import { z } from 'zod';
import { publishWatchState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import {
  kodikResolveStream,
  normalizeKodikLink,
  throwKodikError
} from '../../helpers/kodik';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const kodikSelectRoute = protectedProcedure
  .input(
    z.object({
      link: z.string().trim().min(1).max(500),
      kodikId: z.string().trim().min(1).max(60),
      title: z.string().trim().min(1).max(300),
      titleOrig: z.string().trim().max(300).optional(),
      translationId: z.string().trim().max(20).optional(),
      translationTitle: z.string().trim().max(100).optional(),
      season: z.number().int().min(1).max(100).optional(),
      episode: z.number().int().min(1).max(5000).optional(),
      poster: z.string().trim().max(500).optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
    const link = normalizeKodikLink(input.link);

    invariant(link, { code: 'NOT_FOUND', message: 'Invalid Kodik link' });

    try {
      const stream = await kodikResolveStream({
        link,
        translationId: input.translationId,
        season: input.season,
        episode: input.episode
      });

      const quality = stream.maxQuality;
      const mp4Url = stream.mp4[String(quality)];
      const hlsUrl = stream.hls[String(quality)];

      invariant(mp4Url && hlsUrl, {
        code: 'BAD_REQUEST',
        message: 'Kodik has no playable quality'
      });

      const watch = {
        file: null,
        kodik: {
          kodikId: input.kodikId,
          link,
          title: input.title,
          titleOrig: input.titleOrig ?? '',
          translationId: input.translationId ?? '',
          translationTitle: input.translationTitle ?? '',
          season: input.season ?? 1,
          episode: input.episode ?? 0,
          quality,
          mp4Url,
          hlsUrl,
          poster: input.poster ?? null
        },
        playing: true,
        positionSec: 0,
        updatedAt: Date.now(),
        controllerUserId: ctx.user.id
      };

      runtime.setWatchState(watch);

      publishWatchState(channelId, watch);
    } catch (error) {
      throwKodikError(error);
    }
  });

export { kodikSelectRoute };
