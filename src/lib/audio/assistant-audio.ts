/**
 * One assistant audio channel for the whole doctor application.
 *
 * Why a singleton: every doctor page mounts its own Samwad Assistant, and browsers are
 * happy to play several detached `HTMLAudioElement`s at once. Two pages could therefore
 * speak over each other. All assistant instances share this controller, which owns the
 * only playback element, the only active object URL and the only in-flight speech
 * request. A newer claim cancels everything the previous claim owned.
 *
 * The unlock fix from `playback.ts` is preserved: `unlock()` always leaves the element
 * audible, even when a newer claim supersedes the silent clip.
 */

import { createAudioPlayback, type AudioPlayback, type PlaybackResult } from './playback';

/** Upper bound for one assistant utterance; a summary is far shorter. */
const AUDIO_SAFETY_MS = 60_000;

export interface AudioLease {
  /** Monotonic id of this claim. Only the newest claim may play or update the UI. */
  generation: number;
  /** Aborted as soon as another claim, a stop or a reset supersedes this one. */
  signal: AbortSignal;
}

export type LeasePlayback = PlaybackResult | { ok: false; reason: 'stale' };

export class AssistantAudioController {
  private playback: AudioPlayback;
  private generation = 0;

  /**
   * `createPlayback` is injectable so tests can drive the controller without a browser
   * audio element; production always uses the real channel.
   */
  constructor(createPlayback: () => AudioPlayback = () => createAudioPlayback({ safetyMs: AUDIO_SAFETY_MS })) {
    this.playback = createPlayback();
  }

  private controller: AbortController | null = null;
  private audioUrl: string | null = null;

  /** Stops playback, aborts the previous speech request and revokes its audio. */
  claim(_ownerId: string): AudioLease {
    this.generation += 1;
    this.playback.stop();
    this.controller?.abort();
    this.revokeUrl();
    this.controller = new AbortController();
    return { generation: this.generation, signal: this.controller.signal };
  }

  isCurrent(lease: AudioLease): boolean {
    return lease.generation === this.generation && !lease.signal.aborted;
  }

  /** Must be called synchronously inside the doctor's click. */
  unlock(): Promise<void> {
    return this.playback.unlock();
  }

  /** Plays the audio for a live claim. A stale claim can never start audio. */
  async play(lease: AudioLease, url: string, onStart?: () => void): Promise<LeasePlayback> {
    if (!this.isCurrent(lease)) {
      URL.revokeObjectURL(url);
      return { ok: false, reason: 'stale' };
    }
    this.audioUrl = url;
    return this.playback.play(url, {
      onStart: () => {
        if (this.isCurrent(lease)) onStart?.();
      },
    });
  }

  /**
   * Replays the current audio without a new claim, so the cached object URL (which a claim
   * would revoke) is still valid.
   */
  playStored(url: string, onStart?: () => void): Promise<PlaybackResult> {
    if (!url) return Promise.resolve({ ok: false, reason: 'missing' });
    return this.playback.play(url, { onStart });
  }

  /**
   * Stops whatever is speaking and invalidates every outstanding claim. The last object
   * URL is kept so a stopped summary can be replayed without paying for TTS again.
   */
  stop(): void {
    this.generation += 1;
    this.playback.stop();
    this.controller?.abort();
    this.controller = null;
  }

  /** Stops and releases the audio (page unmounted). */
  release(_ownerId: string): void {
    this.stop();
    this.revokeUrl();
  }

  /** Logout: drop the channel, its audio and every pending request. */
  reset(): void {
    this.stop();
    this.revokeUrl();
    this.playback = createAudioPlayback({ safetyMs: AUDIO_SAFETY_MS });
  }

  private revokeUrl(): void {
    if (!this.audioUrl) return;
    URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = null;
  }
}

/** The single assistant audio session for the doctor application. */
export const assistantAudio = new AssistantAudioController();
