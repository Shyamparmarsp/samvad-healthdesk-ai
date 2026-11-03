# Provider Notes — verified facts, gaps and owner runbook

**Step:** M1-S5 (provider verification spike)
**Access date for every URL below:** 1 November 2026
**Calls made by the agent while preparing this file:** 0 (no keys, no paid requests)
**Rule:** nothing in this file is guessed. Each item is tagged `VERIFIED-DOCS` (stated by the provider's official documentation on the access date), `ACCOUNT-SPECIFIC` (can only be confirmed with the project's own account), or `BLOCKED` (not yet known; the app must use its fallback).

Secrets are never recorded here. Variable **names** only.

---

## 1. Groq

### 1.1 Endpoint and authentication — VERIFIED-DOCS
| Item | Value |
|---|---|
| Base URL | `https://api.groq.com/openai/v1` |
| Chat endpoint | `POST /chat/completions` |
| Auth header | `Authorization: Bearer <GROQ_API_KEY>` |
| Models listing | `GET /models` |
| Content type | `application/json` |

Source: <https://console.groq.com/docs/structured-outputs>, <https://console.groq.com/docs/models>

### 1.2 Structured output — VERIFIED-DOCS
- Request shape: `response_format: { type: "json_schema", json_schema: { name, strict, schema } }`.
- **`strict: true`** uses constrained decoding: the response is guaranteed to match the schema. Requirements: every property in `required`, and `additionalProperties: false` on every object.
- `strict: true` is currently supported on: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `meta-models/muse-spark-open`.
- `strict: false` (best-effort) is supported on: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `openai/gpt-oss-safeguard-20b`, `qwen/qwen3.8-27b`, `meta-models/muse-spark-open`. Best-effort may return HTTP 400 `Generated JSON does not match the expected schema`.
- **Streaming and tool use are not supported together with structured outputs.** Our design uses neither.

### 1.3 Candidate models — VERIFIED-DOCS
| Model ID | Speed | Context | Max completion | Notes |
|---|---|---|---|---|
| `qwen/qwen3.8-27b` | ~450 t/s | 131,072 | 16,384 | **Selected**: owner decision, strict mode supported |
| `openai/gpt-oss-20b` | ~1000 t/s | 131,072 | 65,536 | Documented alternative; **not selected, not used** |
| `openai/gpt-oss-120b` | ~500 t/s | 131,072 | 65,536 | Documented alternative; **not selected, not used** |

**Selected model:** `qwen/qwen3.8-27b` with `strict: true`, set once in
`supabase/functions/_shared/groq.ts` (`GROQ_MODEL`). Re-verify before deployment if Groq
changes its model list.

**Single active reasoning model.** The product owner replaced GPT-OSS-20B with Qwen 3.8 27B
on 3 November 2026. There is exactly one reasoning model, one adapter and one request shape;
no secondary or fallback model is configured. A provider failure always resolves to the
documented scripted/deterministic fallback (department → General Medicine, adaptive question →
first retrieved approved question), never to another model. The GPT-OSS rows above remain in
this file only as the provider-verification record of what was documented and considered;
they are not reachable from the application.

**Reasoning-specific parameters.** None are sent. The request body is exactly
`{ model, messages, response_format }`: no `reasoning_effort`, `reasoning_format`,
`temperature`, `max_tokens`, `tools`, `tool_choice` or `stream`. The documented structured
output contract needs none of them, and `strict: true` constrains the decoding. Adding one is
an owner-approved change, not an agent decision. Requests are also far below Qwen's 16,384
max-completion budget (single small JSON object).

**Migration verification status:** the request shape, model id and parsing are covered by
mocked tests (`_shared/groq.test.ts`, `_shared/groq-model-selection.test.ts`). **No live Groq
call has been made**; the model id and `strict` support still need the owner's B-1 check in §6.


### 1.4 Error and timeout behaviour
- **VERIFIED-DOCS:** schema failures in best-effort mode return HTTP 400; rate limits return 429; auth failures return 401.
- **VERIFIED-DOCS:** a dedicated error-code reference exists at <https://console.groq.com/docs/errors>.
- **BLOCKED:** no fixed request timeout is documented for `/chat/completions`, and the project's tier limits are not known. The adapter must therefore set its own client timeout and treat any timeout as "use the scripted fallback".
- **Proposed client timeout:** 8 s for extraction/selection calls, 12 s for the summary call. To be tuned only after the account is exercised.
- **ACCOUNT-SPECIFIC:** tier, TPM/RPM, spend limits, model permissions for the project key.

### 1.5 Compliance constraints for our use
- Groq may only extract patient-reported facts, name missing fields, choose one approved question ID, suggest one allowlisted department, and return a supplementary `possible_urgent` boolean.
- Output must be runtime-validated; unknown question IDs, unknown department keys, invented facts or unknown fields cause the whole response to be discarded in favour of the scripted fallback.
- Groq never decides completion and never writes to the database.

