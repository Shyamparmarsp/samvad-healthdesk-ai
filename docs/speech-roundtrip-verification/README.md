# English and Hindi Speech Round-Trip Verification

Technical TTS-to-STT integration check for the Samvad HealthDesk AI demo.

> **Not clinical validation.** A matching transcript proves that the configured Gnani
> Timbre voice produced audio that the configured Gnani Prisma language model transcribed
> back to the same synthetic sentence. It says nothing about clinical speech, accents,
> background noise, medical terminology or real patients. A mismatch is a technical
> signal for the owner, not a diagnosis or a quality score.

## Status

| Item | Result |
|---|---|
| Harness implemented | **PASS** — opt-in `--roundtrip` mode in `scripts/provider-smoke.ts` |
| Offline / mocked tests | **25 / 25 PASS** (`supabase/tests/provider-roundtrip.test.ts`) |
| Existing provider smoke tests | **17 / 17 PASS** (unchanged contract) |
| Non-live dry run | **PASS** — zero requests, zero files |
| Release gate (local) | **25 PASS / 0 FAIL / 0 BLOCKED / 1 NOT TESTED** (frontend not requested) |
| **Live English + Hindi round trip** | **NOT RUN** — requires explicit owner authorization |
| Clinical transcription accuracy | **NOT TESTED** — out of scope |

A mocked test is not evidence of real provider performance. Nothing in this directory
claims that a live round trip has succeeded.

## Documents

| File | Purpose |
|---|---|
| `README.md` | This page: usage, request budget, comparison rules |
| [`test-matrix.md`](test-matrix.md) | All 25 mocked tests and what each proves |
| [`manual-listening-checklist.md`](manual-listening-checklist.md) | Owner listening pass for the two clips |
| [`release-gate.md`](release-gate.md) | Gate results and focused evidence |

## What it does

For each language, in this order:

1. **TTS** — `synthesize()` from `supabase/functions/_shared/timbre.ts` with the existing
   `timbre-v2.5` model and the existing per-language voice (`Kaveri` for `en-IN`,
   `Nalini` for `hi-IN`).
2. **Save** — the returned MP3 is written under `.provider-audio/` (git-ignored).
3. **STT** — `transcribe()` from `supabase/functions/_shared/prisma.ts` with the same
   language code (`en-IN` / `hi-IN`) and the existing provider endpoint/auth.
4. **Compare** — the transcript is normalised and compared with the fixed sentence.

No adapter, endpoint, model, voice or authentication mechanism is replaced or duplicated.
The round trip is a new mode on top of the existing smoke harness.

## Request budget and cost

A complete two-language run makes **exactly four provider requests** and never more:

| # | Provider | Operation | Language | Count |
|---|---|---|---|---|
| 1 | Gnani Timbre | text to speech | `en-IN` | 1 |
| 2 | Gnani Prisma | speech to text | `en-IN` | 1 |
| 3 | Gnani Timbre | text to speech | `hi-IN` | 1 |
| 4 | Gnani Prisma | speech to text | `hi-IN` | 1 |
| | | | **total** | **4** |

- **Cost:** the harness does not know your Gnani price plan. Treat each of the four calls
  as billable under your account. The sentences are short (about 2–5 seconds of audio).
  Check your dashboard/credits before authorizing a live run.
- **No retries.** A failed request is not repeated; the run stops and the remaining steps
  are reported `NOT TESTED`. A failed run therefore uses fewer than four requests.
- **Timeouts:** each request is explicitly bounded at **30 s**
  (`ROUNDTRIP_TIMEOUT_MS`). A timeout is a `FAIL`, never a silent success.
- **Hard limit:** the runner refuses to exceed four requests, and the CLI rejects
  `--roundtrip` combined with `--provider` to keep the budget unambiguous.

## Commands

Dry run (safe; no network, no files):

```bash
deno run --allow-env scripts/provider-smoke.ts --roundtrip
```

It prints the two sentences, the target directory, the timeout, the four-request budget
and then exits 0 without contacting anything.

Live run (**owner authorization required**; may consume paid credits):

```bash
# Key is read from the environment only. Never pass it as an argument.
export GNANI_API_KEY="…"
deno run --allow-env --allow-net --allow-write \
  scripts/provider-smoke.ts --live --roundtrip
```

Optional evidence file (contains counts and paths, **no transcripts**):

```bash
deno run --allow-env --allow-net --allow-write \
  scripts/provider-smoke.ts --live --roundtrip --report provider-roundtrip-result.json
```

Exit codes: `0` all checks PASS, `1` a check FAILED, `2` usage/configuration refusal
(missing key, unsafe audio directory, stub endpoint override, unknown flag).

### Refusals that happen before any request

