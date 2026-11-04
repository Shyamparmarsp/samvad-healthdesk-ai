/**
 * Voice-first conversation state machine.
 *
 * One explicit phase replaces the previous pile of unrelated booleans (`isListening`,
 * `recordingStatus`, `isProcessing`). Every transition is declared here, so the
 * conversation cannot overlap speech with recording, start two recordings, submit the same
 * answer twice, or leave the microphone open after the session ends.
 *
 * The class is framework-free and takes its audio/STT/API work through `VoicePorts`, so it
 * can be driven by a fake clock and fake providers in tests without a browser.
 */

export type VoicePhase =
  | 'idle'
  | 'initializing'
  | 'assistant_speaking'
  | 'listening'
  | 'silence_detected'
  | 'transcribing'
  | 'submitting'
  | 'processing'
  | 'completed'
  | 'error';

/** Allowed phase changes. Anything else is refused by `transition()`. */
export const VOICE_TRANSITIONS: Readonly<Record<VoicePhase, readonly VoicePhase[]>> = {
  // idle → listening is the retry/resume path after text mode or an error;
  // idle → assistant_speaking is a typed answer whose next question must still be spoken.
  idle: ['initializing', 'assistant_speaking', 'listening', 'error', 'completed'],
  initializing: ['assistant_speaking', 'idle', 'error', 'completed'],
  assistant_speaking: ['listening', 'completed', 'idle', 'error'],
  // listening → assistant_speaking is the explicit "Replay audio" path; it cancels the
  // take first so speech and recording never overlap.
  // listening → silence_detected is VAD deciding the patient finished; it finalises through
  // the same idempotent path as Done.
  listening: ['transcribing', 'silence_detected', 'assistant_speaking', 'idle', 'error', 'completed'],
  silence_detected: ['transcribing', 'idle', 'error', 'completed'],
  transcribing: ['submitting', 'idle', 'error', 'completed'],
  submitting: ['processing', 'idle', 'error', 'completed'],
  processing: ['assistant_speaking', 'idle', 'error', 'completed'],
  completed: ['idle'],
  // An error may resume listening (retry the microphone) or restart speech.
  error: ['listening', 'assistant_speaking', 'idle', 'completed'],
};

export function canTransition(from: VoicePhase, to: VoicePhase): boolean {
  return VOICE_TRANSITIONS[from].includes(to);
}

/** Returns the next phase, or the current one when the transition is not allowed. */
export function transition(from: VoicePhase, to: VoicePhase): VoicePhase {
  return canTransition(from, to) ? to : from;
}

export type VoiceErrorCode =
  | 'microphone_unavailable'
  | 'recording_failed'
  | 'transcription_empty'
  | 'transcription_failed'
  | 'submit_failed'
  | 'answer_not_accepted';

export type SpeechFailure = 'blocked' | 'missing' | 'error' | 'timeout';

export interface QuestionRef {
  id: string;
  text: string;
}

export interface RecordedAnswer {
  audio_base64: string;
  audio_format: string;
  duration_ms: number;
  /** False when the recorder produced no bytes at all. */
  has_audio: boolean;
}

export interface SpeechOutcome {
  spoken: boolean;
  reason?: SpeechFailure;
}

export type TranscriptionOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'failed' };

export type TurnOutcome =
  | { kind: 'next'; question: QuestionRef; turnAdvanced: boolean }
  | { kind: 'complete' }
  | { kind: 'emergency' }
  | { kind: 'failed' };

/** Everything the machine needs from the world. Injected so tests use fakes. */
export interface VoicePorts {
  /** `onStart` fires when audio playback actually begins, never before. */
  speak(question: QuestionRef, onStart?: () => void): Promise<SpeechOutcome>;
  startListening(): Promise<void>;
  stopListening(): Promise<RecordedAnswer>;
  cancelListening(): void;
  transcribe(answer: RecordedAnswer): Promise<TranscriptionOutcome>;
  submit(text: string, question: QuestionRef): Promise<TurnOutcome>;
}

export interface VoiceObserver {
  onPhase?(phase: VoicePhase): void;
  onQuestion?(question: QuestionRef): void;
  /** Playback really started for this question (used for text/audio highlighting). */
  onSpeechStart?(question: QuestionRef): void;
  onTranscript?(text: string): void;
  onElapsed?(seconds: number): void;
  onAudioFailure?(reason: SpeechFailure): void;
  onError?(code: VoiceErrorCode): void;
  onComplete?(kind: 'complete' | 'emergency'): void;
}

