import { useChannelById } from '@/features/server/channels/hooks';
import { useVoiceUsersByChannelId } from '@/features/server/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import {
  useHideNonVideoParticipants,
  useHideOwnScreenShare,
  useVoice,
  useVoiceChannelExternalStreamsList
} from '@/features/server/voice/hooks';
import { StreamKind } from '@draevix/shared';
import { Volume2 } from 'lucide-react';
import { memo, useMemo } from 'react';
import { ControlsBar } from './controls-bar';
import { ExternalStreamCard } from './external-stream-card';
import { usePinCardController } from './hooks/use-pin-card-controller';
import { MusicPanel } from './music-panel';
import { ScreenShareCard } from './screen-share-card';
import { ScreenSharePrompt } from './screen-share-prompt';
import { VoiceGrid } from './voice-grid';
import { VoiceUserCard } from './voice-user-card';
import { WatchPartyPanel } from './watch-party-panel';

type TChannelProps = {
  channelId: number;
};

const VoiceChannel = memo(({ channelId }: TChannelProps) => {
  const channel = useChannelById(channelId);
  const voiceUsers = useVoiceUsersByChannelId(channelId);
  const externalStreams = useVoiceChannelExternalStreamsList(channelId);
  const { pinnedCard, pinCard, unpinCard, isPinned } = usePinCardController();
  const hideNonVideoParticipants = useHideNonVideoParticipants();
  const hideOwnScreenShare = useHideOwnScreenShare();
  const ownUserId = useOwnUserId();
  const isAnyCardPinned = pinnedCard !== undefined;
  const { pendingScreenShares, remoteUserStreams } = useVoice();

  const cards = useMemo(() => {
    const cards: React.ReactNode[] = [];

    // Check if there are any video streams at all
    const hasAnyVideoStreams =
      voiceUsers.some(
        (user) => user.state.webcamEnabled || user.state.sharingScreen
      ) || externalStreams.some((stream) => stream.tracks.video);

    // Only apply the filter if there are some video streams
    const shouldFilterNonVideo = hideNonVideoParticipants && hasAnyVideoStreams;

    voiceUsers.forEach((voiceUser) => {
      const userCardId = `user-${voiceUser.id}`;
      const hasVideo = voiceUser.state.webcamEnabled;

      // Only show user card if not filtering, or if they have video
      if (!shouldFilterNonVideo || hasVideo) {
        cards.push(
          <VoiceUserCard
            key={userCardId}
            userId={voiceUser.id}
            isPinned={isPinned(userCardId)}
            isAnyCardPinned={isAnyCardPinned}
            cardId={userCardId}
            onPin={pinCard}
            onUnpin={unpinCard}
            voiceUser={voiceUser}
          />
        );
      }

      // Screen shares always have video, so always show them
      const shouldHideOwnScreenShare =
        hideOwnScreenShare && voiceUser.id === ownUserId;
      if (voiceUser.state.sharingScreen && !shouldHideOwnScreenShare) {
        const screenShareCardId = `screen-share-${voiceUser.id}`;
        const hasScreenStream =
          !!remoteUserStreams[voiceUser.id]?.[StreamKind.SCREEN];

        // someone else's screen stays a quiet prompt until tapped through;
        // own preview and already-consumed streams render straight away
        if (
          voiceUser.id !== ownUserId &&
          !hasScreenStream &&
          pendingScreenShares[voiceUser.id]
        ) {
          cards.push(
            <ScreenSharePrompt key={screenShareCardId} userId={voiceUser.id} />
          );
        } else {
          cards.push(
            <ScreenShareCard
              key={screenShareCardId}
              userId={voiceUser.id}
              isPinned={isPinned(screenShareCardId)}
              isAnyCardPinned={isAnyCardPinned}
              cardId={screenShareCardId}
              onPin={pinCard}
              onUnpin={unpinCard}
              showPinControls
            />
          );
        }
      }
    });

    externalStreams.forEach((stream) => {
      const externalStreamCardId = `external-stream-${stream.streamId}`;
      const hasVideo = stream.tracks.video;

      // Only show external stream card if not filtering, or if it has video
      if (!shouldFilterNonVideo || hasVideo) {
        cards.push(
          <ExternalStreamCard
            key={externalStreamCardId}
            streamId={stream.streamId}
            stream={stream}
            isPinned={isPinned(externalStreamCardId)}
            isAnyCardPinned={isAnyCardPinned}
            cardId={externalStreamCardId}
            onPin={pinCard}
            onUnpin={unpinCard}
            showPinControls
          />
        );
      }
    });

    return cards;
  }, [
    voiceUsers,
    externalStreams,
    isPinned,
    pinCard,
    unpinCard,
    hideNonVideoParticipants,
    hideOwnScreenShare,
    ownUserId,
    isAnyCardPinned,
    pendingScreenShares,
    remoteUserStreams
  ]);

  if (voiceUsers.length === 0) {
    return (
      <div className="flex size-full flex-col bg-background">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4 lg:hidden">
          <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-semibold text-foreground">
            {channel?.name}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground text-lg mb-2">
              No one in the voice channel
            </p>
            <p className="text-muted-foreground text-sm">
              Join the voice channel to start a meeting
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col size-full relative bg-background overflow-hidden group/voice-stage">
      <div className="absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-card px-4 lg:hidden">
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-semibold text-foreground">
          {channel?.name}
        </span>
      </div>
      <VoiceGrid className="max-lg:pt-12" pinnedCardId={pinnedCard?.id}>
        {cards}
      </VoiceGrid>
      <WatchPartyPanel channelId={channelId} />
      <MusicPanel channelId={channelId} />
      <ControlsBar channelId={channelId} />
    </div>
  );
});

export { VoiceChannel };
