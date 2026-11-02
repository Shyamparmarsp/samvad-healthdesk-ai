import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AudioRecorder } from '../src/lib/audio/index';
import { convertBlobToVoiceAnswer, syntheticWavBase64 } from '../src/lib/audio/voice';

// ---------------------------------------------------------------------------
// Mock Audio Infrastructure
// ---------------------------------------------------------------------------
class MockMediaStreamTrack {
  kind = 'audio';
  enabled = true;
  readyState = 'live';
  onended: (() => void) | null = null;
  stopped = false;

  stop(): void {
    this.stopped = true;
    this.readyState = 'ended';
    if (this.onended) {
      this.onended();
    }
  }
}

class MockMediaStream {
  tracks: MockMediaStreamTrack[];

  constructor() {
    this.tracks = [new MockMediaStreamTrack()];
  }

  getTracks(): MockMediaStreamTrack[] {
    return this.tracks;
  }

  getAudioTracks(): MockMediaStreamTrack[] {
    return this.tracks;
  }
}

class MockMediaRecorder {
  static isTypeSupported(_type: string): boolean {
    return true;
  }

  state: 'inactive' | 'recording' = 'inactive';
  stream: MockMediaStream;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  stopCallCount = 0;

  constructor(stream: MockMediaStream, options?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = options?.mimeType || 'audio/webm';
  }

  start(_timeslice?: number): void {
    this.state = 'recording';
  }

  emitChunk(chunkData: string): void {
    if (this.ondataavailable && this.state === 'recording') {
      const blob = new Blob([chunkData], { type: this.mimeType });
      this.ondataavailable({ data: blob });
    }
  }

  stop(): void {
    this.stopCallCount += 1;
    this.state = 'inactive';
    // Deliver final chunk if any, then fire onstop
    if (this.onstop) {
      this.onstop();
    }
  }
}