- `--live` without `GNANI_API_KEY` → exit 2.
- `--live` with `GROQ_BASE_URL`, `PRISMA_BASE_URL` or `TIMBRE_ENDPOINT` set → exit 2
  (a stub override must never masquerade as a live run).
- `--out-dir` outside `.provider-audio/` → exit 2. Generated audio can only be written to
  a directory already excluded by `.gitignore`.
- `--roundtrip --provider …` → exit 2.
- Any key-shaped flag (`--key`, `--api-key`, `--token`, `--secret`, `--password`) → exit 2.

## Synthetic sentences

Fixed public constants in `scripts/provider-smoke.ts`:

| Language | Sentence | Voice |
|---|---|---|
| `en-IN` | `This is a simple speech test.` | Kaveri |
| `hi-IN` | `आज मौसम बहुत अच्छा है।` | Nalini |

Both are non-medical and contain no patient data. They are the *expected* side of the
comparison; the actual STT transcript is never printed or persisted.

## Tolerant comparison rules

`normalizeTranscript()`:

1. Unicode **NFC** (composed and decomposed forms compare equally).
2. Zero-width characters removed.
3. Lower-cased.
4. Punctuation and symbols replaced with spaces (this covers the Devanagari danda `।`).
5. Whitespace collapsed and trimmed.

Letters, combining marks and digits are preserved, including Devanagari. Nothing is
translated, transliterated, spell-corrected or rewritten. `compareTranscripts()` returns:

| Verdict | Meaning | Harness status |
|---|---|---|
| `MATCH` | Exactly equal after normalisation | **PASS** |
| `MISMATCH` | Any word added, missing or substituted | **FAIL** |
| `EMPTY` | Transcript empty or punctuation only | **FAIL** |

The report contains token counts, matching-token count, difference count and similarity.
It does **not** contain the transcript text, the audio bytes or the API key. A partially
similar transcript is never rounded up to a match.

## Outputs and privacy

- Audio: `.provider-audio/roundtrip-<en|hi>-<timestamp>.mp3`. The directory is excluded in
  `.gitignore`; `git status` stays clean after a run.
- Console: check status, provider kind, byte count, content type, token metrics and the
  local file path. No transcript, audio body, header, key or provider body.
- Optional `--report` JSON: the same metadata, the fixed expected sentence and comparison
  counts. No transcript.

## Manual listening checklist

Listening is the only way to judge whether the voice actually sounds like the language and
whether the audio is intelligible. See
[`manual-listening-checklist.md`](manual-listening-checklist.md).

## Failure behaviour

| Situation | Harness result | Retry? | Remaining steps |
|---|---|---|---|
| Missing `GNANI_API_KEY` | exit 2 before any request | no | none |
| TTS auth/rejection/timeout | TTS `FAIL`, run stops | **no** | `NOT TESTED` |
| TTS returns non-MP3/unsupported type | container `FAIL`, no STT call | no | `NOT TESTED` |
| STT auth/rejection/timeout | STT `FAIL`, run stops | **no** | other language `NOT TESTED` |
| STT empty transcript | STT accepted, comparison `FAIL (EMPTY)` | no | other language still runs |
| STT malformed JSON/contract | STT `FAIL (invalid_response)` | no | other language `NOT TESTED` |
| Transcript mismatch | comparison `FAIL (MISMATCH)` | **no** | other language still runs |
| Audio cannot be written | local `FAIL`, no STT call | no | `NOT TESTED` |

## Mocked tests vs live verification

| Layer | Command | What it proves |
|---|---|---|
| Offline tests (mocked fetch, injected writer) | `deno test --allow-read --allow-env supabase/tests/provider-roundtrip.test.ts` | Harness logic: comparison, failure classification, 4-request bound, opt-in gate, redaction |
| Non-live dry run | `deno run --allow-env scripts/provider-smoke.ts --roundtrip` | No request is made without `--live` |
| Live round trip | `deno run … --live --roundtrip` | **Only** evidence of real Timbre/Prisma integration. **NOT RUN.** |

The mocked tests use a 10-byte fake MP3 fixture, not real audio. They cannot detect a
provider outage, a credential problem, a voice entitlement issue or poor recognition.

## Fixtures

| File | Purpose |
|---|---|
| `supabase/tests/fixtures/speech-roundtrip/cases.json` | Comparison cases (English, Hindi, Unicode, whitespace, mismatch, empty) and STT response shapes |
| `supabase/tests/fixtures/speech-roundtrip/fake-tts.mp3.b64` | Minimal fake MP3 signature used by the mocked TTS response |

## Limitations

- One fixed sentence per language, one voice per language, one provider configuration.
- Synthetic speech is easier than real speech; a match does not generalise to patients.
- No measurement of word error rate, latency or audio quality.
- No Hinglish, code-mixed or accented speech coverage.
- The owner must still listen to the clips; the comparison is a technical check.
