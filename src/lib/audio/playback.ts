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
  /**
   * Plays one URL. `onStart` fires when the browser actually begins playback (the
   * `play()` promise resolves), which is what the text highlight is allowed to follow.
   */
  play(url: string, options?: { onStart?: () => void }): Promise<PlaybackResult>;
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
    // Never leave the channel muted: a stopped unlock must not silence the next
    // summary (see the unlock doc comment).
    element.muted = false;
  };

  return {
    get isPlaying() {
      return playing;
    },
    get isUnlocked() {
      return unlocked;
    },

    /**
     * Plays a zero-sample clip inside the user gesture so the browser remembers that this
     * element may play audio later. It is muted, so the doctor hears nothing.
     *
     * The unmute in `finally` is unconditional. A caller that supersedes the unlock (for
     * example by cancelling the previous sentence right after a click) still gets an
     * audible channel; leaving the element muted was the reason a generated summary could
     * report "speaking" while playing silence.
     */
    async unlock(): Promise<void> {
      const target = ensure();
      const previous = target.src;
      // Unlocking is asynchronous. If a real utterance starts while the silent clip is
      // still resolving, that playback owns the element: cleaning up afterwards would
      // pause it and swallow its `ended` event. Only the pause/src restore is skipped,
      // never the unmute.
      const generation = token;
      try {
        target.muted = true;
        target.volume = 1;
        target.src = unlockSource;
        await target.play();
      } catch {
        // Some browsers reject even a muted silent clip; the next play() reports it.
      } finally {
        target.muted = false;
        if (token === generation) {
          try {
            target.pause();
          } catch {}
          try {
            target.src = previous ?? '';
          } catch {}
        }
      }
      unlocked = true;
    },

    async play(url: string, options: { onStart?: () => void } = {}): Promise<PlaybackResult> {
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
        // A reusable element can be left muted by an interrupted unlock or by the page;
        // an utterance must always be audible.
        target.muted = false;
        target.volume = 1;
        target.src = url;

        let played: Promise<void>;
        try {
          played = target.play();
        } catch (error) {
          settle({ ok: false, reason: nameOf(error) === 'NotAllowedError' ? 'blocked' : 'error' });
          return;
        }
        Promise.resolve(played)
          .then(() => {
            // Real playback start, not the request start: highlight may follow this.
            if (token === attempt) options.onStart?.();
          })
          .catch((error: unknown) => {
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
