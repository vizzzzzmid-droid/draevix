import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { getMusicPositionSec } from '@/features/server/voice/helpers';
import { useMusicState } from '@/features/server/voice/hooks';
import { logVoice } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@draevix/shared';
import { memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HlsVideo } from './hls-video';
import {
  setJoinedState,
  setMusicPlaybackBridge,
  useMusicJoined
} from './music-playback-bridge';

const POSITION_SYNC_THRESHOLD_SEC = 3;
const SNAP_SETTLE_MS = 700;
// the shared clock is trusted past the media's end only with a margin: bad
// duration metadata must never cut off audio that is still playing
const END_MARGIN_SEC = 3;
// how long the watchdog waits after a dispatch before retrying a lost or
// failed advance, so a party never stalls on a finished track
const ADVANCE_RETRY_MS = 5000;
// a server replay (repeat-one) resets the clock to the start: an ended
// element with a near-zero clock is nudged back to life within this window
const RESTART_WINDOW_SEC = 5;

const isHlsUrl = (url: string): boolean => /\.m3u8(\?|$)/i.test(url);

// The invisible playback engine of the listening party. It is mounted once
// inside the voice provider, so the <audio>/<video> element — and the joined
// flag — survive navigating between chats, threads and DMs. The visible
// MusicPanel is only a remote control for it. Keyed on the *connected*
// voice channel: leaving voice (or switching to another one) still stops
// the music, exactly like before.
const MusicAudioHost = memo(() => {
  const { t } = useTranslation();
  const channelId = useCurrentVoiceChannelId();
  const music = useMusicState(channelId ?? -1);
  const ownUserId = useOwnUserId();
  const joined = useMusicJoined();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsVideoRef = useRef<HTMLVideoElement | null>(null);

  const currentUrl = music?.current?.mp3Url ?? '';
  const isHls = isHlsUrl(currentUrl);
  const playerRef = isHls ? hlsVideoRef : audioRef;

  const snapToTarget = useCallback(() => {
    const player = playerRef.current;

    if (!player || !music) return;

    const target = getMusicPositionSec(music);
    const current = player.currentTime || 0;
    const drift = Math.abs(target - current);

    logVoice('music: reconcile', { target, current, drift });

    if (drift > POSITION_SYNC_THRESHOLD_SEC) {
      player.currentTime = target;
    }
  }, [music, playerRef]);

  // settle briefly after every state change so fresh metadata (duration,
  // seekable ranges) is in place before the element is moved
  useEffect(() => {
    if (!music?.current) return;

    const timer = window.setTimeout(() => {
      snapToTarget();
    }, SNAP_SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [music, snapToTarget]);

  // the whole party relies on each element's ended event: if it never fires
  // (a stream error instead of a clean end) or the advance mutation is
  // lost, the shared clock runs past the end forever. this ticks while
  // playing and re-dispatches so the party always moves on, and nudges an
  // ended element when the server genuinely replayed the same track
  const currentTrackId = music?.current?.trackId;
  const endedTrackIdRef = useRef<number | undefined>(undefined);
  const endedAtRef = useRef(0);
  const erroredTrackIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    endedTrackIdRef.current = undefined;
    erroredTrackIdRef.current = undefined;
  }, [currentTrackId]);

  const dispatchAdvance = useCallback(async () => {
    if (endedTrackIdRef.current === currentTrackId) return;

    endedTrackIdRef.current = currentTrackId;
    endedAtRef.current = Date.now();

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicNext.mutate({
        expectTrackId: currentTrackId
      });
    } catch (error) {
      // retries would toast in a loop: surface a track's failure once
      if (erroredTrackIdRef.current !== currentTrackId) {
        erroredTrackIdRef.current = currentTrackId;

        toast.error(getTrpcError(error, t('failedMusicTogether')));
      }
    }
  }, [currentTrackId, t]);

  const handleEnded = useCallback(() => {
    void dispatchAdvance();
  }, [dispatchAdvance]);

  useEffect(() => {
    if (!joined || !music?.playing) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;

      if (!player || !music.current) return;

      const target = getMusicPositionSec(music);
      const knownDuration =
        Number.isFinite(player.duration) && player.duration > 0
          ? player.duration
          : (music.current.durationSec ?? 0);
      const pastEnd =
        knownDuration > 0 && target >= knownDuration + END_MARGIN_SEC;
      const dispatched = endedTrackIdRef.current === music.current.trackId;

      if (pastEnd && (player.ended || player.error !== null || player.paused)) {
        if (
          !dispatched ||
          Date.now() - endedAtRef.current >= ADVANCE_RETRY_MS
        ) {
          void dispatchAdvance();
        }

        return;
      }

      // repeat-one re-commits the same track with a reset clock: a stable
      // stream url leaves the element ended, so clear the ended guard and
      // restart it. a stalled party keeps a far-end clock, so this can
      // never resurrect the old replay-the-finished-track loop
      if (player.ended && target < RESTART_WINDOW_SEC) {
        endedTrackIdRef.current = undefined;

        try {
          const result = player.play() as unknown as Promise<void> | undefined;

          void result?.catch(() => {});
        } catch {
          // autoplay blocked until the user interacts with the page
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [joined, music, dispatchAdvance, playerRef]);

  const handleLoadedMetadata = useCallback(() => {
    snapToTarget();
  }, [snapToTarget]);

  const refreshedUrlRef = useRef<string | null>(null);
  const prevTrackUrlRef = useRef('');

  const handleStaleSource = useCallback(async () => {
    // some streams die with an error right at media end instead of a clean
    // `ended`: that is a finish, not a stale url, so advance the party
    if (playerRef.current?.ended) {
      void dispatchAdvance();

      return;
    }

    if (!currentUrl || refreshedUrlRef.current === currentUrl) return;

    refreshedUrlRef.current = currentUrl;

    logVoice('music: refresh', { currentUrl });

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicRefresh.mutate();
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [currentUrl, dispatchAdvance, playerRef, t]);

  // same gating as video: only flip the element when it disagrees. an
  // element that just ended must stay ended: onEnded is dispatching the
  // advance, replaying here would loop the same track over and over
  useEffect(() => {
    const player = playerRef.current;

    if (!player || !music?.current) return;

    if (player.paused && !player.ended && music.playing) {
      try {
        const result = player.play() as unknown as Promise<void> | undefined;

        void result?.catch(() => {});
      } catch {
        // autoplay blocked until the user interacts with the page
      }
    }

    if (!player.paused && !music.playing) {
      player.pause();
    }
  });

  // switching voice channels is a clean slate, like the old panel remount:
  // the next party auto-joins its controller again
  useEffect(() => {
    prevTrackUrlRef.current = '';
  }, [channelId]);

  // the starter joins implicitly, but only when the party appears — never
  // on track changes, so someone who closed the player stays out until
  // they tap join again

  useEffect(() => {
    const hadParty = prevTrackUrlRef.current !== '';
    prevTrackUrlRef.current = currentUrl;

    if (!currentUrl) {
      prevTrackUrlRef.current = '';
      setJoinedState(false);
      return;
    }

    if (!hadParty && music?.controllerUserId === ownUserId) {
      setJoinedState(true);
    }
  }, [currentUrl, music?.controllerUserId, ownUserId]);

  // a fresh element reports nothing until it plays: the panel polls the
  // shared clock on its own, so this stays a deliberate no-op
  const handleNoopTimeUpdate = useCallback(() => {}, []);

  const join = useCallback(() => {
    setJoinedState(true);
  }, []);

  const leave = useCallback(() => {
    setJoinedState(false);
  }, []);

  const play = useCallback(async () => {
    const position =
      playerRef.current?.currentTime ??
      (music ? getMusicPositionSec(music) : 0);

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicResume.mutate({ positionSec: position });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [music, playerRef, t]);

  const pause = useCallback(async () => {
    const position =
      playerRef.current?.currentTime ??
      (music ? getMusicPositionSec(music) : 0);

    const trpc = getTRPCClient();

    try {
      await trpc.voice.musicPause.mutate({ positionSec: position });
    } catch (error) {
      toast.error(getTrpcError(error, t('failedMusicTogether')));
    }
  }, [music, playerRef, t]);

  const seek = useCallback(
    async (positionSec: number) => {
      if (playerRef.current) {
        playerRef.current.currentTime = positionSec;
      }

      const trpc = getTRPCClient();

      try {
        await trpc.voice.musicSeek.mutate({ positionSec });
      } catch (error) {
        toast.error(getTrpcError(error, t('failedMusicTogether')));
      }
    },
    [playerRef, t]
  );

  useEffect(() => {
    setMusicPlaybackBridge({ join, leave, play, pause, seek });

    return () => {
      setMusicPlaybackBridge(null);
    };
  }, [join, leave, play, pause, seek]);

  if (!music?.current) return null;

  return (
    <>
      {joined &&
        (isHls ? (
          <div className="hidden">
            <HlsVideo
              src={currentUrl}
              playing={music.playing}
              videoRef={hlsVideoRef}
              onTimeUpdate={handleNoopTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onStaleSource={handleStaleSource}
              onRetry={handleStaleSource}
            />
          </div>
        ) : (
          <audio
            ref={audioRef}
            src={currentUrl}
            playsInline
            onPlay={snapToTarget}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onError={handleStaleSource}
          />
        ))}
    </>
  );
});

export { MusicAudioHost };
