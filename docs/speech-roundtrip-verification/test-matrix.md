# Round-Trip Test Matrix

**Command:** `deno test --allow-read --allow-env supabase/tests/provider-roundtrip.test.ts`
**Result:** **25 / 25 PASS**
**Provider requests during these tests:** **0** — every request uses an injected fetch stub
and every clip is written through an injected writer.

These tests prove the harness contract. They are **not** evidence of live provider
performance. The live round trip is **NOT RUN**.

## 1. Opt-in and cost bounds

| Test | Proves | Expected |
|---|---|---|
| `--roundtrip is non-live by default` | Live calls require the explicit `--live` flag | `live=false`, `roundTrip=true`, default audio dir |
| `--live --roundtrip is accepted` | The only live entry point is explicit | both flags true |
| `combining --roundtrip with --provider is refused` | The four-request budget cannot be confused with the multi-provider smoke set | `SmokeUsageError` |
| `live work never runs without --live` | The gate never invokes the live callback in dry-run mode | dry-run plan, 4 requests planned, callback not called |
| `live mode rejects an audio directory outside .provider-audio` | Generated audio cannot be written to a tracked directory | exit/refusal before any provider work |
| `the git-ignored audio directory is enforced and documented` | Default output is covered by `.gitignore`; escape paths are rejected | `.provider-audio/` in `.gitignore`; unsafe paths refused |

## 2. Transcript comparison

| Test | Proves | Expected |
|---|---|---|
| `every fixture case produces the documented verdict` | English, Hindi, punctuation, zero-width, NFC/NFD, mismatch, empty fixtures | verdicts match `cases.json` |
| `Unicode NFC, zero-width removal, case and punctuation tolerance` | Harmless formatting differences are tolerated; Devanagari letters and marks survive | normalised equality; `अच्छा` preserved |
| `a material difference is never reported as a match` | Substitution, omission and Romanised Hindi are failures | `MISMATCH`, `similarity < 1` |
| `an empty or punctuation-only transcript is EMPTY, not a match` | No speech is not silently accepted | `EMPTY` |

## 3. Successful round trips (mocked providers)

| Test | Proves | Expected |
|---|---|---|
| `english round trip: TTS then STT, normalised match passes` | Request order, one clip, PASS status | TTS → STT, 2 requests, `MATCH` |
| `hindi round trip: Devanagari transcript matches after normalisation` | Hindi configuration and Devanagari comparison | 2 requests, `hi-IN`, `MATCH` |
| `both languages: exactly four provider requests and two saved clips` | The cost ceiling is exact, not approximate | 4 requests, 2 TTS, 2 clips |
| `existing Timbre and Prisma configuration is reused` | No provider contract drift | `timbre-v2.5`, Kaveri/Nalini, `language_code`, `.mp3` upload |

## 4. Failure paths

| Test | Proves | Expected |
|---|---|---|
| `material mismatch: the run fails and reports counts without transcripts` | A near miss is a FAIL | `MISMATCH`, comparison check FAIL, no transcript text |
| `empty STT transcript: the round trip fails` | Empty output is not success | `EMPTY`, status FAIL, 2 requests |
| `malformed STT response: classified, no comparison attempted` | Contract validation still applies | `invalid_response`, no comparison |
| `TTS failure: no STT call, no retry, remaining language NOT TESTED` | Fail-fast and no automatic retry | 1 request, second language `NOT TESTED` |
| `STT failure: one TTS + one STT, then stop` | STT failure stops the run | 2 requests, second language `NOT TESTED` |
| `timeout: the request aborts, fails safely and does not hang` | Explicit 25 ms test timeout is enforced | `timeout`, status FAIL, 1 request |
| `unsupported TTS container: no STT request is made` | The harness does not guess an audio format | container FAIL, 1 request |

## 5. Credentials and redaction

| Test | Proves | Expected |
|---|---|---|
| `missing credentials: no request is made and nothing claims a result` | Fail closed | 0 requests, all `NOT TESTED` |
| `report output: no key, audio bytes or transcript text` | Log/evidence redaction | key, transcript marker and base64 audio absent |
| `mime mapping: accepts documented types, infers MP3 only from a valid signature` | Prisma accepted types only; no WebM | `audio/mpeg` only for MP3 bytes; WebM refused |
| `constants: sentences are synthetic, short and non-empty` | Fixed fixture discipline | non-medical, ≤120 chars, 30 s timeout |

## Existing contract tests

The pre-existing `supabase/tests/provider-smoke.test.ts` remains **17 / 17 PASS**. It
covers the original smoke checks, credential-flag refusal and the no-secret-output rule;
no existing assertion was changed.

## What is not covered here

| Item | Status |
|---|---|
| Real Timbre audio | **NOT RUN** |
| Real Prisma transcription | **NOT RUN** |
| Live English round trip | **NOT RUN** |
| Live Hindi round trip | **NOT RUN** |
| Clinical word error rate / accents / noise | **NOT TESTED** (out of scope) |
| Owner listening judgement | **PENDING OWNER** |
