/**
 * One reusable audio playback channel for the patient conversation.
 *
 * Why a single element
 * --------------------
 * Browsers only allow programmatic playback after a user gesture ("autoplay policy").
 * Reusing one `HTMLAudioElement` that was unlocked inside the Start Talking click keeps
 * that permission for the rest of the intake, so the assistant can speak each question
 * without the patient tapping anything. A fresh element per question loses the gesture and
 * is the reason spoken prompts were unreliable.
 *
 * Honesty rules
 * -------------
 * `play()` resolves only when playback actually ended (`ended`), and reports a failure
 * when the source cannot be decoded, the browser blocks it, or it never finishes. It never
 * resolves `ok` for silence.
 */

export type PlaybackFailure = 'blocked' | 'cancelled' | 'error' | 'missing' | 'timeout';

export interface PlaybackResult {
  ok: boolean;
  reason?: PlaybackFailure;
}

/** The subset of HTMLAudioElement used here, so tests can inject a fake. */
export interface AudioElementLike {
  src: string;
  muted: boolean;
  volume: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
}

export interface AudioPlaybackOptions {
  createAudio?: () => AudioElementLike;
  /** Upper bound for one utterance. A prompt never exceeds this in the demo. */
  safetyMs?: number;
  /** Zero-sample WAV used only to unlock the element inside the user gesture. */
  unlockSource?: string;
}

/** A valid 44-byte WAV header with no samples. Silent by construction, never "speech". */
export const SILENT_UNLOCK_SOURCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

export interface AudioPlayback {
  /** Must be called from a user gesture. Unlocks every later play() call. */
  unlock(): Promise<void>;
  play(url: string): Promise<PlaybackResult>;
  stop(): void;
  readonly isPlaying: boolean;
  /** True once unlock() ran inside a gesture. */
  readonly isUnlocked: boolean;
}

export function createAudioPlayback(options: AudioPlaybackOptions = {}): AudioPlayback {
  const createAudio =
    options.createAudio ??
    (() => new Audio() as unknown as AudioElementLike);
  const safetyMs = options.safetyMs ?? 30_000;
  const unlockSource = options.unlockSource ?? SILENT_UNLOCK_SOURCE;

  let element: AudioElementLike | null = null;
  let playing = false;
  let unlocked = false;
  let token = 0;
  /** Settles the in-flight play() when the channel is stopped from outside. */
  let cancelPending: (() => void) | null = null;

  const ensure = (): AudioElementLike => {
    if (!element) element = createAudio();
    return element;
  };

  const detach = (target: AudioElementLike) => {
    target.onended = null;
    target.onerror = null;
  };

  const stop = () => {
    token += 1;
    playing = false;
    const cancel = cancelPending;
    cancelPending = null;
    cancel?.();
    if (!element) return;
    detach(element);
    try {
      element.pause();
    } catch {
      // A paused or empty element is not an error.
    }
  };

  return {
    get isPlaying() {
      return playing;
    },
    get isUnlocked() {
      return unlocked;
    },

    async unlock(): Promise<void> {
      const target = ensure();
      const previous = target.src;
      try {
        target.muted = true;
        target.src = unlockSource;
        await target.play();
      } catch {
        // Some browsers reject even a muted silent clip; the next play() reports it.
      } finally {
        try {
          target.pause();
        } catch {}
        target.muted = false;
        try {
          target.src = previous ?? '';
        } catch {}
      }
      unlocked = true;
    },

    async play(url: string): Promise<PlaybackResult> {
      if (!url) return { ok: false, reason: 'missing' };
      stop();
      const target = ensure();
      const attempt = ++token;
      playing = true;

      return new Promise<PlaybackResult>((resolve) => {
        let settled = false;
        const settle = (result: PlaybackResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(safety);
          if (cancelPending === cancel) cancelPending = null;
          if (token === attempt) {
            playing = false;
            detach(target);
          }
          resolve(result);
        };
        const cancel = () => settle({ ok: false, reason: 'cancelled' });
        cancelPending = cancel;

        const safety = setTimeout(() => settle({ ok: false, reason: 'timeout' }), safetyMs);

        target.onended = () => settle({ ok: true });
        target.onerror = () => settle({ ok: false, reason: 'error' });
        target.src = url;

        let played: Promise<void>;
        try {
          played = target.play();
        } catch (error) {
          settle({ ok: false, reason: nameOf(error) === 'NotAllowedError' ? 'blocked' : 'error' });
          return;
        }
        Promise.resolve(played).catch((error: unknown) => {
          settle({ ok: false, reason: nameOf(error) === 'NotAllowedError' ? 'blocked' : 'error' });
        });
      });
    },

    stop,
  };
}

function nameOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return '';
}
