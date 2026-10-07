import { publishWatchState } from '../../db/publishers';
import { getCurrentVoiceRuntime } from '../../helpers/get-current-voice-runtime';
import { kodikResolveStream, throwKodikError } from '../../helpers/kodik';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

// upstream links carry a timestamp signature that dies within hours, so a
// stale player re-resolves the same title/episode without moving the shared
// position or stealing control
const kodikRefreshRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const { runtime, channelId } = await getCurrentVoiceRuntime(ctx);
  const current = runtime.getWatchState();

  invariant(current?.kodik, {
    code: 'NOT_FOUND',
    message: 'No active Kodik watch party'
  });

  try {
    const stream = await kodikResolveStream({
      link: current.kodik.link,
      translationId: current.kodik.translationId || undefined,
      season: current.kodik.season,
      episode: current.kodik.episode || undefined
    });

    const quality = stream.maxQuality;
    const mp4Url = stream.mp4[String(quality)];
    const hlsUrl = stream.hls[String(quality)];

    invariant(mp4Url && hlsUrl, {
      code: 'BAD_REQUEST',
      message: 'Kodik has no playable quality'
    });

    const watch = {
      ...current,
      kodik: { ...current.kodik, quality, mp4Url, hlsUrl }
    };

    runtime.setWatchState(watch);

    publishWatchState(channelId, watch);
  } catch (error) {
    throwKodikError(error);
  }
});

export { kodikRefreshRoute };
