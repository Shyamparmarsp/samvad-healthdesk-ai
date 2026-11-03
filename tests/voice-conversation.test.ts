import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECORDING_MS,
  VoiceConversation,
  canTransition,
  transition,
  type QuestionRef,
  type RecordedAnswer,
  type SpeechOutcome,
  type TranscriptionOutcome,
  type TurnOutcome,
  type VoiceClock,
  type VoiceErrorCode,
  type VoicePhase,
  type VoicePorts,
} from '../src/features/patient/voice-conversation';

// ---------------------------------------------------------------------------
// Fakes: a deterministic clock and scripted providers. No browser, no network,
// no paid provider call.
// ---------------------------------------------------------------------------

class FakeClock implements VoiceClock {
  private current = 0;
  private nextId = 0;
  private timers = new Map<number, { at: number; fn: () => void; repeat?: number }>();

  now(): number {
    return this.current;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.current + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  setInterval(fn: () => void, ms: number): unknown {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.current + ms, fn, repeat: ms });
    return id;
  }

  clearInterval(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  get pending(): number {
    return this.timers.size;
  }

  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      this.current = timer.at;
      if (timer.repeat) timer.at += timer.repeat;
      else this.timers.delete(id);
      timer.fn();
    }
    this.current = target;
  }
}