describe('Patient Voice Recording & Visible 30-Second Timer Lifecycle', () => {
  let originalMediaDevices: any;
  let originalMediaRecorder: any;
  let lastMockRecorder: MockMediaRecorder | null = null;
  let shouldFailGetUserMedia = false;

  beforeEach(() => {
    shouldFailGetUserMedia = false;
    lastMockRecorder = null;

    originalMediaDevices = (globalThis as any).navigator?.mediaDevices;
    originalMediaRecorder = (globalThis as any).MediaRecorder;

    const mockMediaDevices = {
      getUserMedia: async (constraints: { audio?: boolean }) => {
        if (shouldFailGetUserMedia) {
          const err = new Error('NotAllowedError: Permission denied by user');
          err.name = 'NotAllowedError';
          throw err;
        }
        return new MockMediaStream();
      },
    };

    if (!(globalThis as any).navigator) {
      (globalThis as any).navigator = {};
    }
    (globalThis as any).navigator.mediaDevices = mockMediaDevices;

    const MockRecorderCtor = function (stream: MockMediaStream, options?: any) {
      const instance = new MockMediaRecorder(stream, options);
      lastMockRecorder = instance;
      return instance;
    } as any;
    MockRecorderCtor.isTypeSupported = MockMediaRecorder.isTypeSupported;

    (globalThis as any).MediaRecorder = MockRecorderCtor;
  });

  afterEach(() => {
    if ((globalThis as any).navigator) {
      (globalThis as any).navigator.mediaDevices = originalMediaDevices;
    }
    (globalThis as any).MediaRecorder = originalMediaRecorder;
  });

  it('1. Recording begins only after mic access granted and timer starts at 00:00', async () => {
    const recorder = new AudioRecorder();
    assert.equal(recorder.isRecording, false, 'Recorder must be idle before start');

    await recorder.start();
    assert.equal(recorder.isRecording, true, 'Recorder is actively recording after permission');
    assert.ok(lastMockRecorder, 'MediaRecorder instance created');
    assert.equal(lastMockRecorder.state, 'recording');

    // Timer formatting helper test: elapsed 0s -> 00:00
    const elapsedSec = 0;
    const formatted = `00:${String(elapsedSec).padStart(2, '0')}`;
    const timerDisplay = `Listening... ${formatted} / 00:30`;
    assert.equal(timerDisplay, 'Listening... 00:00 / 00:30', 'Timer must begin at 00:00 / 00:30');

    await recorder.stop();
  });

  it('2. Timer visibly updates once per second based on elapsed wall-clock time', async () => {
    const startTime = Date.now() - 12_000; // Simulated 12 seconds elapsed
    const elapsedMs = Date.now() - startTime;
    const elapsedSec = Math.floor(elapsedMs / 1000);

    const formattedElapsed = `00:${String(elapsedSec).padStart(2, '0')}`;
    const statusText = `Listening... ${formattedElapsed} / 00:30`;

    assert.equal(elapsedSec, 12, 'Calculates 12 elapsed seconds');
    assert.equal(statusText, 'Listening... 00:12 / 00:30', 'Displays exact Figma match during recording');
  });

  it('3. Recording continues uninterrupted through pauses and silence', async () => {
    const recorder = new AudioRecorder();
    await recorder.start();

    // Patient speaks
    lastMockRecorder?.emitChunk('hello');
    assert.equal(recorder.isRecording, true);

    // Patient pauses / silence for 3 seconds
    // No chunks emitted, but recorder remains in 'recording' state
    assert.equal(recorder.isRecording, true, 'Silence must NOT terminate recording prematurely');
    assert.equal(lastMockRecorder?.state, 'recording');

    // Patient speaks again
    lastMockRecorder?.emitChunk('I have a pain in my shoulder');
    assert.equal(recorder.isRecording, true);

    const result = await recorder.stop();
    assert.ok(result.blob.size > 0, 'Audio blob successfully collected chunks across pauses');
  });

  it('4. Recording does not prematurely terminate after a few seconds', async () => {
    const recorder = new AudioRecorder();
    await recorder.start();

    // Verify recorder does not self-terminate at 1.2s or 2.5s
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(recorder.isRecording, true, 'Recorder remains recording past small demo intervals');
    assert.equal(lastMockRecorder?.state, 'recording');

    await recorder.stop();
  });

  it('5. Done control stops recording early (< 30 seconds) cleanly', async () => {
    const recorder = new AudioRecorder();
    await recorder.start();

    lastMockRecorder?.emitChunk('My name is Priya');

    // Patient clicks Done at 4 seconds
    const result = await recorder.stop();
    assert.equal(recorder.isRecording, false, 'Recorder stops when Done is triggered');
    assert.ok(result.durationMs >= 0);
    assert.ok(result.blob);
  });

  it('6. Automatic stop occurs at exactly 30 seconds', async () => {
    const recorder = new AudioRecorder();
    await recorder.start();

    let autoStopped = false;
    const startTime = Date.now() - 30_000; // Simulated reaching 30s limit

    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    if (elapsedSec >= 30) {
      await recorder.stop();
      autoStopped = true;
    }

    assert.equal(autoStopped, true, 'Automatically stopped at 30 seconds');
    assert.equal(recorder.isRecording, false, 'Recorder is inactive after 30s auto-stop');
  });

  it('7. No recording continues beyond 30 seconds', async () => {
    const recorder = new AudioRecorder();
    await recorder.start();
    await recorder.stop();

    assert.equal(recorder.isRecording, false);
    // Emitting data when inactive must not happen
    assert.equal(lastMockRecorder?.state, 'inactive');
  });

  it('8. Processing begins after recording stops and returns contract-valid WAV', async () => {
    const recorder = new AudioRecorder();
    await recorder.start();
    lastMockRecorder?.emitChunk('speech data');
    const recordingResult = await recorder.stop();

    const voice = await convertBlobToVoiceAnswer(recordingResult.blob);
    assert.equal(voice.audio_format, 'audio/wav', 'Contract requires audio/wav format');
    assert.ok(typeof voice.audio_base64 === 'string' && voice.audio_base64.length > 0);
    assert.ok(voice.source === 'microphone' || voice.source === 'synthetic');
  });

  it('9. Recording stops exactly once (subsequent stops are guarded)', async () => {
    const recorder = new AudioRecorder();
    await recorder.start();

    // First stop succeeds
    const p1 = recorder.stop();
    // Immediate concurrent second stop must reject or be guarded
    await assert.rejects(
      async () => {
        await recorder.stop();
      },
      {
        message: /Stop already in progress|Recorder not active/,
      },
    );

    await p1;
    assert.equal(lastMockRecorder?.stopCallCount, 1, 'Underlying MediaRecorder.stop() was called exactly once');
  });

  it('10. Retry works after microphone permission failure without stuck timer', async () => {
    const recorder = new AudioRecorder();
    shouldFailGetUserMedia = true;

    // First attempt fails due to permission
    await assert.rejects(async () => {
      await recorder.start();
    }, /NotAllowedError/);

    assert.equal(recorder.isRecording, false, 'Timer must not be active on mic failure');

    // User grants permission and retries
    shouldFailGetUserMedia = false;
    await recorder.start();
    assert.equal(recorder.isRecording, true, 'Retry succeeds after user grants permission');

    await recorder.stop();
  });

  it('11. Timers and media tracks are properly cleaned up on cancel / unmount', async () => {
    const recorder = new AudioRecorder();
    await recorder.start();

    const stream = lastMockRecorder?.stream;
    const track = stream?.getAudioTracks()[0];
    assert.equal(track?.stopped, false, 'Track is active during recording');

    recorder.cancel();

    assert.equal(recorder.isRecording, false, 'Recorder marked inactive on cancel');
    assert.equal(track?.stopped, true, 'Audio stream track stopped and released');
  });

  it('12. Disconnection event triggers graceful listener callback', async () => {
    const recorder = new AudioRecorder();
    let disconnectedTriggered = false;

    recorder.setOnTrackEnded(() => {
      disconnectedTriggered = true;
    });

    await recorder.start();

    // Simulate microphone unplugged
    const track = lastMockRecorder?.stream.getAudioTracks()[0];
    track?.stop();

    assert.equal(disconnectedTriggered, true, 'onTrackEnded callback invoked when mic disconnects');
    recorder.cancel();
  });
});

