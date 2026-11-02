/**
 * Cached prompt audio (D-06).
 *
 * AGENTS.md requires pre-generated audio for the greeting and the four fixed
 * questions, and forbids calling Timbre for those prompts. This module resolves the
 * approved static asset first and keeps a session-scoped cache for adaptive prompts
 * so a replay does not buy the same audio twice.
 *
 * No audio is generated here. If an asset is missing the caller gets an explicit
 * `missing` result and must surface an honest message; it must not fall back to a
 * paid request for a cached prompt.
 */

export type PromptId = 'greeting' | 'ask-name' | 'ask-age' | 'ask-gender' | 'ask-primary-concern';

export type Language = 'en' | 'hi';

/** Fixed prompts that MUST be served from `public/audio/` and never from the provider. */
export const CACHED_PROMPT_IDS: readonly PromptId[] = [
  'greeting',
  'ask-name',
  'ask-age',
  'ask-gender',
  'ask-primary-concern',
] as const;

/** Maps a stable backend question id to its cached prompt asset. */
const QUESTION_ID_TO_PROMPT: Readonly<Record<string, PromptId>> = {
  greeting: 'greeting',
  name: 'ask-name',
  age: 'ask-age',
  gender: 'ask-gender',
  primary_concern: 'ask-primary-concern',
};

export function promptIdForQuestion(questionId: string | null | undefined): PromptId | null {
  if (!questionId) return null;
  return QUESTION_ID_TO_PROMPT[questionId] ?? null;
}

export function isCachedPrompt(promptId: string | null | undefined): promptId is PromptId {
  return typeof promptId === 'string' && (CACHED_PROMPT_IDS as readonly string[]).includes(promptId);
}

/**
 * Public URL of the approved asset. Files are committed under `public/audio/` and are
 * served as static files by Vercel (no storage bucket or migration required).
 */
export function cachedPromptUrl(language: Language, promptId: PromptId): string {
  return `/audio/${language}/${promptId}.mp3`;
}

export type PromptAudioStatus = 'idle' | 'loading' | 'playing' | 'missing' | 'blocked' | 'error';

export interface PromptAudioResult {
  status: PromptAudioStatus;
  /** Object URL that the caller may play, when the status is `playing`. */
  url?: string;
  /** True when this result was served from the session cache (no provider call). */
  fromCache?: boolean;
}

/**
 * Builds a session-scoped audio cache for provider-backed (adaptive) prompts.
 *
 * Scope is intentionally in-memory only: no new storage bucket, table or migration.
 * A replay of the same question inside the same page session reuses the object URL and
 * does not issue another paid request. A page reload legitimately starts a new session.
 */
export function createPromptAudioCache() {
  const cache = new Map<string, string>();

  return {
    key(language: Language, questionId: string): string {
      return `${language}:${questionId}`;
    },
    get(language: Language, questionId: string): string | undefined {
      return cache.get(this.key(language, questionId));
    },
    set(language: Language, questionId: string, url: string): void {
      cache.set(this.key(language, questionId), url);
    },
    has(language: Language, questionId: string): boolean {
      return cache.has(this.key(language, questionId));
    },
    clear(): void {
      for (const url of cache.values()) {
        // Only object URLs we created should be revoked.
        if (url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Revoking twice is harmless.
          }
        }
      }
      cache.clear();
    },
    size(): number {
      return cache.size;
    },
  };
}

export type PromptAudioCache = ReturnType<typeof createPromptAudioCache>;

/**
 * Resolve audio for one prompt without spending a provider call for a cached prompt.
 *
 * `fetchAdaptiveAudio` is only called for non-cached prompts, and only when the cache
 * misses. It must return a playable URL (object URL or data URL) or null.
 */
export async function resolvePromptAudio(
  input: { language: Language; questionId: string },
  cache: PromptAudioCache,
  fetchAdaptiveAudio?: (language: Language, questionId: string) => Promise<string | null>,
): Promise<PromptAudioResult> {
  const promptId = promptIdForQuestion(input.questionId);

  if (promptId) {
    // Cached prompt: static asset only. Never the provider. `fromCache` is true because
    // the file is committed, not fetched; a missing file surfaces as a playback error
    // that the caller reports honestly.
    return { status: 'playing', url: cachedPromptUrl(input.language, promptId), fromCache: true };
  }

  const cached = cache.get(input.language, input.questionId);
  if (cached) {
    return { status: 'playing', url: cached, fromCache: true };
  }

  if (!fetchAdaptiveAudio) return { status: 'missing' };

  const url = await fetchAdaptiveAudio(input.language, input.questionId);
  if (!url) return { status: 'missing' };
  cache.set(input.language, input.questionId, url);
  return { status: 'playing', url, fromCache: false };
}
