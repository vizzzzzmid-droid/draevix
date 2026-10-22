import { denoiseStream } from '@lofcz/deepfilternet-web';

import { isAudioWorkletSupported } from './create-worklet-loader';

type TDeepFilterNetChain = {
  outputTrack: MediaStreamTrack;
  contexts: AudioContext[];
};

const createDeepFilterNetChain = async (
  inputStream: MediaStream
): Promise<TDeepFilterNetChain> => {
  if (!isAudioWorkletSupported()) {
    throw new Error('AudioWorklet is not supported in this browser');
  }

  const denoised = await denoiseStream(inputStream);

  try {
    if (denoised.context.state === 'suspended') {
      await denoised.context.resume();
    }

    const outputTrack = denoised.stream.getAudioTracks()[0];

    if (!outputTrack) {
      throw new Error('DeepFilterNet chain produced no output track');
    }

    return { outputTrack, contexts: [denoised.context] };
  } catch (error) {
    denoised.destroy();
    await denoised.context.close();
    throw error;
  }
};

export { createDeepFilterNetChain };