/** Injectable timers + clock so the 30-second cap is testable without waiting. */
export interface VoiceClock {
  now(): number;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemVoiceClock: VoiceClock = {
  now: () => Date.now(),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Approved recording cap (AGENTS.md: 30 seconds). */
export const MAX_RECORDING_MS = 30_000;
/** Below this, treat the take as empty: no provider call, no invented answer. */
export const MIN_RECORDING_MS = 400;
const TICK_MS = 500;

export class VoiceConversation {
  private phase: VoicePhase = 'idle';
  private question: QuestionRef | null = null;
  private started = false;
  private disposed = false;
  /** Guards against a second Done press during transcription/submission. */
  private finishing = false;
  private capHandle: unknown = null;
  private tickHandle: unknown = null;
  private listeningSince = 0;
  /** Text mode: keep speaking the questions, but never open the microphone. */
  private suspended = false;

  constructor(
    private readonly ports: VoicePorts,
    private readonly observer: VoiceObserver = {},
    private readonly clock: VoiceClock = systemVoiceClock,
    private readonly maxRecordingMs: number = MAX_RECORDING_MS,
  ) {}

  get currentPhase(): VoicePhase {
    return this.phase;
  }

  get currentQuestion(): QuestionRef | null {
    return this.question;
  }

  /** True while the loop owns the microphone or the turn. */
  get isBusy(): boolean {
    return (
      this.phase === 'initializing' ||
      this.phase === 'assistant_speaking' ||
      this.phase === 'listening' ||
      this.phase === 'silence_detected' ||
      this.phase === 'transcribing' ||
      this.phase === 'submitting' ||
      this.phase === 'processing'
    );
  }

  private setPhase(next: VoicePhase): boolean {
    const applied = transition(this.phase, next);
    if (applied === this.phase && next !== this.phase) return false;
    this.phase = applied;
    this.observer.onPhase?.(applied);
    return true;
  }

  /** Starts the loop exactly once for the first question. */
  async start(question: QuestionRef): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    this.question = question;
    this.setPhase('initializing');
    this.observer.onQuestion?.(question);
    await this.speakThenListen(question);
  }

  /**
   * VAD reported sustained silence after speech. It converges on the same idempotent
   * finalisation as the manual Done button, so the two paths can never double-submit.
   */
  notifySilenceDetected(): void {
    if (this.disposed || this.finishing) return;
    if (this.phase !== 'listening') return;
    if (!this.setPhase('silence_detected')) return;
    void this.finishAnswer();
  }

  /** Done pressed, the 30-second cap fired, or VAD detected silence. Idempotent. */
  async finishAnswer(): Promise<void> {
    if (this.disposed) return;
    if (this.phase !== 'listening' && this.phase !== 'silence_detected') return;
    if (this.finishing) return;
    this.finishing = true;

    this.clearTimers();
    if (!this.setPhase('transcribing')) {
      this.finishing = false;
      return;
    }

    let answer: RecordedAnswer;
    try {
      answer = await this.ports.stopListening();
    } catch {
      this.finishing = false;
      this.fail('recording_failed');
      return;
    }
    if (this.disposed) return;

    // Nothing was captured: do not buy a transcription for silence and never submit
    // invented text.
    if (!answer.has_audio || answer.duration_ms < MIN_RECORDING_MS) {
      this.finishing = false;
      this.fail('transcription_empty');
      return;
    }

    const transcription = await this.ports.transcribe(answer);
    if (this.disposed) return;
    if (!transcription.ok) {
      this.finishing = false;
      this.fail(transcription.reason === 'empty' ? 'transcription_empty' : 'transcription_failed');
      return;
    }

    const text = transcription.text.trim();
    if (text.length === 0) {
      this.finishing = false;
      this.fail('transcription_empty');
      return;
    }

    // Shown in the conversation before the answer is accepted (D-41 keeps navigation
    // tied to the backend's acceptance, not to this optimistic bubble).
    this.observer.onTranscript?.(text);

    if (!this.setPhase('submitting')) {
      this.finishing = false;
      return;
    }

    const outcome = await this.ports.submit(text, this.question as QuestionRef);
    if (this.disposed) return;

    if (outcome.kind === 'failed') {
      this.finishing = false;
      this.fail('submit_failed');
      return;
    }

    if (outcome.kind === 'complete' || outcome.kind === 'emergency') {
      this.setPhase('completed');
      this.clearTimers();
      this.ports.cancelListening();
      this.observer.onComplete?.(outcome.kind);
      return;
    }

    this.setPhase('processing');

    // A response that did not advance the turn means the answer was not accepted. Do not
    // silently replay the same question: say so and let the patient answer again.
    if (!outcome.turnAdvanced) {
      this.finishing = false;
      this.fail('answer_not_accepted');
      return;
    }

    this.finishing = false;
    this.question = outcome.question;
    this.observer.onQuestion?.(outcome.question);
    await this.speakThenListen(outcome.question);
  }

  /** Patient pressed "try again" after an error. Re-opens the microphone. */
  async retry(): Promise<void> {
    if (this.disposed || this.phase !== 'error') return;
    this.finishing = false;
    await this.listen();
  }

  /**
   * Speaks one question outside the answer loop (used after a typed answer) and then
   * resumes listening when the patient is in voice mode.
   */
  async announce(question: QuestionRef): Promise<void> {
    if (this.disposed || this.phase === 'completed') return;
    if (this.phase === 'listening') {
      // Speech and recording never overlap: close the take before speaking.
      this.clearTimers();
      this.ports.cancelListening();
    }
    this.question = question;
    this.observer.onQuestion?.(question);
    await this.speakThenListen(question);
  }

  /** Replays the current question without answering it. Never overlaps a recording. */
  async replay(): Promise<void> {
    if (this.disposed || !this.question) return;
    if (this.phase === 'listening') {
      this.clearTimers();
      this.ports.cancelListening();
    } else if (this.phase === 'transcribing' || this.phase === 'submitting' || this.phase === 'processing') {
      // Never talk over a turn that is already being processed.
      return;
    }
    await this.speakThenListen(this.question);
  }

  /**
   * Voice ↔ text mode. Suspending cancels any open recording and stops the automatic
   * microphone, but the assistant keeps speaking the questions.
   */
  setSuspended(suspended: boolean): void {
    if (this.disposed) return;
    this.suspended = suspended;
    if (suspended) {
      this.clearTimers();
      this.ports.cancelListening();
      if (this.phase === 'listening') this.setPhase('idle');
      return;
    }
    if (this.phase === 'idle' && this.started) void this.listen();
  }

  /** Releases the microphone and stops every timer. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.finishing = false;
    this.clearTimers();
    try {
      this.ports.cancelListening();
    } catch {}
    if (this.phase !== 'completed') this.setPhase('idle');
  }

  private async speakThenListen(question: QuestionRef): Promise<void> {
    if (this.disposed) return;
    if (!this.setPhase('assistant_speaking')) return;

    let speech: SpeechOutcome = { spoken: false, reason: 'missing' };
    try {
      speech = await this.ports.speak(question, () => this.observer.onSpeechStart?.(question));
    } catch {
      speech = { spoken: false, reason: 'error' };
    }
    if (this.disposed) return;
    if (!speech.spoken) this.observer.onAudioFailure?.(speech.reason ?? 'error');

    await this.listen();
  }

  private async listen(): Promise<void> {
    if (this.disposed) return;
    if (this.suspended) {
      // Text mode: the loop stays alive for speech but the microphone stays closed.
      if (this.phase !== 'idle') this.setPhase('idle');
      return;
    }
    try {
      await this.ports.startListening();
    } catch {
      this.fail('microphone_unavailable');
      return;
    }
    if (this.disposed) {
      this.ports.cancelListening();
      return;
    }
    if (!this.setPhase('listening')) {
      this.ports.cancelListening();
      return;
    }
    this.startTimers();
  }

  private startTimers(): void {
    this.clearTimers();
    this.listeningSince = this.clock.now();
    this.observer.onElapsed?.(0);

    this.tickHandle = this.clock.setInterval(() => {
      const elapsed = this.clock.now() - this.listeningSince;
      this.observer.onElapsed?.(Math.max(0, Math.min(this.maxRecordingMs, elapsed)) / 1000);
    }, TICK_MS);

    this.capHandle = this.clock.setTimeout(() => {
      // Stop at the approved cap without interrupting on short pauses: only the wall
      // clock ends a take.
      void this.finishAnswer();
    }, this.maxRecordingMs);
  }

  private clearTimers(): void {
    if (this.tickHandle !== null) {
      this.clock.clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    if (this.capHandle !== null) {
      this.clock.clearTimeout(this.capHandle);
      this.capHandle = null;
    }
  }

  private fail(code: VoiceErrorCode): void {
    this.clearTimers();
    this.setPhase('error');
    this.observer.onError?.(code);
  }
}
