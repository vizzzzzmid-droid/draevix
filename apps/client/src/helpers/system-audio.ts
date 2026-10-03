import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './get-file-url';

// Everything the native side produces: 48 kHz interleaved stereo f32.
// Resampling and channel conversion happen in Rust, so the browser always
// sees this exact format and the worklet below stays trivial.
export const SYSTEM_AUDIO_SAMPLE_RATE = 48000;
export const SYSTEM_AUDIO_CHANNELS = 2;

const POLL_INTERVAL_MS = 250;
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_BASE_DELAY_MS = 1000;
const RESTART_MAX_DELAY_MS = 8000;

type TSystemAudioInfo = {
  sampleRate: number;
  channels: number;
};

type TSystemAudioChunk = {
  samples: number[];
  framesLost: number;
  deviceChanged: boolean;
  queuedMs?: number;
  clipped?: number;
};

export type TSystemAudioHandle = {
  track: MediaStreamTrack;
  stop: () => void;
};

export type TSystemAudioInterruptReason = 'device-changed' | 'unavailable';

// Native loopback capture only exists in the Windows desktop build. The
// browser keeps using getDisplayMedia audio exactly as before.
const isSystemAudioCaptureSupported = (
  tauri: boolean = isTauri(),
  userAgent: string = navigator.userAgent
): boolean => {
  if (!tauri) return false;

  return /windows/i.test(userAgent);
};

const isValidAudioChunk = (chunk: unknown): chunk is TSystemAudioChunk => {
  if (!chunk || typeof chunk !== 'object') return false;

  const { samples, framesLost, deviceChanged } =
    chunk as Partial<TSystemAudioChunk>;

  return (
    Array.isArray(samples) &&
    samples.length % 2 === 0 &&
    typeof framesLost === 'number' &&
    typeof deviceChanged === 'boolean'
  );
};

const restartDelayMs = (attempt: number): number =>
  Math.min(RESTART_BASE_DELAY_MS * 2 ** attempt, RESTART_MAX_DELAY_MS);

