import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioPlayback, type AudioElementLike } from '../src/lib/audio/playback';
import { planAssistantSpeech } from '../src/lib/audio/assistant-speech';
import { isSilentPlaceholderSource, cachedPromptSources } from '../src/lib/audio/prompt-audio';

/** A fake <audio> element: play() resolves and the test decides when it "ends". */
class FakeAudio implements AudioElementLike {
  src = '';
  muted = false;
  volume = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playCalls = 0;
  pauseCalls = 0;
  playMode: 'ok' | 'blocked' | 'error' = 'ok';

  async play(): Promise<void> {
    this.playCalls += 1;
    if (this.playMode === 'blocked') {
      const error = new Error('play blocked');
      error.name = 'NotAllowedError';
      throw error;
    }
    if (this.playMode === 'error') throw new Error('decode failed');
  }

  pause(): void {
    this.pauseCalls += 1;
  }
}

describe('Assistant speech channel', () => {
  it('1. fixed prompts use the committed recording and never the provider', () => {
    for (const id of ['greeting', 'name', 'age', 'gender', 'primary_concern']) {
      const plan = planAssistantSpeech(id, 'en');
      assert.equal(plan.kind, 'cached', `${id} is cached`);
      if (plan.kind === 'cached') {
        assert.deepEqual(plan.sources, [`/audio/en/${id === 'name' ? 'ask-name' : id === 'age' ? 'ask-age' : id === 'gender' ? 'ask-gender' : id === 'primary_concern' ? 'ask-primary-concern' : 'greeting'}.mp3`]);
      }
    }
    const hindi = planAssistantSpeech('name', 'hi');
    assert.equal(hindi.kind, 'cached');
    if (hindi.kind === 'cached') assert.deepEqual(hindi.sources, ['/audio/hi/ask-name.mp3']);
  });

  it('2. adaptive questions go to Timbre, unknown ids stay text-only', () => {
    assert.equal(planAssistantSpeech('duration', 'en').kind, 'tts');
    assert.equal(planAssistantSpeech('GM-001', 'hi').kind, 'tts');
    assert.equal(planAssistantSpeech('emergency_clarification', 'en').kind, 'text_only');
    assert.equal(planAssistantSpeech(undefined, 'en').kind, 'text_only');
  });

  it('3. the silent placeholder files are never offered as speech', () => {
    assert.equal(isSilentPlaceholderSource('/audio/greeting_en.wav'), true);
    assert.equal(isSilentPlaceholderSource('/audio/ask-name_hi.wav'), true);
    assert.equal(isSilentPlaceholderSource('/audio/en/greeting.mp3'), false);
    const sources = cachedPromptSources('en', 'greeting');
    assert.deepEqual(sources, ['/audio/en/greeting.mp3']);
    assert.equal(sources.some((src) => src.endsWith('.wav')), false, 'no placeholder fallback');
  });
});


describe('Audio playback channel — unlock race', () => {
  it('8. a real utterance that starts during unlock() is not paused by the unlock cleanup', async () => {
    let releaseUnlock: (() => void) | null = null;
    let pauseCount = 0;

    class SlowUnlockAudio extends FakeAudio {
      override async play(): Promise<void> {
        this.playCalls += 1;
        if (this.src.startsWith('data:')) {
          await new Promise<void>((resolve) => {
            releaseUnlock = resolve;
          });
          return;
        }
      }
      override pause(): void {
        pauseCount += 1;
      }
    }

    const element = new SlowUnlockAudio();
    const playback = createAudioPlayback({ createAudio: () => element });

    const unlocking = playback.unlock();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The assistant starts the real prompt while the silent unlock clip is still pending.
    const playing = playback.play('/audio/hi/ask-name.mp3');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(element.src, '/audio/hi/ask-name.mp3', 'prompt loaded');

    element.onended?.();
    assert.deepEqual(await playing, { ok: true }, 'prompt reported as played');

    const pauseAfterPlay = pauseCount;
    releaseUnlock?.();
    await unlocking;

    assert.equal(pauseCount, pauseAfterPlay, 'unlock cleanup does not pause the prompt');
    assert.equal(element.src, '/audio/hi/ask-name.mp3', 'unlock cleanup keeps the prompt source');
  });
});

describe('Audio playback channel', () => {
  it('4. unlock() and play() reuse one element so the gesture permission survives', async () => {
    const elements: FakeAudio[] = [];
    const playback = createAudioPlayback({
      createAudio: () => {
        const element = new FakeAudio();
        elements.push(element);
        return element;
      },
    });

    await playback.unlock();
    assert.equal(elements.length, 1, 'one element created');

    const pending = playback.play('/audio/en/ask-name.mp3');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(elements.length, 1, 'same element reused for playback');
    assert.equal(elements[0].src, '/audio/en/ask-name.mp3');
    elements[0].onended?.();
    assert.deepEqual(await pending, { ok: true });
  });

  it('5. play() resolves only when playback actually ends', async () => {
    const elements: FakeAudio[] = [];
    const playback = createAudioPlayback({
      createAudio: () => {
        const element = new FakeAudio();
        elements.push(element);
        return element;
      },
    });

    let settled = false;
    const pending = playback.play('/audio/hi/greeting.mp3').then((result) => {
      settled = true;
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(settled, false, 'not resolved while audio is still playing');
    elements[0].onended?.();
    assert.deepEqual(await pending, { ok: true });
  });

  it('6. a missing or blocked source is reported, never faked as success', async () => {
    const element = new FakeAudio();
    const playback = createAudioPlayback({ createAudio: () => element });

    assert.deepEqual(await playback.play(''), { ok: false, reason: 'missing' });

    element.playMode = 'blocked';
    assert.deepEqual(await playback.play('/audio/en/ask-age.mp3'), { ok: false, reason: 'blocked' });

    element.playMode = 'error';
    assert.deepEqual(await playback.play('/audio/en/ask-age.mp3'), { ok: false, reason: 'error' });

    const decode = createAudioPlayback({ createAudio: () => element });
    const pending = decode.play('/audio/en/ask-age.mp3');
    await new Promise((resolve) => setTimeout(resolve, 0));
    element.onerror?.();
    assert.deepEqual(await pending, { ok: false, reason: 'error' });
  });

  it('7. stop() cancels the pending playback promise outcome', async () => {
    const element = new FakeAudio();
    const playback = createAudioPlayback({ createAudio: () => element });

    const pending = playback.play('/audio/en/greeting.mp3');
    await new Promise((resolve) => setTimeout(resolve, 0));
    playback.stop();
    element.onended?.();

    const result = await pending;
    assert.equal(result.ok, false, 'a stopped playback is not reported as played');
    assert.equal(element.pauseCalls > 0, true, 'element paused');
    assert.equal(playback.isPlaying, false);
  });
});
