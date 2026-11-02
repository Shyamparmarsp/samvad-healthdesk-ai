# Provider Verification Runbook

**Status:** engineering harness complete; **no live provider call has been made**. All
contracts below are taken from the committed adapters, not guessed:

| Provider | Adapter |
|---|---|
| Groq constrained reasoning | `supabase/functions/_shared/groq.ts` |
| Gnani Prisma STT | `supabase/functions/_shared/prisma.ts` |
| Gnani Timbre TTS | `supabase/functions/_shared/timbre.ts` |

Companion documents: `docs/provider-notes.md` (verified provider facts),
`docs/provider-activation-checklist.md` (owner activation), `docs/environment-variables.md`
(secret matrix), `docs/backend-deployment-runbook.md` (hosted deployment).

---

## 1. Actual API contracts

### 1.1 Groq — constrained reasoning

| Item | Value |
|---|---|
| Endpoint | `POST https://api.groq.com/openai/v1/chat/completions` |
| Auth | `Authorization: Bearer <GROQ_API_KEY>` |
| Model | `openai/gpt-oss-20b` (default in the adapter) |
| Request | JSON `{ model, messages: [{role:"system",content},{role:"user",content}], response_format: { type:"json_schema", json_schema:{ name, strict:true, schema } } }` |
| Structured output | `response_format.json_schema` with `strict: true`; no streaming, no tools |
| Response | `choices[0].message.content` is a JSON string; parsed and then runtime-validated |
| Timeout | Client-side **8,000 ms** default (`DEFAULT_TIMEOUT_MS`); caller may override |
| Retry | **None.** The caller owns the scripted/deterministic fallback |
| Failure kinds | `config`, `timeout`, `network`, `auth`, `rate_limited`, `invalid_request`, `server`, `invalid_output` |
| Security | Provider body is never copied into the failure result; only the enum and HTTP status |

The smoke probe uses a fixed schema with literal `marker: "synthetic-ok"` and
`urgent: false`, so a successful call proves both authentication and constrained parsing.
A `401/403` is reported as an auth failure; a 2xx with malformed/extra-field JSON is reported
separately as a parsing failure.

### 1.2 Gnani Prisma — speech to text

| Item | Value |
|---|---|
| Endpoint | `POST https://api.vachana.ai/stt/v3` |
| Auth | `X-API-Key-ID: <GNANI_API_KEY>` |
| Body | `multipart/form-data`: `audio_file` (blob with filename extension), `language_code` |
| Language | `en-IN` or `hi-IN` (one code for v2.5) |
| Model | **Omitted** so the service uses Prisma v2.5; the response reports `prisma-v2.5` |
| Accepted containers | WAV, MP3, OGG, FLAC, AAC, M4A. **WebM is not accepted** and is refused before any request |
| Max duration | 30 s (documented); the app records at most 30 s |
| Response | `{ success: true, transcript: string, model, request_id? }`; an empty transcript is a **success** (`no speech`) |
| Timeout | Client-side **20,000 ms** default |
| Retry | **None**; ambiguous outcomes use the text fallback |
| Failure kinds | `config`, `unsupported_format`, `timeout`, `network`, `auth`, `rate_limited`, `audio_rejected`, `provider_error`, `invalid_response` |

### 1.3 Gnani Timbre — text to speech

| Item | Value |
|---|---|
| Endpoint | `POST https://api.vachana.ai/api/v1/tts/inference` |
| Auth | `X-API-Key-ID: <GNANI_API_KEY>` |
| Request | JSON `{ text, voice, model:"timbre-v2.5", language, speed:1.0, audio_config:{ sample_rate:24000, num_channels:1, sample_width:2, encoding:"linear_pcm", container:"mp3" } }` |
| Model | **Explicitly `timbre-v2.5`**; v2.0 is deprecated and SDK defaults must not be trusted |
| Voices | `Nalini` for `hi-IN`, `Kaveri` for `en-IN` (model-specific) |
| Max text | 600 characters (self-imposed guard; provider maximum is undocumented; over-long text can return 500) |
| Response | Raw binary audio; provider content type (normally `audio/mpeg`) |
| Timeout | Client-side **15,000 ms** default |
| Retry | **None**; any failure returns the approved question as text |
| Failure kinds | `config`, `invalid_text`, `timeout`, `network`, `auth`, `rate_limited`, `invalid_request`, `provider_error`, `invalid_response` |

The adapter rejects an empty audio body as `invalid_response`. The harness additionally
checks the MP3 signature (ID3 or MPEG frame sync) before calling the audio valid.

