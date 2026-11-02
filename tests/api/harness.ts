/**
 * Real local Supabase harness for tests/api/**.
 *
 * Nothing here is mocked. The suite talks to the running local stack:
 *   - `supabase start`            (Postgres, Auth, PostgREST, Kong)
 *   - `supabase functions serve`  (real chat-turn + speak Edge Functions)
 *   - `deno run supabase/tests/stub-providers.ts 8787`  (provider stub only)
 *
 * Safety:
 *   - The base URL must be localhost/127.0.0.1. The harness refuses anything else, so a
 *     stray environment variable can never point a destructive helper at a remote project.
 *   - Cleanup deletes only the anonymous identities this process created. Nothing is
 *     truncated or reset globally.
 *   - The daily-usage limits are read-only unless the local counters are already at or
 *     above their limit (which makes every start_session return demo_busy). In that case
 *     the harness raises only the `sessions` limit locally, remembers the original value
 *     and restores it in `after()`.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface LocalConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
  stubUrl: string;
  doctorPassword: string;
  doctorEmail: Record<'general_medicine' | 'emergency', string>;
}

function fromSupabaseCli(): Record<string, string> {
  // The local stack belongs to the backend worktree; the integration worktree has no
  // supabase/ directory of its own. Try the current directory, then the sibling
  // backend worktree, then an explicit override.
  const candidates = [
    process.env.SUPABASE_DIR,
    process.cwd(),
    path.resolve(process.cwd(), '..', 'samvad-backend'),
  ].filter(Boolean) as string[];

  for (const cwd of candidates) {
    try {
      const output = execSync('npx supabase@latest status -o env', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
        timeout: 120_000,
      });
      const env: Record<string, string> = {};
      for (const line of output.split('\n')) {
        const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
        if (match) env[match[1]] = match[2];
      }
      if (env.API_URL) return env;
    } catch {
      // try the next candidate
    }
  }
  return {};
}

function assertLocal(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid Supabase URL: ${url}`);
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `Refusing to run the local API suite against ${url}. Only a local stack is allowed.`,
    );
  }
}

/**
 * Loads the local stack configuration and, when they are not already set, publishes the
 * two browser variables that `src/lib/supabase.ts` reads at module load.
 *
 * Must run before `src/lib/api.ts` is imported.
 */
export function loadLocalConfig(): LocalConfig {
  const cli = fromSupabaseCli();

  const url = process.env.VITE_SUPABASE_URL || cli.API_URL || '';
  const anonKey = process.env.VITE_SUPABASE_KEY || cli.PUBLISHABLE_KEY || cli.ANON_KEY || '';
  const serviceKey = process.env.LOCAL_SERVICE_KEY || cli.SECRET_KEY || cli.SERVICE_ROLE_KEY || '';

  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      [
        'Local Supabase configuration is missing.',
        'Start the stack and export the keys:',
        '  npx supabase@latest start',
        '  eval "$(npx supabase@latest status -o env | sed \'s/^/export /\')"',
        '  export VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_KEY="$PUBLISHABLE_KEY"',
        '  export LOCAL_SERVICE_KEY="$SECRET_KEY"   # or SERVICE_ROLE_KEY',
      ].join('\n'),
    );
  }
  if (anonKey === serviceKey) {
    throw new Error('LOCAL_SERVICE_KEY must not be the browser key.');
  }

  assertLocal(url);

  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_KEY = anonKey;

  return {
    url,
    anonKey,
    serviceKey,
    stubUrl: process.env.STUB_URL || 'http://127.0.0.1:8787',
    doctorPassword: process.env.API_TEST_DOCTOR_PASSWORD || 'local-test-password',
    doctorEmail: {
      general_medicine: process.env.API_TEST_GM_EMAIL || 'doctor-gm@rls.test',
      emergency: process.env.API_TEST_EM_EMAIL || 'doctor-em@rls.test',
    },
  };
}

