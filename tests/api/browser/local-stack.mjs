/**
 * Local stack helpers for the browser journeys.
 *
 * Resolves the local Supabase configuration the same way tests/api/harness.ts does,
 * and provides service-key REST access for fixture verification and self-only cleanup.
 * Refuses any non-local target.
 */

import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function fromSupabaseCli() {
  const candidates = [
    process.env.SUPABASE_DIR,
    resolve(HERE, '../../../..'),
    resolve(HERE, '../../../../samvad-backend'),
    process.cwd(),
  ].filter(Boolean);

  for (const cwd of candidates) {
    try {
      const output = execSync('npx supabase@latest status -o env', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
        timeout: 120_000,
      });
      const env = {};
      for (const line of output.split('\n')) {
        const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
        if (match) env[match[1]] = match[2];
      }
      if (env.API_URL) return env;
    } catch {
      // try next
    }
  }
  return {};
}

export function loadConfig() {
  const cli = fromSupabaseCli();
  const url = process.env.VITE_SUPABASE_URL || cli.API_URL || '';
  const anonKey = process.env.VITE_SUPABASE_KEY || cli.PUBLISHABLE_KEY || cli.ANON_KEY || '';
  const serviceKey = process.env.LOCAL_SERVICE_KEY || cli.SECRET_KEY || cli.SERVICE_ROLE_KEY || '';

  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      'Local Supabase configuration missing. Start the stack and/or export VITE_SUPABASE_URL, VITE_SUPABASE_KEY, LOCAL_SERVICE_KEY.',
    );
  }
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing to run browser journeys against ${url}: local stack only.`);
  }

  return {
    url,
    anonKey,
    serviceKey,
    doctorEmail: process.env.API_TEST_GM_EMAIL || 'doctor-gm@rls.test',
    doctorEmergencyEmail: process.env.API_TEST_EM_EMAIL || 'doctor-em@rls.test',
    doctorPassword: process.env.API_TEST_DOCTOR_PASSWORD || 'local-test-password',
    previewPort: Number(process.env.PREVIEW_PORT || 4180),
  };
}

export function istToday() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createRest(config) {
  const headers = {
    apikey: config.serviceKey,
    authorization: `Bearer ${config.serviceKey}`,
    'content-type': 'application/json',
  };

  return async function rest(path, init = {}) {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`REST ${path} failed (${response.status}): ${text}`);
    return text ? JSON.parse(text) : null;
  };
}

export async function anonymousIds(config) {
  const ids = new Set();
  for (let page = 1; page <= 5; page += 1) {
    const response = await fetch(
      `${config.url}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers: { apikey: config.serviceKey, authorization: `Bearer ${config.serviceKey}` } },
    );
    if (!response.ok) throw new Error('admin users list failed');
    const body = await response.json();
    const users = body.users || [];
    for (const user of users) if (user.is_anonymous) ids.add(user.id);
    if (users.length < 200) break;
  }
  return ids;
}

export async function deleteIdentities(config, ids) {
  let failed = 0;
  for (const id of ids) {
    const response = await fetch(`${config.url}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: { apikey: config.serviceKey, authorization: `Bearer ${config.serviceKey}` },
    });
    if (!response.ok) failed += 1;
  }
  return failed;
}

/** Ensures the session counter has headroom so a browser journey is not demo_busy. */
export async function ensureSessionHeadroom(config, rest, buffer = 40) {
  const limits = await rest('daily_usage_limits?select=counter_name,daily_limit');
  const counters = await rest(
    `daily_usage_counters?select=counter_name,used&counter_date=eq.${istToday()}`,
  );
  const limit = limits.find((row) => row.counter_name === 'sessions');
  const used = counters.find((row) => row.counter_name === 'sessions')?.used ?? 0;
  if (!limit) throw new Error('daily_usage_limits has no sessions row');
  if (used < limit.daily_limit) return { original: limit.daily_limit, changed: false };

  await rest('daily_usage_limits?counter_name=eq.sessions', {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ daily_limit: used + buffer }),
  });
  return { original: limit.daily_limit, changed: true };
}

export async function restoreSessionLimit(config, rest, original) {
  if (original === null) return;
  await rest('daily_usage_limits?counter_name=eq.sessions', {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ daily_limit: original }),
  });
}
