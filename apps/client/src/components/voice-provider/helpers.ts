import { getResWidthHeight } from '@/helpers/get-res-with-height';
import {
  getLocalStorageItemAsJSON,
  LocalStorageKey,
  setLocalStorageItemAsJSON
} from '@/helpers/storage';
import {
  Resolution,
  ScreenCursor,
  VideoCodec,
  type TScreenShareSource,
  type TStreamQuality
} from '@/types';
import {
  StreamKind,
  type ConsumerType,
  type TStreamQualityLayer
} from '@draevix/shared';
import type {
  RtpCapabilities,
  RtpCodecCapability
} from 'mediasoup-client/types';
import {
  SIMULCAST_HIGH_LAYER_SCALE,
  SIMULCAST_LOW_LAYER_BITRATE_RATIO,
  SIMULCAST_LOW_LAYER_MAX_BITRATE,
  SIMULCAST_LOW_LAYER_MAX_FRAMERATE,
  SIMULCAST_LOW_LAYER_SCALE,
  SIMULCAST_MID_LAYER_BITRATE_RATIO,
  SIMULCAST_MID_LAYER_MAX_BITRATE,
  SIMULCAST_MID_LAYER_MAX_FRAMERATE,
  SIMULCAST_MID_LAYER_SCALE,
  SIMULCAST_MIN_MAX_BITRATE,
  SIMULCAST_SCREEN_LOW_LAYER_BITRATE_RATIO,
  SIMULCAST_SCREEN_LOW_LAYER_MAX_BITRATE,
  SIMULCAST_SCREEN_LOW_LAYER_MAX_FRAMERATE,
  SIMULCAST_SCREEN_MID_LAYER_BITRATE_RATIO,
  SIMULCAST_SCREEN_MID_LAYER_MAX_BITRATE,
  SIMULCAST_SCREEN_MID_LAYER_MAX_FRAMERATE
} from './statics';

type TStreamQualitySettings = Record<string, TStreamQuality>;
type TRemoteConsumerTypes = Record<string, ConsumerType | undefined>;
type TRemoteQualityLayers = Record<string, TStreamQualityLayer[] | undefined>;

const loadStreamQualitiesFromStorage = (): TStreamQualitySettings => {
  try {
    return (
      getLocalStorageItemAsJSON<TStreamQualitySettings>(
        LocalStorageKey.STREAM_QUALITY_SETTINGS
      ) ?? {}
    );
  } catch {
    return {};
  }
};

const saveStreamQualitiesToStorage = (qualities: TStreamQualitySettings) => {
  try {
    setLocalStorageItemAsJSON(
      LocalStorageKey.STREAM_QUALITY_SETTINGS,
      qualities
    );
  } catch {
    // ignore
  }
};

const getStreamQualityStorageKey = (remoteId: number, kind: StreamKind) => {
  switch (kind) {
    case StreamKind.EXTERNAL_VIDEO:
      return `external-video-${remoteId}`;
    case StreamKind.SCREEN:
      return `user-screen-${remoteId}`;
    case StreamKind.VIDEO:
      return `user-video-${remoteId}`;
    default:
      return `${remoteId}-${kind}`;
  }
};

const getRemoteConsumerTypeKey = (remoteId: number, kind: StreamKind) => {
  return `${remoteId}-${kind}`;
};

const normalizeStreamQuality = (
  quality: TStreamQuality | undefined,
  layers: TStreamQualityLayer[]
): TStreamQuality => {
  if (!quality) return { mode: 'auto' };

  if (
    quality.mode === 'layer' &&
    layers.length > 0 &&
    !layers.some((layer) => layer.spatialLayer === quality.spatialLayer)
  ) {
    return { mode: 'auto' };
  }

  return quality;
};

const getStreamQualityDropdownValue = (quality: TStreamQuality) => {
  return quality.mode === 'auto' ? 'auto' : `layer-${quality.spatialLayer}`;
};

const parseStreamQualityDropdownValue = (value: string): TStreamQuality => {
  if (value === 'auto') return { mode: 'auto' };

  return {
    mode: 'layer',
    spatialLayer: Number(value.replace('layer-', ''))
  };
};

const getStoredStreamQuality = (
  remoteId: number,
  kind: StreamKind,
  layers: TStreamQualityLayer[]
): TStreamQuality => {
  const qualities = loadStreamQualitiesFromStorage();

  return normalizeStreamQuality(
    qualities[getStreamQualityStorageKey(remoteId, kind)],
    layers
  );
};

const getSimulcastEncodings = (
  maxBitrate: number
): RTCRtpEncodingParameters[] => {
  const safeMaxBitrate = Math.max(SIMULCAST_MIN_MAX_BITRATE, maxBitrate);

  return [
    {
      maxBitrate: Math.min(
        SIMULCAST_LOW_LAYER_MAX_BITRATE,
        Math.round(safeMaxBitrate * SIMULCAST_LOW_LAYER_BITRATE_RATIO)
      ),
      maxFramerate: SIMULCAST_LOW_LAYER_MAX_FRAMERATE,
      scaleResolutionDownBy: SIMULCAST_LOW_LAYER_SCALE
    },
    {
      maxBitrate: Math.min(
        SIMULCAST_MID_LAYER_MAX_BITRATE,
        Math.round(safeMaxBitrate * SIMULCAST_MID_LAYER_BITRATE_RATIO)
      ),
      maxFramerate: SIMULCAST_MID_LAYER_MAX_FRAMERATE,
      scaleResolutionDownBy: SIMULCAST_MID_LAYER_SCALE
    },
    {
      maxBitrate: safeMaxBitrate,
      scaleResolutionDownBy: SIMULCAST_HIGH_LAYER_SCALE
    }
  ];
};

