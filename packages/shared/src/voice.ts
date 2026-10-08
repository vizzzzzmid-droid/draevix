import type { IceCandidate, IceParameters } from 'mediasoup/types';
import type { StreamKind, TExternalStreamTracks } from './types';

export type { ConsumerType } from 'mediasoup/types';

export type TVoiceUserState = {
  micMuted: boolean;
  soundMuted: boolean;
  webcamEnabled: boolean;
  sharingScreen: boolean;
};

export type TVoiceUser = {
  userId: number;
  state: TVoiceUserState;
};

export type TWatchFile = {
  id: number;
  name: string;
  originalName: string;
  mimeType: string;
  _accessToken?: string;
  _accessTokenExpiresAt?: number;
};

export type TAnilibertyWatchSource = {
  releaseId: number;
  episode: number;
  episodeName: string;
  title: string;
  titleOrig: string;
  poster: string | null;
  durationSec: number;
  hlsUrl: string;
  opening: { start: number; stop: number } | null;
  ending: { start: number; stop: number } | null;
};

export type TMusicTrack = {
  trackId: number;
  title: string;
  author: string;
  artworkUrl: string | null;
  durationSec: number;
  permalinkUrl: string;
  mp3Url?: string;
};

export type TMusicState = {
  current: TMusicTrack | null;
  queue: TMusicTrack[];
  playing: boolean;
  positionSec: number;
  updatedAt: number;
  controllerUserId: number;
};

export type TWatchState = {
  file: TWatchFile | null;
  aniliberty: TAnilibertyWatchSource | null;
  playing: boolean;
  positionSec: number;
  updatedAt: number;
  controllerUserId: number;
};

export type TExternalStream = {
  title: string;
  key: string;
  pluginId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  tracks: TExternalStreamTracks;
};

export type TChannelState = {
  users: TVoiceUser[];
  externalStreams: { [streamId: number]: TExternalStream };
};

export type TTransportParams = {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: any;
};

export type TVoiceMap = {
  [channelId: number]: {
    users: {
      [userId: number]: TVoiceUserState;
    };
  };
};

export type TExternalStreamsMap = {
  [channelId: number]: {
    [streamId: number]: TExternalStream;
  };
};

export type TVoiceProducerInfo = {
  userId: number;
  kind: StreamKind;
  producerId: string;
  paused: boolean;
};

export type TWatchMap = {
  [channelId: number]: TWatchState;
};

export type TMusicMap = {
  [channelId: number]: TMusicState;
};
