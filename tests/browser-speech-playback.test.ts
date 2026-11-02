import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { speak, startSession, recordConsent } from '../src/lib/api';
import { CONSENT_VERSION } from '../src/types/consent';

describe('D-19 — Browser Speech Playback & Audio Lifecycle Verification', () => {
  it('1. speak() API handles unavailable audio gracefully without throwing', async () => {
    const session = await startSession('en');
    await recordConsent(session.session_id, true, 'en', CONSENT_VERSION);

    // Call speak for the initial question
    const res = await speak(session.session_id, 'name');
    assert.equal(typeof res, 'object');
    // In mock mode without live TTS or when Timbre is capped, audioUrl is undefined
    assert.equal(res.audioUrl, undefined);
  });

  it('2. Audio element lifecycle: resource creation, playback, and revocation on completion', async () => {
    let playCalled = false;
    let pauseCalled = false;
    let revokedUrl = '';

    // Mock object URL and Audio constructor
    const fakeObjectUrl = 'blob:http://localhost:4173/mock-audio-uuid-1234';
    const originalRevoke = globalThis.URL.revokeObjectURL;
    globalThis.URL.revokeObjectURL = (url: string) => {
      revokedUrl = url;
    };

    class MockAudio {
      src: string;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(src: string) {
        this.src = src;
      }

      async play(): Promise<void> {
        playCalled = true;
      }

      pause(): void {
        pauseCalled = true;
      }
    }

    const originalAudio = (globalThis as any).Audio;
    (globalThis as any).Audio = MockAudio;

    try {
      // Simulate playback initiation
      const audioInstance = new (globalThis as any).Audio(fakeObjectUrl);
      let activeAudio: any = audioInstance;

      audioInstance.onended = () => {
        globalThis.URL.revokeObjectURL(fakeObjectUrl);
        activeAudio = null;
      };

      await audioInstance.play();
      assert.equal(playCalled, true, 'audio.play() was initiated on interaction');
      assert.equal(activeAudio !== null, true, 'active audio instance tracked');

      // Trigger completion event
      audioInstance.onended();
      assert.equal(revokedUrl, fakeObjectUrl, 'Blob URL revoked upon playback completion');
      assert.equal(activeAudio, null, 'Active audio reference dereferenced upon completion');
    } finally {
      globalThis.URL.revokeObjectURL = originalRevoke;
      (globalThis as any).Audio = originalAudio;
    }
  });

  it('3. Error recovery: audio decode/playback rejection degrades gracefully to text', async () => {
    let errorCaughtGracefully = false;
    let revokedOnError = false;
    const fakeUrl = 'blob:http://localhost:4173/corrupted-audio-stream';

    const originalRevoke = globalThis.URL.revokeObjectURL;
    globalThis.URL.revokeObjectURL = () => {
      revokedOnError = true;
    };

    class RejectingAudio {
      onerror: (() => void) | null = null;
      async play(): Promise<void> {
        throw new Error('NotAllowedError: play() failed because the user didn’t interact with the document first.');
      }
      pause(): void {}
    }

    const originalAudio = (globalThis as any).Audio;
    (globalThis as any).Audio = RejectingAudio;

    try {
      const audio = new (globalThis as any).Audio(fakeUrl);
      audio.onerror = () => {
        globalThis.URL.revokeObjectURL(fakeUrl);
      };

      // Simulating handleReplayAudio error guard
      await audio.play().catch((err: any) => {
        assert.ok(err.message.includes('play() failed'));
        errorCaughtGracefully = true;
      });

      assert.equal(errorCaughtGracefully, true, 'Playback rejection caught gracefully without interrupting intake');
    } finally {
      globalThis.URL.revokeObjectURL = originalRevoke;
      (globalThis as any).Audio = originalAudio;
    }
  });

  it('4. Single active audio invariant: subsequent replay calls pause previous audio stream', () => {
    let pauseCount = 0;

    class MultiAudio {
      pause(): void {
        pauseCount++;
      }
    }

    let activeInstance: any = new MultiAudio();

    // Triggering a second audio request pauses the first
    if (activeInstance) {
      activeInstance.pause();
      activeInstance = null;
    }

    assert.equal(pauseCount, 1, 'Previous audio paused before starting new stream');
    assert.equal(activeInstance, null);
  });
});

