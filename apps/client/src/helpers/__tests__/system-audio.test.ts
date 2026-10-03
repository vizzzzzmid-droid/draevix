import { describe, expect, test } from 'bun:test';
import {
  isSystemAudioCaptureSupported,
  isValidAudioChunk,
  restartDelayMs
} from '../system-audio';

describe('system audio capture support', () => {
  test('should require the tauri runtime', () => {
    expect(
      isSystemAudioCaptureSupported(false, 'Windows NT 10.0; Win64; x64')
    ).toBe(false);
  });

  test('should only activate on windows desktops', () => {
    expect(
      isSystemAudioCaptureSupported(true, 'Windows NT 10.0; Win64; x64')
    ).toBe(true);

    expect(
      isSystemAudioCaptureSupported(true, 'Macintosh; Intel Mac OS X 10_15_7')
    ).toBe(false);

    expect(isSystemAudioCaptureSupported(true, 'X11; Linux x86_64')).toBe(
      false
    );
  });
});

describe('system audio chunks', () => {
  test('should accept stereo frame buffers', () => {
    expect(
      isValidAudioChunk({
        samples: [0.1, -0.1],
        framesLost: 0,
        deviceChanged: false
      })
    ).toBe(true);

    expect(
      isValidAudioChunk({ samples: [], framesLost: 12, deviceChanged: true })
    ).toBe(true);
  });

  test('should reject malformed payloads', () => {
    expect(isValidAudioChunk(null)).toBe(false);
    expect(isValidAudioChunk({})).toBe(false);
    expect(
      isValidAudioChunk({ samples: [0.1], framesLost: 0, deviceChanged: false })
    ).toBe(false);
    expect(
      isValidAudioChunk({
        samples: 'nope',
        framesLost: 0,
        deviceChanged: false
      })
    ).toBe(false);
  });
});

describe('system audio restart backoff', () => {
  test('should back off exponentially with a cap', () => {
    expect(restartDelayMs(0)).toBe(1000);
    expect(restartDelayMs(1)).toBe(2000);
    expect(restartDelayMs(2)).toBe(4000);
    expect(restartDelayMs(10)).toBe(8000);
  });
});
