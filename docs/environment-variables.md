# Environment Variables

Every variable the repository reads, where it is set and what must never be public. Names and
empty placeholders only; no working value belongs in this file, `README`, Git history, a
screenshot or a chat message.

Template: `.env.example` at the repository root. All other `.env*` files are git-ignored.

---

## 1. Rules

1. A `VITE_` prefix means **baked into the browser bundle**. Only the public Supabase URL and
   the publishable/anon key may use it.
2. Secret/service-role keys and provider keys are **server-side only**: Supabase Function
   Secrets, never Vercel, never a `VITE_` variable.
3. Setting or changing a `VITE_` variable requires a new frontend build/deployment; function
   secrets take effect without a redeploy.
4. Never print a value in a script, log, screenshot or terminal transcript. Scripts in this
   repository check presence only.
5. Different environments use different values. A local key must never be reused in
   production, and a production secret must never be exported into a local test shell.

## 2. Browser-visible (Vercel / `.env.local`)

| Variable | Required | Value | Read by |
|---|---|---|---|
| `VITE_SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` (or `http://127.0.0.1:54321` locally) | frontend Supabase client |
| `VITE_SUPABASE_KEY` | yes | publishable key (`sb_publishable_…`) or legacy anon key | frontend Supabase client |

If either is empty the frontend falls back to mock mode. These two are the **only** browser
variables; the frontend is owned by the integration worktree, but the names are fixed by
`AGENTS.md` and must match everywhere.

Do not add `VITE_GROQ_KEY`, `VITE_GNANI_KEY`, `VITE_SERVICE_ROLE_KEY` or any equivalent.
There is no browser-side provider call.

## 3. Supabase Function Secrets (server-side)

Set with `supabase secrets set NAME=value` or Dashboard → Project Settings → Edge Functions
→ Secrets.

| Variable | Required | Purpose | Read by | Fallback when absent |
|---|---|---|---|---|
| `GROQ_API_KEY` | for adaptive AI | department suggestion and adaptive question selection | `supabase/functions/chat-turn/index.ts` | deterministic scripted selection |
| `GNANI_API_KEY` | for voice | Prisma STT and Timbre TTS (one key for both) | `chat-turn/index.ts`, `speak/index.ts` | editable text intake; question shown as text |
| `ALLOWED_ORIGINS` | for correctness | comma-separated exact browser origins | both function entry points | non-local origins refused; local origins still allowed |

`ALLOWED_ORIGINS` accepts no wildcard and no trailing slash. It is not an authorisation
control on this platform (`docs/cors-verification.md`); do not weaken JWT/RLS to compensate.

Verify names without printing values:

```bash
supabase secrets list
```

## 4. Local provider-stub overrides (never production)

| Variable | Purpose | Production |
|---|---|---|
| `GROQ_BASE_URL` | point the Groq adapter at `supabase/tests/stub-providers.ts` | must be unset |
| `PRISMA_BASE_URL` | point the Prisma adapter at the stub | must be unset |
| `TIMBRE_ENDPOINT` | point the Timbre adapter at the stub | must be unset |

`scripts/verify-deploy-config.ts` asserts that no stub endpoint override is present in a
production configuration. Leaving one set would send synthetic traffic to a local port and
disable a real provider path.

## 5. Local test and operations only

These belong in a local shell or an untracked env file. They are never set in Vercel or in a
deployed function.

| Variable | Used by | Notes |
|---|---|---|
| `LOCAL_URL` | smoke, verification, retention, doctor-mapping scripts | defaults to `http://127.0.0.1:54321` |
| `LOCAL_SERVICE_KEY` | scripts and SQL harnesses | local service key only; `npx supabase status -o env` prints it |
| `LOCAL_ANON_KEY` | HTTP smoke tests | local anon/publishable key only |
| `STUB_URL` | preflight and integration runs | default `http://127.0.0.1:8787` |
| `PROVIDER_MODE` | preflight, smoke | `stub` (default) or explicitly live |
| `MIGRATIONS_DIR` | preflight | defaults to `supabase/migrations` |
| `DOCTOR_GM_UID` | `scripts/map-doctor-profiles.ts` | General Medicine Auth UID |
| `DOCTOR_EM_UID` | `scripts/map-doctor-profiles.ts` | Emergency Auth UID |
| `BANK_REVIEW_CSV` | question-bank review importer | path to the owner-reviewed CSV |
| `DB_CONTAINER` | database rehearsal | defaults to the local Supabase container |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | owner-side admin scripts | never browser values; never committed |
| `PROVIDER_REPORT` | provider verification harness | output path for the result JSON |

Getting the local keys:

```bash
npx supabase status -o env
```

