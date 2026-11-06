/**
 * Doctor assistant language preference — one value for the whole doctor application.
 *
 * The assistant panel is mounted per page, so the preference cannot live in a component.
 * It is stored per doctor id in localStorage and shared through a tiny external store
 * (`useSyncExternalStore`), which keeps every page in sync and survives a refresh.
 *
 * Default: Hindi. A doctor's choice never leaks into another doctor's session because the
 * storage key includes the doctor id.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type AssistantLanguage = 'hi' | 'en';

export const DEFAULT_ASSISTANT_LANGUAGE: AssistantLanguage = 'hi';
export const ASSISTANT_LANGUAGES: readonly AssistantLanguage[] = ['hi', 'en'];

const STORAGE_PREFIX = 'samvad.doctor.assistantLanguage.';
const FALLBACK_SCOPE = 'anonymous';

const memory = new Map<string, AssistantLanguage>();
const listeners = new Set<() => void>();

function scope(doctorId?: string | null): string {
  return doctorId && doctorId.trim() !== '' ? doctorId : FALLBACK_SCOPE;
}

function storageKey(doctorId?: string | null): string {
  return `${STORAGE_PREFIX}${scope(doctorId)}`;
}

function isLanguage(value: unknown): value is AssistantLanguage {
  return value === 'hi' || value === 'en';
}

function readStorage(key: string): AssistantLanguage | null {
  try {
    const raw = window.localStorage.getItem(key);
    return isLanguage(raw) ? raw : null;
  } catch {
    // Private mode or a blocked storage API: fall back to the in-memory value.
    return null;
  }
}

/** The doctor's assistant language. Never throws. */
export function getAssistantLanguage(doctorId?: string | null): AssistantLanguage {
  const key = storageKey(doctorId);
  const cached = memory.get(key);
  if (cached) return cached;
  const stored = typeof window === 'undefined' ? null : readStorage(key);
  const value = stored ?? DEFAULT_ASSISTANT_LANGUAGE;
  memory.set(key, value);
  return value;
}

/** Persists the choice for one doctor and notifies every mounted assistant. */
export function setAssistantLanguage(doctorId: string | null | undefined, language: AssistantLanguage): void {
  const key = storageKey(doctorId);
  if (memory.get(key) === language) return;
  memory.set(key, language);
  try {
    window.localStorage.setItem(key, language);
  } catch {
    // The in-memory value still drives this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe to the shared preference. `setLanguage` updates it for every page. */
export function useAssistantLanguage(
  doctorId?: string | null,
): [AssistantLanguage, (language: AssistantLanguage) => void] {
  const language = useSyncExternalStore(
    subscribe,
    () => getAssistantLanguage(doctorId),
    () => DEFAULT_ASSISTANT_LANGUAGE,
  );
  const setLanguage = useCallback(
    (next: AssistantLanguage) => setAssistantLanguage(doctorId, next),
    [doctorId],
  );
  return [language, setLanguage];
}