---

## 2. Environment variables

| Variable | Used by | Required for live smoke |
|---|---|---|
| `GROQ_API_KEY` | `groq.ts` / `chat-turn` | yes, Groq checks |
| `GNANI_API_KEY` | `prisma.ts` and `timbre.ts` (one Gnani key for both) | yes, Prisma/Timbre checks |
| `GROQ_BASE_URL` | local stub override only | **must be unset for live** |
| `PRISMA_BASE_URL` | local stub override only | **must be unset for live** |
| `TIMBRE_ENDPOINT` | local stub override only | **must be unset for live** |

Hosted functions use Supabase Function Secrets with the same names. The harness refuses to
run live if any stub override is set, so a stub cannot be mistaken for a paid provider.

Keys are read from the environment only. `scripts/provider-smoke.ts` rejects
`--key`, `--api-key`, `--token`, `--secret` and `--password` before any request. No key
value, prefix, suffix, length, header or provider body is printed.

---

## 3. Cost and safety controls

- **No live call is automatic.** The default command is non-live and makes zero requests.
- Live mode requires the explicit `--live` flag **and** the relevant key(s).
- A full run with `--provider all` makes at most **4 paid requests**:
  1 Groq constrained completion, 1 Prisma transcription, 2 Timbre syntheses (English + Hindi).
- There are **no retries** in the adapters. A failure consumes at most the one attempt.
- Exact prices are **not known from the code** and are not estimated here. Check the Groq
  and Gnani dashboards/quotas before running; programme credits are not a call count.
- The manual cached-audio reservation in `docs/provider-notes.md` is separate and must not
  be used by this harness.
- Synthetic input only: a fixed synthetic sentence and 1 s of silent WAV. No real patient
  text, transcript or audio is read, logged or written.
- TTS clips are written under `.provider-audio/` (git-ignored) for owner listening. Never
  commit them. Use `--out-dir` to place them elsewhere outside the repository.

---

## 4. Local provider smoke testing

### 4.1 Non-live readiness check (safe; no requests)

```bash
deno run --allow-env --allow-read --allow-write --allow-net scripts/provider-smoke.ts
```

It prints `present`/`MISSING` for the five relevant variables and the checks that live mode
would run. No request, no file, exit 0.

The existing harness remains available:

```bash
deno run --allow-env supabase/tests/provider-verification.ts
```

It also defaults to non-live and writes `provider-verification-result.json` with
`mode: non-live`, `externalRequests: 0`.

### 4.2 Live Groq only

```bash
export GROQ_API_KEY='…'          # never put this in a command line or the repository
deno run --allow-env --allow-net scripts/provider-smoke.ts --live --provider groq
```

Pass criteria:

- **credentials/connectivity PASS** — HTTP request authenticated;
- **constrained response parsing PASS** — exact `{marker:"synthetic-ok",urgent:false}`.

`auth FAIL` means the key was rejected. `parsing FAIL` with connectivity PASS means the key
worked but the model returned invalid/extra JSON; do not call that a credential failure.

### 4.3 Live Prisma only

```bash
export GNANI_API_KEY='…'
deno run --allow-env --allow-net scripts/provider-smoke.ts --live --provider prisma
```

Pass criteria: auth/connectivity PASS and STT endpoint PASS. An empty transcript is
explicitly allowed (1 s of silence should produce no speech). **Silence proves
authentication and the endpoint contract, not recognition quality**; record a short
synthetic spoken phrase locally and send it through the same adapter if recognition quality
must be certified. A `400/413/422` is an audio/provider contract issue, not proof of bad
credentials; a `401/403` is an auth failure.

### 4.4 Live Timbre only

```bash
export GNANI_API_KEY='…'
deno run --allow-env --allow-net --allow-write \
  scripts/provider-smoke.ts --live --provider timbre --out-dir .provider-audio
```

Pass criteria: auth/connectivity PASS, audio response PASS (non-empty MP3 signature), and two
files written:

```
.provider-audio/timbre-en-<timestamp>.mp3
.provider-audio/timbre-hi-<timestamp>.mp3
```

**A successful HTTP request is not proof of usable audio.** Listen to both files and confirm
they are intelligible and in the expected language. Do not commit the clips.

### 4.5 Full live smoke

```bash
export GROQ_API_KEY='…'
export GNANI_API_KEY='…'
deno run --allow-env --allow-net --allow-write \
  scripts/provider-smoke.ts --live --out-dir .provider-audio
```

Optional machine-readable output (never contains secrets or transcripts):