---

## 2. Gnani Prisma (speech-to-text) — v2.5

### 2.1 Endpoint and authentication — VERIFIED-DOCS
| Item | Value |
|---|---|
| Base URL | `https://api.vachana.ai` |
| REST transcription | `POST /stt/v3` |
| Content type | `multipart/form-data` |
| Auth header | `X-API-Key-ID: <GNANI_API_KEY>` |
| Optional trace header | `X-API-Request-ID` (echoed back as `request_id`) |

Source: <https://docs.gnani.ai/api/STT/speech-to-text>, <https://docs.gnani.ai/api/introduction/introduction>

### 2.2 Multipart request — VERIFIED-DOCS
| Field | Required | Notes |
|---|---|---|
| `audio_file` | yes | The audio binary |
| `language_code` | yes | Prisma v2.5 accepts exactly one code |
| `model` | optional | Omit for Prisma v2.5 (the default). `prisma-v3.0` selects v3.0 |
| `format` | optional | `verbatim` (default) or `transcribe` (enables inverse text normalisation) |
| `itn_native_numerals` | optional | Native-script digits when `format=transcribe` |
| `bias_list` / `bias_score` | optional | v2.5 word boosting; invalid entries are silently ignored |

### 2.3 Audio constraints — VERIFIED-DOCS
- Supported containers: **WAV, MP3, OGG, FLAC, AAC, M4A**.
- **Maximum duration: 30 seconds** on REST. The introduction page also mentions "up to 60 seconds" for STT REST; the REST reference page and the OpenAPI schema both state 30 s and return `MAX_AUDIO_DURATION_EXCEEDED`. **Use 30 s** — it also matches the project's own recording cap.
- Audio is converted to 16 kHz mono server-side.
- **WebM is not in the supported list.** The browser must produce an accepted container before upload.

### 2.4 Languages — VERIFIED-DOCS
`bn-IN`, `en-IN`, `gu-IN`, `hi-IN` (Devanagari), `kn-IN`, `ml-IN`, `mr-IN`, `pa-IN`, `ta-IN`, `te-IN`.
Hindi output is documented as **Devanagari**. `format=transliterate` (Roman output) exists only on Prisma v3.0, not v2.5.

### 2.5 Response — VERIFIED-DOCS
```json
{
  "success": true,
  "request_id": "req_abc123",
  "transcript": "नमस्ते, आप कैसे हैं?",
  "model": "prisma-v2.5",
  "processing_time": 0.14,
  "end_to_end_latency": 0.17,
  "output": { "literal": "नमस्ते, आप कैसे हैं?" }
}
```
- `transcript` is always a string. **An empty string is not an error** — it means no speech was detected.
- Audio shorter than 0.1 s returns `{ success: true, request_id, transcript: "" }` without model or timings.

### 2.6 Errors — VERIFIED-DOCS
| HTTP | Code | Meaning |
|---|---|---|
| 400 | `EMPTY_AUDIO` | Zero-byte upload |
| 400 | `UNSUPPORTED_AUDIO_FORMAT` | Extension not accepted |
| 400 | `AUDIO_CONVERSION_ERROR` | File could not be decoded |
| 400 | `MAX_AUDIO_DURATION_EXCEEDED` | Over 30 s |
| 400 | `INVALID_LANGUAGE_CODE` | Bad code, or more than one for v2.5 |
| 400 | `INVALID_MODEL` | Unknown model |
| 422 | `{detail:[...]}` | Missing `audio_file` or `language_code` |
| 401 | `MISSING_API_KEY` / `INVALID_API_KEY` | Auth |
| 403 | `SCOPE_NOT_ALLOWED` | Key lacks the STT scope |
| 429 | `RATE_LIMITED` | "Only 1 active request is allowed at a time" |
| 500 | `TRANSCRIPTION_FAILED` / `INTERNAL_SERVER_ERROR` | Server-side failure |

Error envelope: `{"success": false, "error": {"type": "...", "message": "..."}}`. Auth/rate-limit errors use `{"detail": {"error_code": "...", "message": "...", "status_code": 429}}` instead.

- **BLOCKED:** no documented request timeout for v2.5. The v3.0 reference mentions a 5 s model timeout and a 504 `UPSTREAM_TIMEOUT`; v2.5 states none. The adapter sets its own timeout.
- **Proposed client timeout:** 20 s, with no automatic retry on ambiguous outcomes.
- **ACCOUNT-SPECIFIC:** whether v2.5 is enabled for this account, whether the key carries the STT scope, whether the rate limit is one concurrent request.

