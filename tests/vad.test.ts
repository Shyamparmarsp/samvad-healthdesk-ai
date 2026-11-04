import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SILENCE_MS,
  DEFAULT_SPEECH_THRESHOLD,
  createSilenceDetector,
} from '../src/lib/audio/vad';

/** Drives the detector with a synthetic level timeline. */
function run(timeline: Array<[number, number]>, options = {}) {
  const detector = createSilenceDetector(options);
  const events: Array<{ at: number; event: string }> = [];
  for (const [at, level] of timeline) {
    const event = detector.push(level, at);
    if (event) events.push({ at, event });
  }
  return { detector, events };
}

const LOUD = 0.08;
const QUIET = 0.001;

describe('Voice activity detection', () => {
  it('1. defaults match the approved behaviour (3.5 s of sustained silence)', () => {
    assert.equal(DEFAULT_SILENCE_MS, 3500);
    assert.ok(DEFAULT_SPEECH_THRESHOLD > 0 && DEFAULT_SPEECH_THRESHOLD < 0.1);
  });

  it('2. ambient silence at the start never submits anything', () => {
    // Ten seconds of room noise before the patient says a word.
    const timeline: Array<[number, number]> = [];
    for (let t = 0; t <= 10_000; t += 100) timeline.push([t, QUIET]);
    const { events } = run(timeline);
    assert.deepEqual(events, [], 'no speech, no submission');
  });

  it('3. sustained silence after real speech finalises the take', () => {
    const timeline: Array<[number, number]> = [];
    // 1.2 s of speech.
    for (let t = 0; t <= 1200; t += 100) timeline.push([t, LOUD]);
    // Then silence.
    for (let t = 1300; t <= 6000; t += 100) timeline.push([t, QUIET]);

    const { events } = run(timeline);
    assert.equal(events[0].event, 'speech_started');
    assert.equal(events.at(-1)?.event, 'silence_detected');
    const silenceAt = events.at(-1)!.at;
    assert.ok(silenceAt >= 1200 + 3500, `silence measured from the last voice frame (got ${silenceAt})`);
    assert.ok(silenceAt < 1200 + 3500 + 400, 'fires promptly once 3.5 s have elapsed');
  });

  it('4. short natural pauses do not finalise speech', () => {
    const timeline: Array<[number, number]> = [];
    for (let t = 0; t <= 800; t += 100) timeline.push([t, LOUD]);
    // A 2 s thinking pause, then more speech.
    for (let t = 900; t <= 2900; t += 100) timeline.push([t, QUIET]);
    for (let t = 3000; t <= 4200; t += 100) timeline.push([t, LOUD]);

    const { events } = run(timeline);
    assert.equal(
      events.some((e) => e.event === 'silence_detected'),
      false,
      'a paused sentence is not submitted',
    );
  });

  it('5. a very short blip is not treated as speech', () => {
    const { events } = run([
      [0, LOUD],
      [100, QUIET],
      [4000, QUIET],
    ]);
    assert.deepEqual(events, [], 'one 100 ms blip is not speech');
  });

  it('6. silence is reported exactly once (one submission per take)', () => {
    const timeline: Array<[number, number]> = [];
    for (let t = 0; t <= 600; t += 100) timeline.push([t, LOUD]);
    for (let t = 700; t <= 9000; t += 100) timeline.push([t, QUIET]);
    const { events } = run(timeline);
    assert.equal(events.filter((e) => e.event === 'silence_detected').length, 1);
  });

  it('7. reset() clears the one-shot latch for the next take', () => {
    const detector = createSilenceDetector();
    detector.push(LOUD, 0);
    detector.push(LOUD, 300);
    for (let t = 400; t <= 4000; t += 100) detector.push(QUIET, t);
    assert.equal(detector.triggered, true);

    detector.reset();
    assert.equal(detector.triggered, false);
    assert.equal(detector.speechStarted, false);
    detector.push(LOUD, 5000);
    assert.equal(detector.push(LOUD, 5400), 'speech_started');
  });

  it('8. low-volume speech above the threshold is still recognised', () => {
    const quietVoice = DEFAULT_SPEECH_THRESHOLD + 0.001;
    const { events } = run([
      [0, quietVoice],
      [400, quietVoice],
      [3900, QUIET],
    ]);
    assert.equal(events[0].event, 'speech_started');
    assert.equal(events.at(-1)?.event, 'silence_detected');
  });

  it('9. a custom silence window is honoured', () => {
    const { events } = run(
      [
        [0, LOUD],
        [400, LOUD],
        [900, QUIET],
        [1400, QUIET],
      ],
      { silenceMs: 500 },
    );
    assert.equal(events.at(-1)?.event, 'silence_detected');
  });
});