// Queues polled f32 frames and renders them gaplessly; underruns play
// silence, overruns drop the oldest queued audio (same policy as Rust).
const WORKLET_PROCESSOR = `
class DraevixSystemAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.current = null;
    this.offset = 0;
    this.port.onmessage = (event) => {
      const chunk = event.data;
      if (!chunk || chunk.length === 0) return;
      this.queue.push(chunk);
      let total = 0;
      for (const queued of this.queue) total += queued.length;
      while (total > 48000 * 2 * 2 && this.queue.length > 1) {
        const dropped = this.queue.shift();
        total -= dropped.length;
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];
    let written = 0;
    while (written < left.length) {
      if (!this.current || this.offset >= this.current.length) {
        this.current = this.queue.length > 0 ? this.queue.shift() : null;
        this.offset = 0;
        if (!this.current) {
          left.fill(0, written);
          if (right !== left) right.fill(0, written);
          break;
        }
      }
      const pairs = Math.min(
        left.length - written,
        (this.current.length - this.offset) >> 1
      );
      for (let i = 0; i < pairs; i++) {
        left[written] = this.current[this.offset++];
        right[written] = this.current[this.offset++];
        written++;
      }
    }
    return true;
  }
}
registerProcessor('draevix-system-audio', DraevixSystemAudioProcessor);
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const startSystemAudioTrack = async (options: {
  onInterrupted: (reason: TSystemAudioInterruptReason) => void;
}): Promise<TSystemAudioHandle> => {
  const info = await invoke<TSystemAudioInfo>('system_audio_start');

  if (
    info.sampleRate !== SYSTEM_AUDIO_SAMPLE_RATE ||
    info.channels !== SYSTEM_AUDIO_CHANNELS
  ) {
    await invoke('system_audio_stop').catch(() => undefined);
    throw new Error('unsupported native system audio format');
  }

  const context = new AudioContext({
    sampleRate: SYSTEM_AUDIO_SAMPLE_RATE,
    latencyHint: 'playback'
  });

  await context.audioWorklet.addModule(
    URL.createObjectURL(
      new Blob([WORKLET_PROCESSOR], { type: 'application/javascript' })
    )
  );

  const node = new AudioWorkletNode(context, 'draevix-system-audio', {
    outputChannelCount: [2]
  });
  const destination = context.createMediaStreamDestination();

  node.connect(destination);

  const track = destination.stream.getAudioTracks()[0];

  if (!track) {
    node.disconnect();
    await context.close();
    await invoke('system_audio_stop').catch(() => undefined);
    throw new Error('system audio destination has no track');
  }

  let stopped = false;
  let polling = false;
  let restarts = 0;
  let lastQueueWarnMs = 0;

  // diagnostics snapshot for the F9 voice panel: mix format plus the
  // captured process list, re-read every 5s and logged only on change so
  // the movie (apps coming/going) is visible. Dynamic import keeps unit
  // tests green (browser-logger pulls voice-debug, which touches window
  // at load).
  let lastCaptureKey = '';
  const logCaptureInfo = () => {
    if (stopped) return;

    void invoke<{
      format: string;
      captures: { pid: number; exe: string }[];
    }>('system_audio_info')
      .then((info) => {
        const key = JSON.stringify(info);

        if (key === lastCaptureKey) return;
        lastCaptureKey = key;

        return import('./browser-logger').then(({ logVoice }) =>
          logVoice('system audio: capture info', {
            format: info.format,
            captures: info.captures.map((c) => `${c.exe}(${c.pid})`)
          })
        );
      })
      .catch(() => undefined);
  };

  logCaptureInfo();
  const infoTimer = window.setInterval(logCaptureInfo, 5000);

  const doStop = () => {
    if (stopped) return;
    stopped = true;

    window.clearInterval(timer);
    window.clearInterval(infoTimer);
    node.disconnect();
    track.stop();
    void context.close();
    invoke('system_audio_stop').catch(() => undefined);
  };

  const handleFailure = async (
    reason: TSystemAudioInterruptReason
  ): Promise<void> => {
    if (stopped) return;

    if (restarts >= MAX_RESTART_ATTEMPTS) {
      doStop();
      options.onInterrupted(reason);
      return;
    }

    restarts += 1;
    await sleep(restartDelayMs(restarts));

    if (stopped) return;

    try {
      await invoke('system_audio_start');
    } catch {
      doStop();
      options.onInterrupted('unavailable');
    }
  };

  const timer = window.setInterval(() => {
    if (stopped || polling) return;
    polling = true;

    invoke<TSystemAudioChunk>('system_audio_poll')
      .then((chunk) => {
        if (!isValidAudioChunk(chunk)) return;

        if (chunk.deviceChanged) {
          void handleFailure('device-changed');
          return;
        }

        restarts = 0;

        // delivery telemetry: a growing native queue or dropped frames means
        // the pump outruns the poller (or stalls mid-open) and the worklet
        // is about to starve — audible as stutter. Throttled so healthy
        // streams stay quiet.
        const queuedMs = chunk.queuedMs ?? 0;
        const clipped = chunk.clipped ?? 0;
        const nowMs = Date.now();

        if (
          (chunk.framesLost > 0 || queuedMs > 800 || clipped > 0) &&
          nowMs - lastQueueWarnMs > 5000
        ) {
          lastQueueWarnMs = nowMs;

          // dynamic import: browser-logger pulls voice-debug, which touches
          // window at module load and would break unit tests otherwise.
          void import('./browser-logger')
            .then(({ logVoiceWarn }) =>
              logVoiceWarn('system audio: delivery gap', {
                framesLost: chunk.framesLost,
                queuedMs,
                clipped
              })
            )
            .catch(() => undefined);
        }

        if (chunk.samples.length === 0) return;

        const buffer = new Float32Array(chunk.samples);

        node.port.postMessage(buffer, [buffer.buffer]);
      })
      .catch(() => {
        void handleFailure('unavailable');
      })
      .finally(() => {
        polling = false;
      });
  }, POLL_INTERVAL_MS);

  return { track, stop: doStop };
};

export {
  isSystemAudioCaptureSupported,
  isValidAudioChunk,
  restartDelayMs,
  startSystemAudioTrack
};