/** ISO date for "today" in Asia/Kolkata, matching the server-side counter bucket. */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export class LocalStack {
  readonly config: LocalConfig;
  private createdUsers = new Set<string>();
  private originalSessionLimit: number | null = null;
  private currentSessionLimit: number | null = null;

  constructor(config: LocalConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------- REST helpers

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.config.serviceKey,
      authorization: `Bearer ${this.config.serviceKey}`,
      'content-type': 'application/json',
      ...extra,
    };
  }

  async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.url}/rest/v1/${path}`, {
      ...init,
      headers: this.headers((init.headers as Record<string, string>) ?? {}),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`REST ${path} failed (${response.status}): ${text}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  async adminUsers(): Promise<Array<{ id: string; email?: string; is_anonymous: boolean }>> {
    const response = await fetch(
      `${this.config.url}/auth/v1/admin/users?per_page=200`,
      { headers: this.headers() },
    );
    const body = (await response.json()) as {
      users?: Array<{ id: string; email?: string; is_anonymous?: boolean }>;
    };
    return (body.users ?? []).map((user) => ({
      id: user.id,
      email: user.email,
      is_anonymous: Boolean(user.is_anonymous),
    }));
  }

  // ---------------------------------------------------------------- provider stub

  async stubStats(): Promise<Record<string, number>> {
    const response = await fetch(`${this.config.stubUrl}/__stats`);
    if (!response.ok) throw new Error('Local provider stub is not reachable');
    return (await response.json()) as Record<string, number>;
  }

  async stubControl(patch: Record<string, string>): Promise<void> {
    const response = await fetch(`${this.config.stubUrl}/__control`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(`stub control failed: ${response.status}`);
  }

  /** Fails closed when the stub is down: provider traffic must never reach a real API. */
  async requireStub(): Promise<void> {
    const stats = await this.stubStats();
    if (typeof stats.groqCalls !== 'number') {
      throw new Error(`${this.config.stubUrl} does not look like the local provider stub`);
    }
  }

  // ---------------------------------------------------------------- usage limits

  async ensureSessionHeadroom(buffer = 80): Promise<void> {
    await this.requireStub();
    const [limits, counters] = await Promise.all([
      this.rest<Array<{ counter_name: string; daily_limit: number }>>(
        'daily_usage_limits?select=counter_name,daily_limit',
      ),
      this.rest<Array<{ counter_name: string; used: number }>>(
        `daily_usage_counters?select=counter_name,used&counter_date=eq.${istToday()}`,
      ),
    ]);
    const limit = limits.find((row) => row.counter_name === 'sessions');
    if (!limit) throw new Error('daily_usage_limits has no sessions row');
    const used = counters.find((row) => row.counter_name === 'sessions')?.used ?? 0;

    this.originalSessionLimit = limit.daily_limit;
    if (used < limit.daily_limit) {
      this.currentSessionLimit = limit.daily_limit;
      return;
    }
    this.currentSessionLimit = used + buffer;
    await this.setSessionLimit(this.currentSessionLimit);
  }

  /** Local-only: used by the demo_busy scenario and by headroom setup. */
  async setSessionLimit(value: number): Promise<void> {
    await this.rest('daily_usage_limits?counter_name=eq.sessions', {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ daily_limit: value }),
    });
    this.currentSessionLimit = value;
  }

  async sessionUsage(): Promise<{ used: number; limit: number }> {
    const [limits, counters] = await Promise.all([
      this.rest<Array<{ daily_limit: number }>>(
        'daily_usage_limits?select=daily_limit&counter_name=eq.sessions',
      ),
      this.rest<Array<{ used: number }>>(
        `daily_usage_counters?select=used&counter_date=eq.${istToday()}&counter_name=eq.sessions`,
      ),
    ]);
    return { used: counters[0]?.used ?? 0, limit: limits[0]?.daily_limit ?? 0 };
  }

  async restoreSessionLimit(): Promise<void> {
    if (this.originalSessionLimit !== null) {
      await this.setSessionLimit(this.originalSessionLimit);
      this.originalSessionLimit = null;
    }
  }

  // ---------------------------------------------------------------- identities

  /** A real anonymous Supabase user plus a client bound to it. */
  async createPatient(): Promise<{ client: SupabaseClient; userId: string; token: string }> {
    const client = createClient(this.config.url, this.config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.user || !data.session) {
      throw new Error(`Anonymous sign-in failed: ${error?.message ?? 'no user'}`);
    }
    this.createdUsers.add(data.user.id);
    return { client, userId: data.user.id, token: data.session.access_token };
  }

  /** A real doctor identity, signed in with email + password. */
  async signInDoctor(
    department: 'general_medicine' | 'emergency',
  ): Promise<{ client: SupabaseClient; token: string; email: string; doctorId: string }> {
    const email = this.config.doctorEmail[department];
    const client = createClient(this.config.url, this.config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: this.config.doctorPassword,
    });
    if (error || !data.session) {
      throw new Error(
        [
          `Doctor sign-in failed for ${email}: ${error?.message ?? 'no session'}`,
          'This suite uses the documented local doctor identities (supabase/tests/README.md).',
          'Create them on the local stack or set API_TEST_GM_EMAIL / API_TEST_EM_EMAIL',
          'and API_TEST_DOCTOR_PASSWORD.',
        ].join('\n'),
      );
    }

    const profiles = await this.rest<Array<{ doctor_id: string }>>(
      `doctor_profiles?select=doctor_id&user_id=eq.${data.user.id}`,
    );
    if (!profiles.length) {
      throw new Error(`${email} has no doctor_profiles mapping on the local stack`);
    }
    return {
      client,
      token: data.session.access_token,
      email,
      doctorId: profiles[0].doctor_id,
    };
  }

  /** Deletes only identities this process created; cascades remove their own rows. */
  async cleanup(): Promise<void> {
    for (const userId of this.createdUsers) {
      await fetch(`${this.config.url}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: this.headers(),
      }).catch(() => undefined);
    }
    this.createdUsers.clear();
    await this.restoreSessionLimit();
  }

  // ---------------------------------------------------------------- raw HTTP

  /** Direct Edge Function call, for cases the typed API cannot express (bad JWT, …). */
  async invokeRaw(
    functionName: 'chat-turn' | 'speak',
    body: unknown,
    token?: string,
  ): Promise<{ status: number; body: unknown; headers: Headers }> {
    const response = await fetch(`${this.config.url}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: token ? this.config.anonKey : this.config.serviceKey,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // leave as text (audio)
    }
    return { status: response.status, body: parsed, headers: response.headers };
  }
}

export const ANSWER = {
  name: 'Asha API Test',
  age: '34',
  gender: 'Prefer not to say',
  primary_concern: 'knee pain when walking upstairs',
  duration: 'about three weeks',
  severity: 'moderate',
  conditions: 'none',
  medications: 'none',
  allergies: 'none known',
  other_symptoms: 'mild swelling around the knee',
} as const;
