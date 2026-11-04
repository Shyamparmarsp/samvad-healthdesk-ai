/**
 * Voice activity detection for automatic answer submission.
 *
 * Two parts:
 *   - `createSilenceDetector` — a pure, time-injected state machine. It decides when the
 *     patient has actually spoken and when a *sustained* silence has replaced speech.
 *   - `createMicrophoneMonitor` — a thin Web Audio wrapper that reports an RMS level for
 *     the already-open MediaStream. It never opens a microphone by itself.
 *
 * Safety properties:
 *   - silence is never emitted before real speech activity was observed, so ambient noise
 *     at the start of a take cannot submit an empty answer;
 *   - a pause shorter than `silenceMs` never finalises anything;
 *   - the detector is one-shot: after it reports silence it stays quiet until reset.
 */

export interface SilenceDetectorOptions {
  /** Sustained silence that finalises the take (owner-approved default: 3.5 s). */
  silenceMs?: number;
  /** RMS threshold (0–1) above which a frame counts as voice. */
  speechThreshold?: number;
  /** Voice activity needed before silence can be measured (ignores clicks/short blips). */
  minSpeechMs?: number;
}

export const DEFAULT_SILENCE_MS = 3500;
export const DEFAULT_SPEECH_THRESHOLD = 0.012;
export const DEFAULT_MIN_SPEECH_MS = 250;

export type VadEvent = 'speech_started' | 'silence_detected';

export interface SilenceDetector {
  /** Feeds one RMS frame. Returns an event when a threshold was crossed. */
  push(level: number, atMs: number): VadEvent | null;
  reset(): void;
  readonly speechStarted: boolean;
  readonly triggered: boolean;
}

export function createSilenceDetector(options: SilenceDetectorOptions = {}): SilenceDetector {
  const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
  const speechThreshold = options.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD;
  const minSpeechMs = options.minSpeechMs ?? DEFAULT_MIN_SPEECH_MS;

  let speechStartedAt: number | null = null;
  let lastVoiceAt: number | null = null;
  let announcedSpeech = false;
  let announcedSilence = false;

  return {
    get speechStarted() {
      return announcedSpeech;
    },
    get triggered() {
      return announcedSilence;
    },
    reset() {
      speechStartedAt = null;
      lastVoiceAt = null;
      announcedSpeech = false;
      announcedSilence = false;
    },
    push(level: number, atMs: number): VadEvent | null {
      if (announcedSilence || !Number.isFinite(atMs)) return null;

      const isVoice = Number.isFinite(level) && level >= speechThreshold;
      if (isVoice) {
        lastVoiceAt = atMs;
        if (speechStartedAt === null) speechStartedAt = atMs;
        // Require a minimum run of voice before arming the silence timer.
        if (!announcedSpeech && atMs - speechStartedAt >= minSpeechMs) {
          announcedSpeech = true;
          return 'speech_started';
        }
        return null;
      }

      if (!announcedSpeech || lastVoiceAt === null) return null;
      if (atMs - lastVoiceAt >= silenceMs) {
        announcedSilence = true;
        return 'silence_detected';
      }
      return null;
    },
  };
}

export interface MicrophoneMonitor {
  stop(): void;
  readonly supported: boolean;
}

interface MonitorOptions {
  onLevel: (level: number, atMs: number) => void;
  /** Sampling interval; 100 ms resolves a 3.5 s silence comfortably. */
  intervalMs?: number;
  now?: () => number;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const candidate =
    (window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return candidate ?? null;
}

export function isVadSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hasStream = Boolean(navigator.mediaDevices?.getUserMedia);
  const hasContext = getAudioContextCtor() !== null;
  const hasAnalyser =
    typeof window !== 'undefined' && typeof (window as unknown as { AnalyserNode?: unknown }).AnalyserNode === 'function';
  return hasStream && hasContext && hasAnalyser;
}

/**
 * Samples the RMS level of an existing microphone stream. Returns `supported: false` (and
 * does nothing) when Web Audio is unavailable, so callers keep the manual Done fallback.
 */
export function createMicrophoneMonitor(stream: MediaStream, options: MonitorOptions): MicrophoneMonitor {
  const Ctor = getAudioContextCtor();
  if (!Ctor || typeof stream?.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
    return { supported: false, stop() {} };
  }

  const intervalMs = options.intervalMs ?? 100;
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  let context: AudioContext;
  try {
    context = new Ctor();
  } catch {
    return { supported: false, stop() {} };
  }

  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let buffer: Float32Array<ArrayBuffer> | null = null;

  try {
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
  } catch {
    void context.close().catch(() => {});
    return { supported: false, stop() {} };
  }

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    try {
      source?.disconnect();
    } catch {}
    try {
      analyser?.disconnect();
    } catch {}
    void context.close().catch(() => {});
  };

  if (context.state === 'suspended') {
    // Resuming needs a gesture; the take itself was started by one.
    void context.resume().catch(() => {});
  }

  timer = setInterval(() => {
    if (!analyser || !buffer) return;
    try {
      analyser.getFloatTimeDomainData(buffer);
    } catch {
      return;
    }
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);
    options.onLevel(rms, now());
  }, intervalMs);

  return { supported: true, stop };
}