Use `SERVICE_ROLE_KEY` / secret-key output only in the current shell. Never paste it into a
file that Git tracks, and never export it while a production command is in the same shell.

## 6. Edge Function runtime variables

The Supabase platform injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (or the project's secret-key equivalent) and the request JWT
context into the function runtime. The code reads the user's identity from verified claims
and uses the platform-provided server client; it never accepts these values from the request
body. Do not add them to Vercel.

## 7. Where each value is configured

| Environment | Dashboard / command |
|---|---|
| Local stack | `npx supabase start`; keys via `npx supabase status -o env` |
| Local functions | `npx supabase functions serve --env-file supabase/functions/.env` |
| Hosted functions | `supabase secrets set …` / Dashboard → Edge Functions → Secrets |
| Hosted frontend | Vercel → Project → Settings → Environment Variables (Production) |
| Local frontend | untracked `.env.local` |

`supabase/functions/.env` is git-ignored. `.env.example` is the only tracked env file and
contains names only.

## 8. Verification

```bash
# 1. Configuration presence; prints no secret values
deno run --allow-read --allow-env --allow-net --allow-run --allow-write scripts/verify-deploy-config.ts

# 2. Secret names visible, values not
supabase secrets list

# 3. No secret-shaped value in tracked files
git grep -nE 'sb_secret_|sk-[A-Za-z0-9]{20,}' -- . ':!*.example' || true

# 4. Bundle contains no secret key
npm run build
grep -c "sb_secret_" dist/assets/*.js     # expect 0

# 5. Auth is enforced (not a CORS problem)
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<project-ref>.supabase.co/functions/v1/chat-turn" \
  -X POST -H "content-type: application/json" -d '{"action":"start_session"}'
# expect 401
```

## 9. Rotation and incident response

1. Rotate the exposed value at the provider (Groq or Gnani) first, then update the Supabase
   secret.
2. Rotate the Supabase secret key from the Dashboard if it was exposed; update any
   owner-side script environment.
3. Redeploy nothing for function secrets; redeploy the frontend only if a `VITE_` value
   changed.
4. Check `supabase secrets list` and the Vercel environment for stale duplicates.
5. Record the rotation privately. Never place the new value in the repository to "document"
   it.

## 10. Naming audit — verified against the source on 3 November 2026 (commit `dbe2e25`)

Every name the application reads, with its read site. No other environment name exists.

| Name | Read at | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts:12-14` | build-time constant baked into the browser bundle |
| `VITE_SUPABASE_KEY` | `src/lib/supabase.ts:17-19` | **the only** frontend key name; there is no `VITE_SUPABASE_ANON_KEY` and no `VITE_SUPABASE_PUBLISHABLE_KEY` anywhere in the repository |
| `GROQ_API_KEY` | `supabase/functions/chat-turn/index.ts:185,308,337` | server-only |
| `GNANI_API_KEY` | `chat-turn/index.ts:639` (Prisma), `speak/index.ts:156` (Timbre) | one key for STT and TTS; server-only |
| `ALLOWED_ORIGINS` | `chat-turn/index.ts:94`, `speak/index.ts:32` | server-only |
| `GROQ_BASE_URL`, `PRISMA_BASE_URL`, `TIMBRE_ENDPOINT` | `chat-turn/index.ts:191,308,344,649`, `speak/index.ts:163` | local stub overrides only; must be unset in production |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (or the project's secret-key equivalent) | not read explicitly — injected by the platform and consumed by `withSupabase` from `@supabase/server` | never set these by hand and never put them in Vercel |

`@supabase/server@1` (`supabase/functions/deno.json`) provides `withSupabase({ auth: "user" })`,
which supplies the JWT-scoped client and the elevated server client. The functions read the
caller's identity only from verified claims, never from the request body.

### 10.1 Publishable-key compatibility

Verified by code inspection, not by a live call. `src/lib/supabase.ts` passes
`VITE_SUPABASE_KEY` straight to `createClient(url, key)` from `@supabase/supabase-js@^2.118.0`.
That SDK accepts either the publishable key (`sb_publishable_…`) or the legacy `anon` JWT and
sends it as the `apikey` header, so the collected publishable key needs no rename and no
format change. The code validates only the URL (`startsWith('http')`, no `placeholder`), so no
key-shape assumption is baked in.

Two preconditions live outside the code and cannot be checked offline:

1. the value must be the **publishable** key — never `sb_secret_…` and never a
   `service_role` JWT;
2. anonymous sign-ins must be enabled on the hosted project, because
   `src/lib/api.ts:843,894` calls `auth.signInAnonymously()`. It is enabled for the local
   stack only (`supabase/config.toml:179`, `enable_anonymous_sign_ins = true`).