---

## 3. Gnani Timbre (text-to-speech) — v2.5

### 3.1 Endpoint and authentication — VERIFIED-DOCS
| Item | Value |
|---|---|
| Endpoint | `POST https://api.vachana.ai/api/v1/tts/inference` |
| Content type | `application/json` |
| Auth header | `X-API-Key-ID: <GNANI_API_KEY>` |
| Response | Binary audio (`200`) |

Source: <https://docs.gnani.ai/api/TTS/tts-inference>, <https://docs.gnani.ai/api/TTS/available-voices>

### 3.2 Request body — VERIFIED-DOCS
```json
{
  "text": "नमस्ते, आप कैसे हैं?",
  "voice": "Nalini",
  "model": "timbre-v2.5",
  "language": "hi-IN",
  "speed": 1.0,
  "audio_config": {
    "sample_rate": 48000,
    "num_channels": 1,
    "sample_width": 2,
    "encoding": "linear_pcm",
    "container": "wav"
  }
}
```
| Field | Required | Notes |
|---|---|---|
| `text` | yes | Numbers/dates should be passed as spoken words |
| `model` | **yes** | `timbre-v2.5` or `timbre-v3.0`. **Timbre v2.0 is deprecated and rejected** — the Python SDK still defaults to v2.0, so `model` must always be sent explicitly |
| `voice` | yes | Must come from the selected model's catalogue |
| `language` | yes | `hi-IN`, `en-IN`, `hi-en`, `auto`, plus ta/te/kn/ml/mr/pa/bn/gu |
| `speed` | no | 0.85–1.15 (default 1.0) |
| `audio_config` | yes in practice | `container`: `wav` (default), `mp3`, `ogg`, `raw`, `mulaw`, `alaw`; `sample_rate`: 8000/16000/22050/24000/44100/48000; `bitrate` only for mp3 |

**Chosen output for the app:** `container: "mp3"`, `sample_rate: 24000`, mono — small payloads that every target browser can play. WAV remains a safe fallback if mp3 playback ever fails.

### 3.3 Voices — VERIFIED-DOCS (42 voices for v2.5)
Hindi (`hi-IN`): Nalini, Bhavna, Yashvi, Urmila, Jwala, Chitra, Ambuja, Deepak, Roopesh, Vikrant, Hemraj, Jalaj, Omkar.
English (`en-IN`): Kaveri, Trupti, Devika, Pranav, Shlok, Girish.
Hinglish (`hi-en`): Poorvi. Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati voices also listed.
Voices are **not** interchangeable between models.

**Chosen for the demo:** `Nalini` (Hindi), `Kaveri` (English). Both are female, professional/friendly and documented for the matching language code.
**ACCOUNT-SPECIFIC:** which voices the account may actually synthesise.

### 3.4 Errors — VERIFIED-DOCS
Flat body: `{"success": false, "message": "...", "status_code": 400}`.
| HTTP | Meaning |
|---|---|
| 400 | Missing/invalid parameter, unknown model/voice, or `speed` outside range |
| 401 / 403 | Auth or scope |
| 429 | `RATE_LIMITED` ("Only 1 active request is allowed at a time") |
| 500 | Server failure, including text that is too long |

- **BLOCKED:** the maximum accepted `text` length is not documented (only that over-long text produces 500). The app only synthesises one short approved question per call, so this is low risk; still unverified.
- **ACCOUNT-SPECIFIC:** voice entitlements, remaining credits.

---

## 4. Fixed prompts are cached, not synthesised

Per `AGENTS.md`, these five prompts are pre-generated once into `public/audio/` in English and Hindi (ten files) and are **never** sent to Timbre at runtime:

1. greeting, 2. ask-name, 3. ask-age, 4. ask-gender, 5. ask-primary-concern.

Only adaptive follow-up questions call `speak` → Timbre. `scripts/generate-opening-audio.ts` is manual, has no database access, and makes at most the ten attempts reserved by the owner.

---

## 5. Secret names

| Variable | Used by | Status |
|---|---|---|
| `GROQ_API_KEY` | `_shared/groq.ts` | Documented by Groq for its SDKs. **Must be set by the owner in Supabase Function Secrets.** |
| `GNANI_API_KEY` | `_shared/prisma.ts`, `_shared/timbre.ts`, `scripts/generate-opening-audio.ts` | Documented by the Gnani Python SDK (`GNANI_API_KEY`). The REST API itself only specifies the `X-API-Key-ID` header, so the variable name is our choice. **Owner sets it; the agent never reads it.** |

Never place either key in a `VITE_` variable, in Vercel, in Git, or in this file.

---

## 6. What is still BLOCKED (requires the owner's account)

These cannot be completed without credentials and a paid call. None may be claimed as passing.

