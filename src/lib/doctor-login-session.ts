/**
 * Doctor login-session identity and the one-time automatic-briefing guard.
 *
 * Supabase's session object has no stable per-login id: `access_token` rotates on every
 * refresh and `user.id` is stable across logins. The automatic dashboard briefing must
 * happen once per *login*, so the app mints its own nonce at the moment a sign-in
 * succeeds and keeps it in `sessionStorage`:
 *
 *   - route changes keep the same record (same tab, same login);
 *   - a browser refresh keeps the same record and therefore never counts as a new login;
 *   - a token refresh never touches the record;
 *   - logout removes it, so the next successful login mints a new one and briefs once.
 *
 * `claimAutomaticGreeting` is the idempotent, synchronous guard. It flips the stored
 * `greetingAttempted` flag before any network request starts, so multiple renders,
 * effects or authentication callbacks can race it safely and only the first wins.
 */

export interface DoctorLoginSession {
  /** Opaque nonce for one successful login. Never an access token. */
  id: string;
  doctorId: string;
  /** True once an automatic briefing has been attempted for this login. */
  greetingAttempted: boolean;
  startedAt: string;
}

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LOGIN_SESSION_STORAGE_KEY = 'samvad.doctor.loginSession.v1';

/**
 * Fallback used when `sessionStorage` is unavailable (Node tests, private mode).
 * The store is read through on every call, so a page refresh in the browser can never
 * read a stale module-level value.
 */
let fallbackRecord: DoctorLoginSession | null = null;

function sessionStorage(): SessionStorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is DoctorLoginSession {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id.trim() !== '' &&
    typeof record.doctorId === 'string' &&
    record.doctorId.trim() !== '' &&
    typeof record.greetingAttempted === 'boolean' &&
    typeof record.startedAt === 'string'
  );
}

function readRecord(): DoctorLoginSession | null {
  const storage = sessionStorage();
  if (!storage) return fallbackRecord;
  try {
    const raw = storage.getItem(LOGIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    // A corrupt value must never suppress a genuine login; treat it as absent.
    return null;
  }
}

function writeRecord(record: DoctorLoginSession): void {
  fallbackRecord = record;
  const storage = sessionStorage();
  if (!storage) return;
  try {
    storage.setItem(LOGIN_SESSION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // The in-memory record still drives this page; persistence is best effort.
  }
}

function removeRecord(): void {
  fallbackRecord = null;
  const storage = sessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(LOGIN_SESSION_STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

function newSessionId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `login-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Call ONLY after the sign-in request has succeeded. Mints a genuinely new login and
 * resets the one-time briefing guard. Login is the only event allowed to do this.
 */
export function startDoctorLoginSession(doctorId: string): DoctorLoginSession {
  const record: DoctorLoginSession = {
    id: newSessionId(),
    doctorId,
    greetingAttempted: false,
    startedAt: new Date().toISOString(),
  };
  writeRecord(record);
  return record;
}

/** The current login session, or null when the doctor is not logged in. */
export function getDoctorLoginSession(doctorId?: string | null): DoctorLoginSession | null {
  const record = readRecord();
  if (!record) return null;
  if (doctorId && record.doctorId !== doctorId) return null;
  return record;
}

/**
 * Re-attach to an existing authenticated session (browser refresh or another tab).
 * This never mints a fresh login. If no record exists for that doctor — for example a
 * brand-new tab sharing an already authenticated Supabase session — the record is
 * created in the already-briefed state so restoration can never trigger a briefing.
 */
export function adoptRestoredDoctorSession(doctorId: string): DoctorLoginSession {
  const existing = getDoctorLoginSession(doctorId);
  if (existing) return existing;

  const record: DoctorLoginSession = {
    id: newSessionId(),
    doctorId,
    greetingAttempted: true,
    startedAt: new Date().toISOString(),
  };
  writeRecord(record);
  return record;
}

/**
 * Atomically claim the one automatic briefing for a login session.
 *
 * Returns true exactly once per login session. The flag is written synchronously before
 * the caller starts any asynchronous summary or TTS work, so a second render, effect or
 * auth callback can never duplicate the request.
 */
export function claimAutomaticGreeting(loginSessionId: string | null | undefined): boolean {
  if (!loginSessionId) return false;
  const record = readRecord();
  if (!record || record.id !== loginSessionId) return false;
  if (record.greetingAttempted) return false;

  writeRecord({ ...record, greetingAttempted: true });
  return true;
}

/** Logout: drop the login identity so the next sign-in is a new login session. */
export function clearDoctorLoginSession(): void {
  removeRecord();
}

/** Test-only: reset the no-storage fallback without touching an installed storage. */
export function resetDoctorLoginSessionFallbackForTests(): void {
  fallbackRecord = null;
}
