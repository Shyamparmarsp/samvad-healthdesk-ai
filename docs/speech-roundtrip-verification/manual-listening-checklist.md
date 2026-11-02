# Manual Listening Checklist

Automated checks cannot tell whether a voice sounds natural, whether the language is
correct, or whether the audio is clipped. A live run requires **both** the automated
comparison and this listening pass.

**Do not start until the owner has explicitly authorized the live run and checked the
Gnani balance/credits.** A complete run is four provider requests (2 TTS + 2 STT).

## Before the run

```
[ ] Owner authorized the live run (date/name): ______________________
[ ] Gnani dashboard credits/quotas checked
[ ] GNANI_API_KEY exported in this shell only (not in a file, not in Git)
[ ] GROQ_BASE_URL, PRISMA_BASE_URL and TIMBRE_ENDPOINT are UNSET
[ ] No key is present on the command line
[ ] .provider-audio/ is empty or contains only earlier private clips
```

## Run

```bash
deno run --allow-env --allow-net --allow-write \
  scripts/provider-smoke.ts --live --roundtrip
```

Expected console shape:

```
TTS request (en-IN)                PASS   … bytes, content-type=audio/mpeg
audio saved (en-IN)                PASS   .provider-audio/roundtrip-en-….mp3
STT request (en-IN)                PASS   model=prisma-v2.5 chars=…
transcript comparison (en-IN)      PASS   verdict=MATCH tokens=…/…
TTS request (hi-IN)                PASS   …
audio saved (hi-IN)                PASS   .provider-audio/roundtrip-hi-….mp3
STT request (hi-IN)                PASS   …
transcript comparison (hi-IN)      PASS   verdict=MATCH tokens=…/…
Provider requests used: 4 of 4 maximum
```

If the count is not 4, or any check is `FAIL`/`NOT TESTED`, stop and record it. Do not
re-run casually: every run spends requests and there are no automatic retries.

## Listen — English clip

File: `.provider-audio/roundtrip-en-<timestamp>.mp3`
Expected sentence: **“This is a simple speech test.”**

```
[ ] The file exists and is non-empty
[ ] The voice speaks English (not Hindi)
[ ] The voice is the configured English voice, Kaveri (as far as can be judged)
[ ] All words are audible; no clipping, silence, stutter or truncation
[ ] The spoken words match the expected sentence closely enough for a listener
[ ] The automated comparison verdict is recorded as-is (MATCH or MISMATCH)
```

## Listen — Hindi clip

File: `.provider-audio/roundtrip-hi-<timestamp>.mp3`
Expected sentence: **“आज मौसम बहुत अच्छा है।”** (``Today the weather is very nice.``)

```
[ ] The file exists and is non-empty
[ ] The voice speaks Hindi in Devanagari pronunciation (not English)
[ ] The voice is the configured Hindi voice, Nalini (as far as can be judged)
[ ] All words are audible; no clipping, silence, stutter or truncation
[ ] The spoken words match the expected sentence closely enough for a listener
[ ] The automated comparison verdict is recorded as-is (MATCH or MISMATCH)
```

## Record the result

| Language | TTS | Audio listened | STT | Comparison | Owner judgement |
|---|---|---|---|---|---|
| `en-IN` | | | | | |
| `hi-IN` | | | | | |

Notes (do not paste full transcripts into public channels):

```
Date:
Owner:
Requests used:
Anomalies:
Decision (accept / investigate / repeat once with approval):
```

## Interpreting a failure

| Observation | Meaning | Action |
|---|---|---|
| TTS `FAIL` | Authentication, entitlement, network or timeout | Check key/credits; do not retry automatically |
| Audio saved but silent/clipped | Voice or audio-configuration problem | Report to provider/owner; keep the file |
| STT `FAIL` | Authentication, audio container, network or timeout | Check the failure kind in the check detail |
| Comparison `MISMATCH` | The transcript differs materially | Listen to the clip; decide whether TTS or STT is at fault |
| Comparison `EMPTY` | STT returned no speech | Listen; if audio is audible, the STT path is suspect |
| Files not written | Directory permission or unsafe path | Fix the path; no provider request is needed to test this |

**Never** describe a mocked test, a dry run, or a partially similar transcript as a
successful live round trip.

## Cleanup

```
[ ] Audio files kept privately or deleted
[ ] `git status` shows no audio file
[ ] No key, transcript or provider response was pasted into docs, chat or Git
[ ] Result recorded (PASS/FAIL + listening notes) in the owner's private log
```