const getScreenShareSimulcastEncodings = (
  maxBitrate: number
): RTCRtpEncodingParameters[] => {
  const safeMaxBitrate = Math.max(SIMULCAST_MIN_MAX_BITRATE, maxBitrate);

  return [
    {
      maxBitrate: Math.min(
        SIMULCAST_SCREEN_LOW_LAYER_MAX_BITRATE,
        Math.round(safeMaxBitrate * SIMULCAST_SCREEN_LOW_LAYER_BITRATE_RATIO)
      ),
      maxFramerate: SIMULCAST_SCREEN_LOW_LAYER_MAX_FRAMERATE,
      scaleResolutionDownBy: SIMULCAST_LOW_LAYER_SCALE
    },
    {
      maxBitrate: Math.min(
        SIMULCAST_SCREEN_MID_LAYER_MAX_BITRATE,
        Math.round(safeMaxBitrate * SIMULCAST_SCREEN_MID_LAYER_BITRATE_RATIO)
      ),
      maxFramerate: SIMULCAST_SCREEN_MID_LAYER_MAX_FRAMERATE,
      scaleResolutionDownBy: SIMULCAST_MID_LAYER_SCALE
    },
    {
      maxBitrate: safeMaxBitrate,
      scaleResolutionDownBy: SIMULCAST_HIGH_LAYER_SCALE
    }
  ];
};

const getSimulcastQualityLayers = (
  encodings: RTCRtpEncodingParameters[]
): TStreamQualityLayer[] => {
  return encodings.map((_, index) => {
    return {
      spatialLayer: index,
      label:
        index === 0 ? 'Low' : index === encodings.length - 1 ? 'High' : 'Medium'
    };
  });
};

const EXTERNAL_STREAM_KINDS: StreamKind[] = [
  StreamKind.EXTERNAL_AUDIO,
  StreamKind.EXTERNAL_VIDEO
];

const isOwnProducerEvent = (
  remoteId: number,
  ownUserId: number | undefined,
  kind: StreamKind
): boolean => {
  if (EXTERNAL_STREAM_KINDS.includes(kind)) return false;

  return ownUserId !== undefined && remoteId === ownUserId;
};

const getSimulcastCodec = (
  rtpCapabilities: RtpCapabilities | null
): RtpCodecCapability | undefined =>
  rtpCapabilities?.codecs?.find(
    (c) => c.mimeType.toLowerCase() === VideoCodec.VP8.toLowerCase()
  );

type TDisplayMediaInputs = {
  source: TScreenShareSource;
  shareAudio: boolean;
  resolution: Resolution;
  framerate: number;
  cursor: ScreenCursor;
  restrictOwnAudio: boolean;
  suppressLocalAudioPlayback: boolean;
};

const DISPLAY_SURFACE_BY_SOURCE = {
  tab: 'browser',
  window: 'window',
  screen: 'monitor'
} as const;

// a tab carries only its own audio, so it can never loop the call back.
// window and screen captures ride on the system mix instead, which is where
// the echo comes from, hence they go video-only unless audio is asked for
const buildDisplayMediaConstraints = (
  inputs: TDisplayMediaInputs
): MediaStreamConstraints => {
  const video: MediaTrackConstraints = {
    ...getResWidthHeight(inputs.resolution),
    frameRate: inputs.framerate,
    // @ts-expect-error - display capture only, not in MediaTrackConstraints
    cursor: inputs.cursor,
    displaySurface: DISPLAY_SURFACE_BY_SOURCE[inputs.source]
  };

  if (!inputs.shareAudio) {
    return { video, audio: false };
  }

  const audio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    sampleRate: 48000,
    // @ts-expect-error - experimental, not in types yet
    suppressLocalAudioPlayback: inputs.suppressLocalAudioPlayback || undefined,
    restrictOwnAudio: inputs.restrictOwnAudio || undefined
  };

  return { video, audio };
};

const withoutDisplaySurface = (
  constraints: MediaStreamConstraints
): MediaStreamConstraints => {
  if (
    typeof constraints.video !== 'object' ||
    constraints.video === null ||
    !('displaySurface' in constraints.video)
  ) {
    return constraints;
  }

  const { displaySurface: _dropped, ...video } = constraints.video as Record<
    string,
    unknown
  >;

  return { ...constraints, video };
};

// older capture backends reject the surface hint outright, so fall back
// to an unconstrained pick rather than failing the share
const requestDisplayMedia = async (
  constraints: MediaStreamConstraints
): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getDisplayMedia(constraints);
  } catch (error) {
    const name =
      error instanceof Error
        ? error.name
        : (error as { name?: unknown } | null)?.name;

    if (name !== 'OverconstrainedError') throw error;

    return navigator.mediaDevices.getDisplayMedia(
      withoutDisplaySurface(constraints)
    );
  }
};

export {
  buildDisplayMediaConstraints,
  getRemoteConsumerTypeKey,
  getScreenShareSimulcastEncodings,
  getSimulcastCodec,
  getSimulcastEncodings,
  getSimulcastQualityLayers,
  getStoredStreamQuality,
  getStreamQualityDropdownValue,
  getStreamQualityStorageKey,
  isOwnProducerEvent,
  loadStreamQualitiesFromStorage,
  normalizeStreamQuality,
  parseStreamQualityDropdownValue,
  requestDisplayMedia,
  saveStreamQualitiesToStorage
};

export type {
  TDisplayMediaInputs,
  TRemoteConsumerTypes,
  TRemoteQualityLayers,
  TStreamQualitySettings
};
