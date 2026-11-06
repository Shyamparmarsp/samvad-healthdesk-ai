/**
 * One assistant voice for the whole doctor application.
 *
 * The controller is the only owner of playback, the active object URL and the in-flight
 * speech request. These tests pin the exclusivity rules: a new claim always supersedes the
 * previous one, a stale claim can never start audio, and stopping keeps the last audio for
 * a replay while releasing drops it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AssistantAudioController } from '../src/lib/audio/assistant-audio';
import type { AudioPlayback, PlaybackResult } from '../src/lib/audio/playback';

class FakePlayback implements AudioPlayback {
  isPlaying = false;
  isUnlocked = false;
  played: string[] = [];
  stops = 0;
  unlocks = 0;

  async unlock(): Promise<void> {
    this.unlocks += 1;
    this.isUnlocked = true;
  }

  async play(url: string, options: { onStart?: () => void } = {}): Promise<PlaybackResult> {
    if (!url) return { ok: false, reason: 'missing' };
    this.played.push(url);
    this.isPlaying = true;
    options.onStart?.();
    return { ok: true };
  }

  stop(): void {
    this.stops += 1;
    this.isPlaying = false;
  }
}

function withObjectUrls() {
  const revoked: string[] = [];
  const created: string[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  // @ts-expect-error Node's URL has no object-URL helpers.
  URL.createObjectURL = (blob: unknown) => {
    const url = `blob:test/${created.length}-${String((blob as { size?: number })?.size ?? 0)}`;
    created.push(url);
    return url;
  };
  // @ts-expect-error Node's URL has no object-URL helpers.
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  return {
    created,
    revoked,
    restore() {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    },
  };
}

describe('Global assistant audio controller', () => {
  it('1. a new claim supersedes the previous one and aborts its request', async () => {
    const fake = new FakePlayback();
    const controller = new AssistantAudioController(() => fake);

    const first = controller.claim('dashboard');
    assert.equal(controller.isCurrent(first), true);
    assert.equal(first.signal.aborted, false);

    const second = controller.claim('reports');
    assert.equal(controller.isCurrent(first), false, 'the old lease is stale');
    assert.equal(first.signal.aborted, true, 'the old speech request is aborted');
    assert.equal(controller.isCurrent(second), true);
    assert.ok(fake.stops >= 1, 'playback was stopped when the channel changed hands');
  });

  it('2. a stale claim can never start audio, and its object URL is revoked', async () => {
    const fake = new FakePlayback();
    const urls = withObjectUrls();
    const controller = new AssistantAudioController(() => fake);
    try {
      const first = controller.claim('dashboard');
      controller.claim('reports');

      const result = await controller.play(first, 'blob:late-response');
      assert.deepEqual(result, { ok: false, reason: 'stale' });
      assert.equal(fake.played.length, 0, 'the late response never played');
      assert.ok(urls.revoked.includes('blob:late-response'), 'the late URL is revoked');
    } finally {
      urls.restore();
    }
  });

  it('3. the live claim plays exactly once', async () => {
    const fake = new FakePlayback();
    const controller = new AssistantAudioController(() => fake);
    const lease = controller.claim('reports');

    let started = 0;
    const result = await controller.play(lease, 'blob:live', () => {
      started += 1;
    });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(fake.played, ['blob:live']);
    assert.equal(started, 1, 'onStart fires only for a live claim');
  });

  it('4. stop() invalidates every outstanding claim but keeps the audio for replay', async () => {
    const fake = new FakePlayback();
    const controller = new AssistantAudioController(() => fake);
    const lease = controller.claim('dashboard');
    await controller.play(lease, 'blob:summary');

    controller.stop();
    assert.equal(controller.isCurrent(lease), false, 'stopping invalidates the claim');
    assert.equal(lease.signal.aborted, true);

    const replay = await controller.playStored('blob:summary');
    assert.deepEqual(replay, { ok: true }, 'replay still works without a new claim');
    assert.deepEqual(fake.played, ['blob:summary', 'blob:summary']);
  });

  it('5. release() stops and revokes, reset() drops the channel', async () => {
    const fake = new FakePlayback();
    const urls = withObjectUrls();
    const controller = new AssistantAudioController(() => fake);
    try {
      const lease = controller.claim('dashboard');
      await controller.play(lease, 'blob:page-audio');
      controller.release('dashboard');
      assert.ok(urls.revoked.includes('blob:page-audio'), 'page audio is released');

      const afterRelease = controller.claim('reports');
      assert.equal(controller.isCurrent(afterRelease), true, 'the channel is reusable after release');
      controller.reset();
      assert.equal(controller.isCurrent(afterRelease), false, 'logout invalidates the claim');
    } finally {
      urls.restore();
    }
  });

  it('6. a claim during playback stops the previous utterance immediately', async () => {
    const fake = new FakePlayback();
    const controller = new AssistantAudioController(() => fake);
    const dashboard = controller.claim('dashboard');
    await controller.play(dashboard, 'blob:dashboard');

    const reports = controller.claim('reports');
    assert.equal(fake.stops >= 1, true, 'the dashboard utterance was stopped on claim');
    await controller.play(reports, 'blob:reports');
    assert.deepEqual(fake.played, ['blob:dashboard', 'blob:reports'], 'never two utterances at once');
  });
});
