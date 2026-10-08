import { useAudioLevel } from '@/components/channel-view/voice/hooks/use-audio-level';
import { VoiceProviderContext } from '@/components/voice-provider';
import type { IRootState } from '@/features/store';
import { StreamKind } from '@draevix/shared';
import { useContext, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useIsOwnUser } from '../users/hooks';
import {
  alwaysShowVoiceControlsSelector,
  hideNonVideoParticipantsSelector,
  hideOwnScreenShareSelector,
  musicStateByChannelIdSelector,
  ownVoiceStateSelector,
  pinnedCardSelector,
  showUserBannersInVoiceSelector,
  voiceChannelAudioExternalStreamsSelector,
  voiceChannelExternalStreamsListSelector,
  voiceMoveTargetChannelIdSelector,
  watchStateByChannelIdSelector
} from './selectors';

export const useVoiceChannelExternalStreamsList = (channelId: number) =>
  useSelector((state: IRootState) =>
    voiceChannelExternalStreamsListSelector(state, channelId)
  );

export const useVoiceChannelAudioExternalStreams = (channelId: number) =>
  useSelector((state: IRootState) =>
    voiceChannelAudioExternalStreamsSelector(state, channelId)
  );

export const useVoice = () => {
  const context = useContext(VoiceProviderContext);

  if (!context) {
    throw new Error(
      'useVoice must be used within a MediasoupProvider component'
    );
  }

  return context;
};

export const useOwnVoiceState = () => useSelector(ownVoiceStateSelector);

export const useWatchState = (channelId: number) =>
  useSelector((state: IRootState) =>
    watchStateByChannelIdSelector(state, channelId)
  );

export const useMusicState = (channelId: number) =>
  useSelector((state: IRootState) =>
    musicStateByChannelIdSelector(state, channelId)
  );

export const usePinnedCard = () => useSelector(pinnedCardSelector);

export const useVoiceMoveTargetChannelId = () =>
  useSelector(voiceMoveTargetChannelIdSelector);

export const useHideNonVideoParticipants = () =>
  useSelector(hideNonVideoParticipantsSelector);

export const useShowUserBannersInVoice = () =>
  useSelector(showUserBannersInVoiceSelector);

export const useHideOwnScreenShare = () =>
  useSelector(hideOwnScreenShareSelector);

export const useAlwaysShowVoiceControls = () =>
  useSelector(alwaysShowVoiceControlsSelector);

export const useSpeakingState = (userId: number) => {
  const { remoteUserStreams, localAudioStream } = useVoice();
  const isOwnUser = useIsOwnUser(userId);

  const audioStream = useMemo(() => {
    if (isOwnUser) return localAudioStream;

    return remoteUserStreams[userId]?.[StreamKind.AUDIO];
  }, [remoteUserStreams, userId, isOwnUser, localAudioStream]);

  const { micMuted } = useOwnVoiceState();
  const { isSpeaking, speakingEffectClass } = useAudioLevel(audioStream);

  const isOwnUserAndSpeaking = isOwnUser && isSpeaking && !micMuted;
  const isActivelySpeaking = isOwnUserAndSpeaking || (!isOwnUser && isSpeaking);

  return { isActivelySpeaking, speakingEffectClass };
};