```bash
deno run … scripts/provider-smoke.ts --live --report /tmp/provider-smoke.json
```

### 4.6 Local stub testing

The local provider stub is the only no-cost path:

```bash
deno run --allow-net supabase/tests/stub-providers.ts 8787
npx supabase functions serve --env-file supabase/functions/.env
```

`supabase/functions/.env` points the adapters at `host.docker.internal:8787`. Do not combine
stub overrides with `--live`; the harness refuses that combination. The existing
`supabase/tests/adaptive.ts` and `integration.ts` exercise the stubbed paths.

---

## 5. Hosted Supabase Edge Function verification

This is an **owner action**; the agent did not deploy or set secrets.

1. Set function secrets (Dashboard → Edge Functions → Secrets, or CLI):
   `GROQ_API_KEY`, `GNANI_API_KEY`, `ALLOWED_ORIGINS`. Do not put them in Vercel or a
   `VITE_` variable.
2. Deploy `chat-turn` and `speak` without `--no-verify-jwt`.
3. Confirm JWT enforcement:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     "https://<ref>.supabase.co/functions/v1/chat-turn" \
     -X POST -H "content-type: application/json" -d '{"action":"start_session"}'
   # expect 401
   ```

4. Run one **synthetic** patient journey through the deployed frontend (text is enough for
   routing; use a scripted phrase, not patient data). Verify the draft/report still appears
   if a provider fails; that proves the fallback, not the provider.
5. For voice, use a synthetic phrase; verify the transcript preview is shown. A successful
   transcript means Prisma auth + STT; an error must offer text.
6. For TTS, trigger an adaptive question replay and listen. Scripted prompts are cached and
   must not hit Timbre.
7. Inspect Edge Function logs for `provider_attempt` events. They contain provider, boolean
   and status only — never transcript, audio, headers or keys.

**Do not infer provider health from a 200 or from the app loading.** The app is designed to
degrade to text/deterministic fallbacks. A successful auth check plus an audio/reasoning
check is required; see the per-provider pass criteria above.

Hosted platform CORS/RLS behaviour remains separately **NOT TESTED** until the owner runs a
deployed project. This runbook does not change that status.

---

## 6. Failure and timeout behaviour

| Provider | Timeout default | No retry | Expected UI fallback |
|---|---:|---|---|
| Groq | 8 s | yes | scripted question / deterministic summary |
| Prisma | 20 s | yes | text entry (“type instead”) |
| Timbre | 15 s | yes | approved question as text |

The adapters map HTTP status to stable kinds (`auth`, `rate_limited`, `invalid_request`,
`provider_error`) and timeouts to `timeout`; provider bodies are discarded. Unit tests in
`supabase/functions/_shared/groq.test.ts`, `prisma.test.ts` and `timbre.test.ts` cover these
paths. `supabase/tests/provider-smoke.test.ts` covers the harness’s own authentication vs
functionality classification and the no-secret-output rule.

---

## 7. Verification performed for this task

| Check | Result |
|---|---|
| `scripts/provider-smoke.ts` non-live | **PASS** — no request, no file, exit 0 |
| `scripts/provider-smoke.ts --live` without keys | **PASS** — refused with exit 2 before any request |
| `supabase/tests/provider-smoke.test.ts` | **17/17 pass** |
| Existing Groq/Prisma/Timbre adapter tests | **181/181** backend unit tests pass |
| Release gate (local) | **23 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED** |
| Integration / adaptive under the gate | **52/52** / **29/29** |
| Live Groq | **NOT RUN** |
| Live Prisma | **NOT RUN** |
| Live Timbre | **NOT RUN** |
| Hosted Edge Functions | **NOT RUN** |

No live call, deployment, hosted data change or credential was used.

---

## 8. Owner checklist

```
[ ] Confirm provider balances/quotas before live smoke (may consume credits)
[ ] GROQ_API_KEY set in the local shell only for the smoke run
[ ] GNANI_API_KEY set in the local shell only for the smoke run
[ ] No GROQ_BASE_URL / PRISMA_BASE_URL / TIMBRE_ENDPOINT set for live
[ ] Run --provider groq; auth PASS and parsing PASS
[ ] Run --provider prisma; auth PASS and STT endpoint PASS (empty transcript allowed; spoken-clip quality separately)
[ ] Run --provider timbre; listen to both saved clips
[ ] Set Supabase Function Secrets; deploy; confirm 401 without JWT
[ ] Run one synthetic deployed journey; confirm fallbacks and logs
[ ] Delete/retain local clips privately; never commit them
```
