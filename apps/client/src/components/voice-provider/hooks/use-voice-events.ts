import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import {
  setMusicStateForChannel,
  setWatchStateForChannel
} from '@/features/server/voice/actions';
import {
  logVoice,
  logVoiceError,
  logVoiceWarn
} from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import type { TRemoteUserStreamKinds } from '@/types';
import { StreamKind } from '@draevix/shared';
import type { RtpCapabilities } from 'mediasoup-client/types';
import type { RefObject } from 'react';
import { useEffect } from 'react';
import { isOwnProducerEvent } from '../helpers';

type TEvents = {
  consume: (
    remoteId: number,
    kind: StreamKind,
    rtpCapabilities: RtpCapabilities
  ) => Promise<void>;
  removeRemoteUserStream: (
    userId: number,
    kind: TRemoteUserStreamKinds
  ) => void;
  removeExternalStreamTrack: (
    streamId: number,
    kind: StreamKind.EXTERNAL_AUDIO | StreamKind.EXTERNAL_VIDEO
  ) => void;
  removeExternalStream: (streamId: number) => void;
  clearRemoteUserStreamsForUser: (userId: number) => void;
  addPendingScreenShare: (userId: number) => void;
  removePendingScreenShare: (userId: number) => void;
  isWatchingScreenShare: (userId: number) => boolean;
  rtpCapabilitiesRef: RefObject<RtpCapabilities | null | undefined>;
  isVoiceSessionActive: boolean;
};

