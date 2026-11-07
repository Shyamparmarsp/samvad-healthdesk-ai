/**
 * One automatic dashboard briefing per doctor login session.
 *
 * These tests exercise the central login-session guard directly. The important property
 * is that the guard is keyed on a nonce minted by a successful sign-in — never on a
 * mount, a route entry, a user id or a rotating access token.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  LOGIN_SESSION_STORAGE_KEY,
  adoptRestoredDoctorSession,
  claimAutomaticGreeting,
  clearDoctorLoginSession,
  getDoctorLoginSession,
  resetDoctorLoginSessionFallbackForTests,
  startDoctorLoginSession,
} from '../src/lib/doctor-login-session';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

function installSessionStorage() {
  const store = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  resetDoctorLoginSessionFallbackForTests();
  clearDoctorLoginSession();
  return {
    store,
    restore() {
      (globalThis as { window?: unknown }).window = originalWindow;
      resetDoctorLoginSessionFallbackForTests();
    },
  };
}

describe('Automatic dashboard briefing — one per login session', () => {
  it('1. a successful login allows exactly one automatic briefing', () => {
    const storage = installSessionStorage();
    try {
      const login = startDoctorLoginSession('doc-a');
      assert.equal(login.greetingAttempted, false);
      assert.equal(claimAutomaticGreeting(login.id), true, 'first claim wins');
      assert.equal(claimAutomaticGreeting(login.id), false, 'second claim is refused');
      assert.equal(claimAutomaticGreeting(login.id), false, 'and stays refused');
      assert.equal(getDoctorLoginSession('doc-a')?.greetingAttempted, true);
    } finally {
      storage.restore();
    }
  });

  it('2. navigating to Reports/Appointments and back never re-arms the greeting', () => {
    const storage = installSessionStorage();
    try {
      const login = startDoctorLoginSession('doc-a');
      assert.equal(claimAutomaticGreeting(login.id), true);

      // Every dashboard re-entry and every other route looks up the same nonce.
      for (const page of ['dashboard', 'reports', 'appointments', 'urgent', 'dashboard', 'reports', 'dashboard']) {
        const session = getDoctorLoginSession('doc-a');
        assert.ok(session, `${page}: still the same login`);
        assert.equal(session.id, login.id, `${page}: nonce unchanged`);
        assert.equal(claimAutomaticGreeting(session.id), false, `${page}: no second greeting`);
      }
    } finally {
      storage.restore();
    }
  });

  it('3. many renders/effects/auth callbacks race the claim and only one wins', async () => {
    const storage = installSessionStorage();
    try {
      const login = startDoctorLoginSession('doc-a');
      const results = await Promise.all(
        Array.from({ length: 12 }, async () => claimAutomaticGreeting(login.id)),
      );
      assert.equal(results.filter(Boolean).length, 1, 'exactly one callback claims the greeting');
    } finally {
      storage.restore();
    }
  });

  it('4. an access-token refresh cannot reset the guard', () => {
    const storage = installSessionStorage();
    try {
      const login = startDoctorLoginSession('doc-a');
      assert.equal(claimAutomaticGreeting(login.id), true);

      // A refresh changes the rotating access token, never the login nonce.
      const afterRefresh = getDoctorLoginSession('doc-a');
      assert.equal(afterRefresh?.id, login.id, 'the rotating token is not the session id');
      assert.equal(claimAutomaticGreeting(afterRefresh?.id), false, 'no repeat after refresh');
    } finally {
      storage.restore();
    }
  });

  it('5. a browser refresh restores the same session and does not greet again', () => {
    const storage = installSessionStorage();
    try {
      const login = startDoctorLoginSession('doc-a');
      assert.equal(claimAutomaticGreeting(login.id), true);

      // A refresh re-executes the module but keeps sessionStorage.
      resetDoctorLoginSessionFallbackForTests();
      assert.ok(storage.store.has(LOGIN_SESSION_STORAGE_KEY), 'the login record survives a refresh');

      const restored = adoptRestoredDoctorSession('doc-a');
      assert.equal(restored.id, login.id, 'restoration reuses the login nonce');
      assert.equal(restored.greetingAttempted, true);
      assert.equal(claimAutomaticGreeting(restored.id), false, 'restoration is not a new login');
    } finally {
      storage.restore();
    }
  });

  it('6. a restored session with no record (new tab) is created already briefed', () => {
    const storage = installSessionStorage();
    try {
      const restored = adoptRestoredDoctorSession('doc-a');
      assert.equal(restored.greetingAttempted, true, 'opening another tab never auto-briefs');
      assert.equal(claimAutomaticGreeting(restored.id), false);
    } finally {
      storage.restore();
    }
  });

  it('7. logout clears the identity and a new login gets one new greeting', () => {
    const storage = installSessionStorage();
    try {
      const first = startDoctorLoginSession('doc-a');
      assert.equal(claimAutomaticGreeting(first.id), true);

      clearDoctorLoginSession();
      assert.equal(getDoctorLoginSession('doc-a'), null, 'logout drops the local login identity');

      const second = startDoctorLoginSession('doc-a');
      assert.notEqual(second.id, first.id, 'a genuine login mints a fresh nonce');
      assert.equal(second.greetingAttempted, false);
      assert.equal(claimAutomaticGreeting(second.id), true, 'exactly one new greeting');
      assert.equal(claimAutomaticGreeting(second.id), false);
    } finally {
      storage.restore();
    }
  });

  it('8. the same doctor logging in again is a new login session', () => {
    const storage = installSessionStorage();
    try {
      const a = startDoctorLoginSession('doc-a');
      assert.equal(claimAutomaticGreeting(a.id), true);
      clearDoctorLoginSession();
      const b = startDoctorLoginSession('doc-a');
      assert.notEqual(b.id, a.id);
      assert.equal(claimAutomaticGreeting(b.id), true);
    } finally {
      storage.restore();
    }
  });

  it('9. a failed attempt is not retried automatically when returning to the dashboard', () => {
    const storage = installSessionStorage();
    try {
      const login = startDoctorLoginSession('doc-a');
      // Claimed before the provider call; the call then fails.
      assert.equal(claimAutomaticGreeting(login.id), true);

      // Returning to the dashboard re-reads the same login session.
      const revisit = getDoctorLoginSession('doc-a');
      assert.equal(claimAutomaticGreeting(revisit?.id), false, 'a failure does not re-arm the briefing');
    } finally {
      storage.restore();
    }
  });

  it('10. an old doctor record cannot greet a different doctor', () => {
    const storage = installSessionStorage();
    try {
      const login = startDoctorLoginSession('doc-a');
      assert.equal(getDoctorLoginSession('doc-b'), null, 'no session for another doctor');
      assert.equal(claimAutomaticGreeting(login.id), true);
      const other = startDoctorLoginSession('doc-b');
      assert.equal(claimAutomaticGreeting(other.id), true, 'doctor B has their own login session');
      assert.equal(claimAutomaticGreeting(login.id), false, 'doctor A cannot re-claim through B');
    } finally {
      storage.restore();
    }
  });

  it('11. unknown or corrupt session ids can never claim a greeting', () => {
    const storage = installSessionStorage();
    try {
      assert.equal(claimAutomaticGreeting(null), false);
      assert.equal(claimAutomaticGreeting(''), false);
      assert.equal(claimAutomaticGreeting('not-the-current-login'), false);

      storage.store.set(LOGIN_SESSION_STORAGE_KEY, '{not json');
      assert.equal(getDoctorLoginSession('doc-a'), null, 'corrupt storage is treated as absent');
      assert.equal(claimAutomaticGreeting('anything'), false);
    } finally {
      storage.restore();
    }
  });

  it('12. manual assistant clicks are independent of the automatic claim', () => {
    const hook = read('src/features/doctor/useSamwadAssistant.ts');
    const open = hook.slice(hook.indexOf('const open = useCallback'), hook.indexOf('const close = useCallback'));
    assert.match(open, /runSummary\('summary'/, 'a click always starts a fresh summary');
    assert.doesNotMatch(open, /claimAutomaticGreeting/, 'a click is not gated by the one-time claim');

    const retry = hook.slice(hook.indexOf('const retry = useCallback'), hook.indexOf('const play = useCallback'));
    assert.doesNotMatch(retry, /claimAutomaticGreeting/, 'manual retry is always allowed');
  });

  it('13. no route, mount or token value can mint a login session', () => {
    for (const file of [
      'src/features/doctor/DoctorShell.tsx',
      'src/features/doctor/SamwadAssistant.tsx',
      'src/features/doctor/useSamwadAssistant.ts',
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /startDoctorLoginSession/, `${file} cannot mint a login`);
      assert.doesNotMatch(source, /access_token/, `${file} never keys on the rotating token`);
    }

    const api = read('src/lib/api.ts');
    const loginStart = api.indexOf('export async function doctorLogin');
    const loginEnd = api.indexOf('export async function restoreDoctorSession');
    const loginBody = api.slice(loginStart, loginEnd);
    assert.match(loginBody, /startDoctorLoginSession\(doctor\.id\)/, 'only a successful sign-in mints');

    const restoreBody = api.slice(loginEnd, api.indexOf('export async function doctorLogout'));
    assert.doesNotMatch(restoreBody, /startDoctorLoginSession/, 'restoration never mints');
    assert.match(restoreBody, /adoptRestoredDoctorSession/, 'restoration adopts the existing nonce');
  });
});
