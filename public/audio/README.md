# Cached Prompt Audio

Opening intake prompts use pre-generated static audio for the greeting and the four fixed
questions so runtime intake sessions never issue paid TTS calls for repeated opening
messages.

## Active Audio Assets (Gnani Timbre `timbre-v2.5`, 24 kHz MP3)

| File | Voice | Spoken text source |
|---|---|---|
| `public/audio/en/greeting.mp3` | `Kaveri` (`en-IN`) | `src/i18n/en.ts` → `consent.greetingAudio` |
| `public/audio/en/ask-name.mp3` | `Kaveri` (`en-IN`) | `supabase/functions/_shared/questions.ts` → `QUESTIONS.name.en` |
| `public/audio/en/ask-age.mp3` | `Kaveri` (`en-IN`) | `supabase/functions/_shared/questions.ts` → `QUESTIONS.age.en` |
| `public/audio/en/ask-gender.mp3` | `Kaveri` (`en-IN`) | `supabase/functions/_shared/questions.ts` → `QUESTIONS.gender.en` |
| `public/audio/en/ask-primary-concern.mp3` | `Kaveri` (`en-IN`) | `supabase/functions/_shared/questions.ts` → `QUESTIONS.primary_concern.en` |
| `public/audio/hi/greeting.mp3` | `Nalini` (`hi-IN`) | `src/i18n/hi.ts` → `consent.greetingAudio` |
| `public/audio/hi/ask-name.mp3` | `Nalini` (`hi-IN`) | `supabase/functions/_shared/questions.ts` → `QUESTIONS.name.hi` |
| `public/audio/hi/ask-age.mp3` | `Nalini` (`hi-IN`) | `supabase/functions/_shared/questions.ts` → `QUESTIONS.age.hi` |
| `public/audio/hi/ask-gender.mp3` | `Nalini` (`hi-IN`) | `supabase/functions/_shared/questions.ts` → `QUESTIONS.gender.hi` |
| `public/audio/hi/ask-primary-concern.mp3` | `Nalini` (`hi-IN`) | `supabase/functions/_shared/questions.ts` → `QUESTIONS.primary_concern.hi` |

Legacy 1-second silent `.wav` placeholder files were removed after generating and
verifying these MP3 assets. `src/lib/audio/prompt-audio.ts` resolves only `/audio/<lang>/<promptId>.mp3`
and explicitly excludes placeholder suffixes.

## Operational Rules & Verification

- Never call the live `speak` / Timbre API at runtime for these cached opening prompts.
- Never generate audio during Vercel builds.
- Verify committed audio integrity locally without network calls:

```bash
deno run --allow-read --allow-env scripts/generate-prompt-audio.ts --verify
```

- Manifest inventory: [`docs/release-readiness/AUDIO-ASSETS-MANIFEST.md`](../../docs/release-readiness/AUDIO-ASSETS-MANIFEST.md)
- If prompts change and regeneration is approved by the owner, reserve the 10 Timbre attempts in the IST daily cap before running `scripts/generate-prompt-audio.ts --live --i-authorize-paid-generation`.