const useVoiceEvents = ({
  consume,
  removeRemoteUserStream,
  removeExternalStreamTrack,
  removeExternalStream,
  clearRemoteUserStreamsForUser,
  addPendingScreenShare,
  removePendingScreenShare,
  isWatchingScreenShare,
  rtpCapabilitiesRef,
  isVoiceSessionActive
}: TEvents) => {
  const currentVoiceChannelId = useCurrentVoiceChannelId();
  const ownUserId = useOwnUserId();

  useEffect(() => {
    if (!currentVoiceChannelId) {
      logVoice('events: not subscribed, no voice channel');
      return;
    }

    if (!isVoiceSessionActive) {
      logVoice('events: not subscribed, voice session not established yet');
      return;
    }

    const trpc = getTRPCClient();

    let isCleaningUp = false;

    const onVoiceNewProducerSub = trpc.voice.onNewProducer.subscribe(
      undefined,
      {
        onData: ({ remoteId, kind, channelId }) => {
          if (currentVoiceChannelId !== channelId || isCleaningUp) return;

          if (isOwnProducerEvent(remoteId, ownUserId, kind)) {
            logVoice('events: ignoring own new producer', { kind, channelId });

            return;
          }

          logVoice('events: new producer', { remoteId, kind, channelId });

          // someone else's screen share stays believed-but-unseen until the
          // user taps through: video waits as pending, late audio joins an
          // already-watched screen straight away
          if (kind === StreamKind.SCREEN || kind === StreamKind.SCREEN_AUDIO) {
            const screenRtpCapabilities = rtpCapabilitiesRef.current;

            if (!screenRtpCapabilities) {
              logVoiceWarn(
                'events: screen producer ignored, no rtp capabilities',
                {
                  remoteId,
                  kind
                }
              );

              return;
            }

            if (
              kind === StreamKind.SCREEN_AUDIO &&
              isWatchingScreenShare(remoteId)
            ) {
              try {
                consume(remoteId, kind, screenRtpCapabilities);
              } catch (error) {
                logVoiceError('events: consuming new producer failed', error, {
                  remoteId,
                  kind,
                  channelId
                });
              }
            } else {
              addPendingScreenShare(remoteId);
            }

            return;
          }

          const rtpCapabilities = rtpCapabilitiesRef.current;

          // init sets the ref before it consumes the existing producers, so anything that
          // lands in the gap is picked up by that pass instead
          if (!rtpCapabilities) {
            logVoiceWarn('events: new producer ignored, no rtp capabilities', {
              remoteId,
              kind
            });

            return;
          }

          try {
            consume(remoteId, kind, rtpCapabilities);
          } catch (error) {
            logVoiceError('events: consuming new producer failed', error, {
              remoteId,
              kind,
              channelId
            });
          }
        },
        onError: (error) => {
          logVoiceError('events: new producer subscription error', error);
        }
      }
    );

    const onVoiceProducerClosedSub = trpc.voice.onProducerClosed.subscribe(
      undefined,
      {
        onData: ({ channelId, remoteId, kind }) => {
          if (currentVoiceChannelId !== channelId || isCleaningUp) return;

          logVoice('events: producer closed', { remoteId, kind, channelId });

          try {
            if (
              kind === StreamKind.EXTERNAL_VIDEO ||
              kind === StreamKind.EXTERNAL_AUDIO
            ) {
              removeExternalStreamTrack(remoteId, kind);
            } else {
              removeRemoteUserStream(remoteId, kind);
            }

            if (
              kind === StreamKind.SCREEN ||
              kind === StreamKind.SCREEN_AUDIO
            ) {
              removePendingScreenShare(remoteId);
            }
          } catch (error) {
            logVoiceError(
              'events: removing stream for closed producer failed',
              error,
              { remoteId, kind, channelId }
            );
          }
        },
        onError: (error) => {
          logVoiceError('events: producer closed subscription error', error);
        }
      }
    );

    const onVoiceUserLeaveSub = trpc.voice.onLeave.subscribe(undefined, {
      onData: ({ channelId, userId }) => {
        if (currentVoiceChannelId !== channelId || isCleaningUp) return;

        logVoice('events: user left voice', { userId, channelId });

        try {
          clearRemoteUserStreamsForUser(userId);
          removePendingScreenShare(userId);
        } catch (error) {
          logVoiceError('events: clearing streams for user failed', error, {
            userId
          });
        }
      },
      onError: (error) => {
        logVoiceError('events: user leave subscription error', error);
      }
    });

    const onVoiceRemoveExternalStreamSub =
      trpc.voice.onRemoveExternalStream.subscribe(undefined, {
        onData: ({ channelId, streamId }) => {
          if (currentVoiceChannelId !== channelId || isCleaningUp) return;

          logVoice('events: external stream removed', {
            streamId,
            channelId
          });

          try {
            removeExternalStream(streamId);
          } catch (error) {
            logVoiceError('events: removing external stream failed', error, {
              streamId,
              channelId
            });
          }
        },
        onError: (error) => {
          logVoiceError('events: external stream subscription error', error);
        }
      });

    const onWatchUpdateSub = trpc.voice.onWatchUpdate.subscribe(undefined, {
      onData: ({ channelId, watch }) => {
        if (currentVoiceChannelId !== channelId || isCleaningUp) return;

        logVoice('events: watch updated', {
          channelId,
          positionSec: watch?.positionSec,
          playing: watch?.playing,
          controllerUserId: watch?.controllerUserId,
          updatedAt: watch?.updatedAt,
          fileId: watch?.file?.id,
          anilibertyReleaseId: watch?.aniliberty?.releaseId
        });
        setWatchStateForChannel(channelId, watch);
      },
      onError: (error) => {
        logVoiceError('events: watch update subscription error', error);
      }
    });

    const onMusicUpdateSub = trpc.voice.onMusicUpdate.subscribe(undefined, {
      onData: ({ channelId, music }) => {
        if (currentVoiceChannelId !== channelId || isCleaningUp) return;

        logVoice('events: music updated', {
          channelId,
          positionSec: music?.positionSec,
          playing: music?.playing,
          controllerUserId: music?.controllerUserId,
          updatedAt: music?.updatedAt,
          trackId: music?.current?.trackId,
          queueLength: music?.queue.length
        });
        setMusicStateForChannel(channelId, music);
      },
      onError: (error) => {
        logVoiceError('events: music update subscription error', error);
      }
    });

    return () => {
      logVoice('events: unsubscribing');

      isCleaningUp = true;

      onVoiceNewProducerSub.unsubscribe();
      onVoiceProducerClosedSub.unsubscribe();
      onVoiceUserLeaveSub.unsubscribe();
      onVoiceRemoveExternalStreamSub.unsubscribe();
      onWatchUpdateSub.unsubscribe();
      onMusicUpdateSub.unsubscribe();
    };
  }, [
    currentVoiceChannelId,
    ownUserId,
    consume,
    removeRemoteUserStream,
    removeExternalStreamTrack,
    removeExternalStream,
    clearRemoteUserStreamsForUser,
    addPendingScreenShare,
    removePendingScreenShare,
    isWatchingScreenShare,
    rtpCapabilitiesRef,
    isVoiceSessionActive
  ]);
};

export { useVoiceEvents };