| ID | Check | Why blocked |
|---|---|---|
| B-1 | One Groq `/chat/completions` call with `strict: true` returning schema-valid JSON | Needs `GROQ_API_KEY` |
| B-2 | Groq error paths: 401, 429, forced schema mismatch | Needs a key and a quota state |
| B-3 | Prisma transcription of a synthetic English clip | Needs `GNANI_API_KEY`; also settles the accepted browser container |
| B-4 | Prisma transcription of a synthetic Hindi clip, recording whether output is Devanagari | Confirms the documented behaviour; decides whether Romanised emergency variants are needed |
| B-5 | Whether the browser can produce an accepted container (WAV via client-side encode, or OGG/Opus) and whether the service accepts it | Needs a real request; **WebM is unsupported** |
| B-6 | Measured Prisma latency/timeout envelope, to fix the adapter timeout and the audio claim TTL | Needs real requests |
| B-7 | One Timbre English sentence and one Hindi sentence, listened to by the owner | Needs a key and the owner's ears |
| B-8 | Timbre voice entitlement (`Nalini`, `Kaveri`) | Needs a request |
| B-9 | Maximum TTS text length | Undocumented |

Until B-1…B-9 are closed, the provider adapters must be exercised only against mocked transports, and every UI path must keep its documented fallback (text entry, scripted question, deterministic summary).

---

## 7. Owner runbook (run manually, never commit the output of a key)

Set the keys in your own terminal session, or in the ignored `supabase/.env.functions`. Do not paste them into chat, files or screenshots.

Groq JSON-schema smoke test:

```bash
curl -s https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen3.8-27b",
    "messages": [
      {"role":"system","content":"Return JSON only."},
      {"role":"user","content":"The patient reports knee pain for three weeks, moderate."}
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "probe",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "duration": {"type": "string"},
            "possible_urgent": {"type": "boolean"}
          },
          "required": ["duration", "possible_urgent"],
          "additionalProperties": false
        }
      }
    }
  }'
```

Prisma smoke test (replace the file with a ≤30 s synthetic clip):

```bash
curl -s https://api.vachana.ai/stt/v3 \
  -H "X-API-Key-ID: $GNANI_API_KEY" \
  -F audio_file=@synthetic-english.wav \
  -F language_code=en-IN

curl -s https://api.vachana.ai/stt/v3 \
  -H "X-API-Key-ID: $GNANI_API_KEY" \
  -F audio_file=@synthetic-hindi.wav \
  -F language_code=hi-IN
```

Timbre smoke test:

```bash
curl -s -X POST https://api.vachana.ai/api/v1/tts/inference \
  -H "X-API-Key-ID: $GNANI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a test of the intake assistant.","voice":"Kaveri","model":"timbre-v2.5","language":"en-IN","speed":1.0,"audio_config":{"sample_rate":24000,"num_channels":1,"sample_width":2,"encoding":"linear_pcm","container":"mp3"}}' \
  --output probe-en.mp3

curl -s -X POST https://api.vachana.ai/api/v1/tts/inference \
  -H "X-API-Key-ID: $GNANI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"यह एक परीक्षण है।","voice":"Nalini","model":"timbre-v2.5","language":"hi-IN","speed":1.0,"audio_config":{"sample_rate":24000,"num_channels":1,"sample_width":2,"encoding":"linear_pcm","container":"mp3"}}' \
  --output probe-hi.mp3
```

Record in this file, beside each ID in §6: the date, the HTTP status, the measured latency, and the provider call count. **Do not record audio, transcripts containing health text, keys, tokens or full error bodies.**

---

## 8. Call count for this step

| Provider | Calls made | Notes |
|---|---|---|
| Groq | 0 | Documentation verification only |
| Gnani Prisma | 0 | Documentation verification only |
| Gnani Timbre | 0 | Documentation verification only |

Add rows here only when the owner runs the runbook; the ten-call cached-audio reservation (M3-S7) is recorded separately.

---

## 9. Impact on the backend code

| Adapter | Fixed by this file | Still needs the owner |
|---|---|---|
| `_shared/groq.ts` | Model ID, endpoint, auth header, `strict` schema shape, "no streaming" | Timeout tuning (B-1, B-2) |
| `_shared/prisma.ts` | Endpoint, multipart fields, 30 s limit, container list, response shape, error mapping | Container choice (B-5), measured latency (B-6) |
| `_shared/timbre.ts` | Endpoint, model ID, voices, mp3 output, error mapping | Entitlement (B-8), max text (B-9) |
| `scripts/generate-opening-audio.ts` | Ten files, v2.5 voices, no DB access | Provider access to run it |

Every adapter must validate provider output at runtime and must expose a typed failure so `chat-turn` can choose the documented fallback.
