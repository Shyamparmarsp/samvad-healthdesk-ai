# Cached prompt audio (owner action required)

`AGENTS.md` requires pre-generated audio for the greeting and the four fixed intake
questions, and forbids calling Timbre for those prompts. The application already
resolves the approved files from this directory and never sends a paid request for a
cached prompt. The files themselves are **not committed**, because generating them
requires the Gnani Timbre credentials and a deliberate, costed generation run.

## Required files

| File | Spoken text source |
|---|---|
| `public/audio/en/greeting.mp3` | `src/i18n/en.ts` → `consent.greetingAudio` |
| `public/audio/en/ask-name.mp3` | approved fixed question `name` |
| `public/audio/en/ask-age.mp3` | approved fixed question `age` |
| `public/audio/en/ask-gender.mp3` | approved fixed question `gender` |
| `public/audio/en/ask-primary-concern.mp3` | approved fixed question `primary_concern` |
| `public/audio/hi/greeting.mp3` | `src/i18n/hi.ts` → `consent.greetingAudio` |
| `public/audio/hi/ask-name.mp3` | approved Hindi fixed question |
| `public/audio/hi/ask-age.mp3` | approved Hindi fixed question |
| `public/audio/hi/ask-gender.mp3` | approved Hindi fixed question |
| `public/audio/hi/ask-primary-concern.mp3` | approved Hindi fixed question |

## Rules

- Generate once, offline, with the verified Timbre model id, then commit the files.
- Never generate audio during a Vercel build.
- Never call Timbre for these prompts at runtime (the client already refuses to).
- Until the files exist the UI states that audio is unavailable and keeps the text
  visible. It does not fake playback and does not fall back to a paid request.
- Every generation attempt consumes the documented daily Timbre budget; reserve the
  attempts in the application limit for that IST day before running the script.

The owner generates these once, offline, with the verified Timbre model id (see
`docs/` provider notes). No script is committed that calls the provider, because the
provider contract and model id are owner-verified rather than agent-invented.