/** Lets the machine's await chains settle. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

interface Script {
  speech?: SpeechOutcome[];
  transcription?: TranscriptionOutcome[];
  turns?: TurnOutcome[];
  startListeningError?: Error;
}

function createHarness(script: Script = {}) {
  const clock = new FakeClock();
  const spoken: QuestionRef[] = [];
  const transcripts: string[] = [];
  const submitted: string[] = [];
  const errors: VoiceErrorCode[] = [];
  const audioFailures: string[] = [];
  const phases: VoicePhase[] = [];
  const elapsed: number[] = [];
  const completions: string[] = [];

  const speech = [...(script.speech ?? [])];
  const transcription = [...(script.transcription ?? [])];
  const turns = [...(script.turns ?? [])];

  let recordings = 0;
  let stops = 0;
  let cancels = 0;

  const ports: VoicePorts = {
    async speak(question) {
      spoken.push(question);
      return speech.shift() ?? { spoken: true };
    },
    async startListening() {
      if (script.startListeningError) throw script.startListeningError;
      recordings += 1;
    },
    async stopListening(): Promise<RecordedAnswer> {
      stops += 1;
      return {
        audio_base64: 'UklGRg==',
        audio_format: 'audio/wav',
        duration_ms: 1500,
        has_audio: true,
      };
    },
    cancelListening() {
      cancels += 1;
    },
    async transcribe() {
      return transcription.shift() ?? { ok: true, text: 'chest pain since yesterday' };
    },
    async submit(text) {
      submitted.push(text);
      return turns.shift() ?? { kind: 'complete' };
    },
  };

  const conversation = new VoiceConversation(
    ports,
    {
      onPhase: (phase) => phases.push(phase),
      onTranscript: (text) => transcripts.push(text),
      onError: (code) => errors.push(code),
      onAudioFailure: (reason) => audioFailures.push(reason),
      onElapsed: (seconds) => elapsed.push(seconds),
      onComplete: (kind) => completions.push(kind),
    },
    clock,
  );

  return {
    clock,
    conversation,
    spoken,
    transcripts,
    submitted,
    errors,
    audioFailures,
    phases,
    elapsed,
    completions,
    get recordings() {
      return recordings;
    },
    get stops() {
      return stops;
    },
    get cancels() {
      return cancels;
    },
  };
}

const NAME: QuestionRef = { id: 'name', text: 'What is your name?' };
const AGE: QuestionRef = { id: 'age', text: 'How old are you, in years?' };

// ---------------------------------------------------------------------------

describe('Voice-first conversation state machine', () => {
  it('1. starts once: speaks the first question, then opens the microphone', async () => {
    const h = createHarness();
    await h.conversation.start(NAME);
    await flush();

    assert.deepEqual(h.spoken.map((q) => q.id), ['name'], 'spoke the first question once');
    assert.equal(h.recordings, 1, 'recording started automatically after speech');
    assert.equal(h.conversation.currentPhase, 'listening');
    assert.ok(h.phases.includes('assistant_speaking'), 'assistant phase reported');
    assert.ok(h.phases.indexOf('assistant_speaking') < h.phases.indexOf('listening'), 'speech precedes listening');

    // A second start is ignored: one conversation, one loop.
    await h.conversation.start(NAME);
    await flush();
    assert.equal(h.spoken.length, 1, 'no duplicate speech');
    assert.equal(h.recordings, 1, 'no duplicate recording');
  });

  it('2. Done stops the recording and submits without any extra action', async () => {
    const h = createHarness({
      transcription: [{ ok: true, text: 'My name is Asha' }],
      turns: [{ kind: 'next', question: AGE, turnAdvanced: true }],
    });
    await h.conversation.start(NAME);
    await flush();

    await h.conversation.finishAnswer();
    await flush(12);

    assert.equal(h.stops, 1, 'recorder stopped exactly once');
    assert.deepEqual(h.transcripts, ['My name is Asha'], 'transcript surfaced before submission');
    assert.deepEqual(h.submitted, ['My name is Asha'], 'answer submitted automatically');
    assert.deepEqual(h.spoken.map((q) => q.id), ['name', 'age'], 'next question spoken');
    assert.equal(h.conversation.currentPhase, 'listening', 'listening resumed after speech');
    assert.equal(h.recordings, 2, 'second take started automatically');
    assert.equal(h.recordings, 2, 'no third recording');
  });

  it('3. a second Done press cannot submit twice', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = createHarness();
    const originalStop = h.conversation;

    await originalStop.start(NAME);
    await flush();

    // Make transcription hang so the second press lands while the turn is in flight.
    (h.conversation as unknown as { ports: VoicePorts }).ports.transcribe = async () => {
      await gate;
      return { ok: true, text: 'Asha' };
    };

    const first = h.conversation.finishAnswer();
    await flush(2);
    const second = h.conversation.finishAnswer();
    release?.();
    await Promise.all([first, second]);
    await flush(10);

    assert.equal(h.stops, 1, 'only one recorder stop');
    assert.equal(h.submitted.length, 1, 'only one submission');
  });

  it('4. the 30-second cap ends the take; a short pause does not', async () => {
    const h = createHarness({ transcription: [{ ok: true, text: 'hello' }] });
    await h.conversation.start(NAME);
    await flush();

    // A short pause: no recording activity, no automatic stop.
    h.clock.advance(4_000);
    await flush(2);
    assert.equal(h.conversation.currentPhase, 'listening', 'still listening after a pause');
    assert.equal(h.stops, 0, 'pause does not stop the take');

    // The cap.
    h.clock.advance(MAX_RECORDING_MS);
    await flush(10);
    assert.equal(h.stops, 1, 'cap stopped the take without a Done press');
    assert.ok(h.elapsed.some((seconds) => seconds >= 30), 'countdown reached the cap');
  });

  it('5. a denied microphone is reported and can be retried', async () => {
    const h = createHarness({ startListeningError: new Error('NotAllowedError') });
    await h.conversation.start(NAME);
    await flush();

    assert.equal(h.conversation.currentPhase, 'error');
    assert.deepEqual(h.errors, ['microphone_unavailable']);

    // Retry with the microphone available again.
    (h.conversation as unknown as { ports: VoicePorts }).ports.startListening = async () => {};
    await h.conversation.retry();
    await flush();
    assert.equal(h.conversation.currentPhase, 'listening');
  });

  it('6. empty transcription never submits an invented answer', async () => {
    const h = createHarness({ transcription: [{ ok: false, reason: 'empty' }] });
    await h.conversation.start(NAME);
    await flush();

    await h.conversation.finishAnswer();
    await flush();

    assert.deepEqual(h.submitted, [], 'nothing submitted');
    assert.equal(h.conversation.currentPhase, 'error');
    assert.ok(h.errors.includes('transcription_empty'));
  });

  it('7. a silent take does not reach the transcriber', async () => {
    const h = createHarness();
    await h.conversation.start(NAME);
    await flush();

    (h.conversation as unknown as { ports: VoicePorts }).ports.stopListening = async () => ({
      audio_base64: '',
      audio_format: 'audio/wav',
      duration_ms: 120,
      has_audio: false,
    });

    await h.conversation.finishAnswer();
    await flush();

    assert.deepEqual(h.submitted, []);
    assert.ok(h.errors.includes('transcription_empty'), 'reported as empty');
    assert.equal(h.conversation.currentPhase, 'error');
  });

  it('8. assistant speech failure is reported honestly and the loop continues', async () => {
    const h = createHarness({ speech: [{ spoken: false, reason: 'missing' }] });
    await h.conversation.start(NAME);
    await flush();

    assert.deepEqual(h.audioFailures, ['missing'], 'audio fallback surfaced');
    assert.equal(h.conversation.currentPhase, 'listening', 'text still drives the conversation');
    assert.equal(h.recordings, 1, 'recording still starts');
  });

  it('9. a failed submission stops the loop instead of replaying the question', async () => {
    const h = createHarness({ turns: [{ kind: 'failed' }] });
    await h.conversation.start(NAME);
    await flush();

    await h.conversation.finishAnswer();
    await flush();

    assert.equal(h.conversation.currentPhase, 'error');
    assert.ok(h.errors.includes('submit_failed'));
    assert.deepEqual(h.spoken.map((q) => q.id), ['name'], 'the question is not re-spoken');
    assert.equal(h.recordings, 1, 'no silent microphone restart');
  });

  it('10. an answer that did not advance the turn is not silently re-asked', async () => {
    const h = createHarness({
      turns: [{ kind: 'next', question: NAME, turnAdvanced: false }],
    });
    await h.conversation.start(NAME);
    await flush();

    await h.conversation.finishAnswer();
    await flush();

    assert.equal(h.conversation.currentPhase, 'error');
    assert.ok(h.errors.includes('answer_not_accepted'));
    assert.deepEqual(h.spoken.map((q) => q.id), ['name'], 'same question not spoken twice');
    assert.equal(h.recordings, 1, 'microphone stays closed');
  });

  it('11. completion releases the microphone and stops the loop', async () => {
    const h = createHarness({ turns: [{ kind: 'complete' }] });
    await h.conversation.start(NAME);
    await flush();

    await h.conversation.finishAnswer();
    await flush();

    assert.equal(h.conversation.currentPhase, 'completed');
    assert.deepEqual(h.completions, ['complete']);
    assert.ok(h.cancels > 0, 'recording cancelled on completion');
    assert.equal(h.conversation.isBusy, false);
  });

  it('12. emergency completion is reported as such', async () => {
    const h = createHarness({ turns: [{ kind: 'emergency' }] });
    await h.conversation.start(NAME);
    await flush();

    await h.conversation.finishAnswer();
    await flush();

    assert.deepEqual(h.completions, ['emergency']);
    assert.equal(h.conversation.currentPhase, 'completed');
  });

  it('13. replay never overlaps recording', async () => {
    const h = createHarness();
    await h.conversation.start(NAME);
    await flush();
    assert.equal(h.conversation.currentPhase, 'listening');

    await h.conversation.replay();
    await flush();

    assert.ok(h.cancels > 0, 'take cancelled before speaking');
    assert.equal(h.spoken.length, 2, 'question re-spoken');
    assert.equal(h.recordings, 2, 'listening restarted after replay');
  });

  it('14. text mode keeps the speech but never opens the microphone', async () => {
    const h = createHarness();
    await h.conversation.start(NAME);
    await flush();
    assert.equal(h.recordings, 1);

    h.conversation.setSuspended(true);
    assert.equal(h.conversation.currentPhase, 'idle', 'recording stopped for text mode');

    await h.conversation.announce(AGE);
    await flush();

    assert.deepEqual(h.spoken.map((q) => q.id), ['name', 'age'], 'questions still spoken');
    assert.equal(h.recordings, 1, 'no microphone in text mode');

    h.conversation.setSuspended(false);
    await flush();
    assert.equal(h.recordings, 2, 'listening resumes when voice mode returns');
  });

  it('15. dispose after unmount releases the microphone and ignores late work', async () => {
    const h = createHarness();
    await h.conversation.start(NAME);
    await flush();

    h.conversation.dispose();
    await h.conversation.finishAnswer();
    await flush();

    assert.ok(h.cancels > 0, 'microphone released');
    assert.deepEqual(h.submitted, [], 'nothing submitted after dispose');
    assert.equal(h.clock.pending, 0, 'every timer cleared');
  });
});

describe('Voice phase transitions', () => {
  it('16. only declared transitions are allowed', () => {
    assert.equal(canTransition('idle', 'transcribing'), false, 'cannot transcribe before listening');
    assert.equal(transition('idle', 'transcribing'), 'idle', 'invalid transition is refused');
    assert.equal(canTransition('assistant_speaking', 'listening'), true);
    assert.equal(canTransition('listening', 'submitting'), false, 'must transcribe before submitting');
    assert.equal(transition('listening', 'submitting'), 'listening');
    assert.equal(transition('completed', 'completed'), 'completed', 'repeating a phase is idempotent');
    assert.equal(canTransition('completed', 'listening'), false, 'no restart after completion');
  });

  it('17. recording and speech can never be simultaneous', () => {
    // The only way into assistant_speaking is from idle/processing/listening(in replay),
    // and every other phase must pass through listening before a take can start.
    assert.equal(canTransition('transcribing', 'listening'), false);
    assert.equal(canTransition('submitting', 'listening'), false);
    assert.equal(canTransition('processing', 'listening'), false);
  });
});
