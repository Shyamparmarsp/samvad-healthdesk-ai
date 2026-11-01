# Provider Activation Checklist

Three providers are involved. All of them are **optional at runtime**: without a key the
application degrades to the approved fallbacks and never fails the patient journey.

| Provider | Purpose | Fallback when unavailable |
|---|---|---|
| Groq | department suggestion + one adaptive question selection | deterministic first candidate, General Medicine routing |
| Gnani Prisma v2.5 | speech → text | text entry (`provider_unavailable`) |
| Gnani Timbre v2.5 | text → speech for adaptive questions | question shown as text |

**Status of this release: all three are UNVERIFIED against the real services.** No live
call has ever been made. `provider-verification-result.json` currently records
`mode: non-live`, `externalRequests: 0`, and every provider as `NOT_RUN`. That file is not
evidence of success and must not be quoted as such.

---

## 1. Exact secret names

Verified by grepping `Deno.env.get` across `supabase/functions/`:

| Secret name | Used by | Notes |
|---|---|---|
| `GROQ_API_KEY` | `_shared/groq.ts`, `_shared/groq-routing.ts`, `_shared/intake/select.ts` | server-side only |
| `GNANI_API_KEY` | `_shared/prisma.ts`, `_shared/timbre.ts` | **one key for both** Prisma and Timbre |
| `ALLOWED_ORIGINS` | both function entry points | comma-separated exact origins |

Optional overrides, empty in normal operation (only for a local stub):
`GROQ_BASE_URL`, `PRISMA_BASE_URL`, `TIMBRE_ENDPOINT`.

There is **no** `GNANI_TOKEN` and no separate Prisma/Timbre key. An earlier deployment
guide listed one; it has been corrected.

## 2. Where to configure them

Supabase Dashboard → **Project Settings → Edge Functions → Secrets**, or:

```bash
supabase secrets set GROQ_API_KEY=<value>
supabase secrets set GNANI_API_KEY=<value>
supabase secrets set ALLOWED_ORIGINS=https://<your-frontend-domain>
```

Secrets are read at invocation time; no redeploy is required after setting them.

## 3. Verify presence without exposing values

```bash
supabase secrets list        # shows names + a hash, never the value
```

Programmatically (presence only, no network):

```bash
deno run --allow-env supabase/tests/provider-verification.ts
```

It prints `GROQ_API_KEY: present|MISSING` and `GNANI_API_KEY: present|MISSING`. It never
prints a value, a prefix or a length.

## 4. Invoking the live verification harness

Live mode is explicit and fails closed:

```bash
GROQ_API_KEY=… GNANI_API_KEY=… \
  deno run --allow-env --allow-net --allow-write \
  supabase/tests/provider-verification.ts --live
```

Guarantees enforced by the script:

| Requirement | Mechanism |
|---|---|
| Default makes zero external requests | non-live branch exits before any provider import is called; report records `externalRequests: 0` |
| Live requires explicit opt-in | only `--live` reaches the provider calls |
| Missing credentials fail before any request | presence check → `exit 2`, message “no request was made” |
| Synthetic input only | fixed English/Hindi demo sentences and a generated 1 s silent WAV |
| No secrets, headers, bodies or audio printed | only status, model id, character/byte counts and latency |
| Stub mode remains default for the integration suites | `demo-smoke` and `demo-preflight` talk to `127.0.0.1:8787` only |
| Structured PASS/FAIL report | writes `provider-verification-result.json` grouped per provider |

## 5. What the harness sends

| Probe | Payload |
|---|---|
| B-1 Groq structured JSON | one synthetic sentence: “Synthetic demo text: knee pain for three weeks, moderate.” |
| B-3 Prisma English | 1 s of generated silence, `audio/wav`, `en-IN` |
| B-4 Prisma Hindi | same clip, `hi-IN` |
| B-5 webm refusal | same bytes, `audio/webm` — expected to be refused locally, no request |
| B-7/8 Timbre English | “This is a synthetic demo sentence.” |
| B-7/8 Timbre Hindi | “यह एक परीक्षण वाक्य है।” |

No patient data, no real recording and no transcript is ever sent.

## 6. Expected successful results

| Probe | Pass condition |
|---|---|
| B-1 | valid JSON matching the strict schema, `model=<groq model id>` reported |
| B-3/B-4 | `ok`, a model id and `chars ≥ 0`; silence usually yields an empty transcript, which is a **pass** for connectivity |
| B-5 | `kind=unsupported_format`, no provider call |
| B-7/8 | audio bytes returned with a content type, for both languages |
| B-9 | manual: oversized text probe observes the documented limit |

The JSON report marks each provider `PASS` only when all of its probes pass. A partially
working provider is `FAIL`, not `PASS`.

## 7. Troubleshooting by provider

**Groq**
- `kind=auth` → key invalid or revoked.
- `kind=ratelimit` → quota exhausted; the app already falls back deterministically.
- `kind=timeout` → network/proxy; the app falls back.
- Valid response but schema rejection → the model changed its output shape; check
  `docs/provider-notes.md` and the strict schema in `_shared/groq.ts`.

**Prisma**
- `unsupported_format` for wav → wrong `PRISMA_BASE_URL` or an unexpected endpoint.
- `kind=auth` → `GNANI_API_KEY` invalid.
- Empty transcript on non-silent audio → check the language code (`en-IN`/`hi-IN`).
- The browser must send WAV/OGG/MP3/AAC/MP4; `audio/webm` is refused by design.

**Timbre**
- Audio returned but the wrong voice → confirm the model/voice id in `_shared/timbre.ts`
  and `docs/provider-notes.md`; SDK defaults differ from v2.5.
- `{ text }` instead of audio → either the provider failed or the daily cap was hit; the
  JSON report distinguishes `provider_failure` from `usage_capped`.
- Hindi quality is **not** validated; only a human can judge it.

## 8. Recording verified status

1. Run the harness with `--live`.
2. Archive `provider-verification-result.json` with the release (it contains no secrets).
3. Record in the release notes: date, per-provider status, model ids reported, and who
   listened to the Timbre clips.
4. Update the release matrix row “live providers” from **NOT TESTED** to **PASS/FAIL**.

Until step 4, every provider row must remain **NOT TESTED**. Do not infer a pass from the
non-live report.
