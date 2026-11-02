# Prompt-audio asset manifest

Generated: 2026-11-02T20:49:52.348Z

Model `timbre-v2.5`, container `mp3`, 24 kHz. Voices: `Kaveri` (en-IN), `Nalini` (hi-IN).

| # | Prompt | Lang | Voice | Target path | Approved source | Current state | Legacy placeholder |
|---|---|---|---|---|---|---|---|
| 1 | `greeting` | en | Kaveri | `public/audio/en/greeting.mp3` | src/i18n/en.ts → consent.greetingAudio | missing | `public/audio/greeting_en.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 2 | `ask-name` | en | Kaveri | `public/audio/en/ask-name.mp3` | supabase/functions/_shared/questions.ts → QUESTIONS.name.en | missing | `public/audio/ask-name_en.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 3 | `ask-age` | en | Kaveri | `public/audio/en/ask-age.mp3` | supabase/functions/_shared/questions.ts → QUESTIONS.age.en | missing | `public/audio/ask-age_en.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 4 | `ask-gender` | en | Kaveri | `public/audio/en/ask-gender.mp3` | supabase/functions/_shared/questions.ts → QUESTIONS.gender.en | missing | `public/audio/ask-gender_en.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 5 | `ask-primary-concern` | en | Kaveri | `public/audio/en/ask-primary-concern.mp3` | supabase/functions/_shared/questions.ts → QUESTIONS.primary_concern.en | missing | `public/audio/ask-primary-concern_en.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 6 | `greeting` | hi | Nalini | `public/audio/hi/greeting.mp3` | src/i18n/hi.ts → consent.greetingAudio | missing | `public/audio/greeting_hi.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 7 | `ask-name` | hi | Nalini | `public/audio/hi/ask-name.mp3` | supabase/functions/_shared/questions.ts → QUESTIONS.name.hi | missing | `public/audio/ask-name_hi.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 8 | `ask-age` | hi | Nalini | `public/audio/hi/ask-age.mp3` | supabase/functions/_shared/questions.ts → QUESTIONS.age.hi | missing | `public/audio/ask-age_hi.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 9 | `ask-gender` | hi | Nalini | `public/audio/hi/ask-gender.mp3` | supabase/functions/_shared/questions.ts → QUESTIONS.gender.hi | missing | `public/audio/ask-gender_hi.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |
| 10 | `ask-primary-concern` | hi | Nalini | `public/audio/hi/ask-primary-concern.mp3` | supabase/functions/_shared/questions.ts → QUESTIONS.primary_concern.hi | missing | `public/audio/ask-primary-concern_hi.wav` — 1.00s, -91 dB, INVALID — not a decodable MP3 (the production container is mp3); mean volume -91 dB is at or below the silence floor; peak volume -91 dB is too quiet to be speech |

## Speech source (owner-reviewed; never rewritten by the generator)

| Prompt | Lang | Text |
|---|---|---|
| `greeting` | en | Hello! Before we begin, please note that I am an AI assistant and not a medical doctor. I will collect preliminary details about your concern to draft a report for hospital staff. Do you agree to proceed? |
| `ask-name` | en | What is your name? |
| `ask-age` | en | How old are you, in years? |
| `ask-gender` | en | What is your gender? |
| `ask-primary-concern` | en | What is your main concern today? |
| `greeting` | hi | नमस्ते! शुरू करने से पहले, कृपया ध्यान दें कि मैं एक एआई सहायक हूँ, कोई चिकित्सक नहीं। मैं अस्पताल के कर्मचारियों के लिए रिपोर्ट तैयार करने हेतु प्रारंभिक विवरण एकत्र करूँगा। क्या आप आगे बढ़ने के लिए सहमत हैं? |
| `ask-name` | hi | आपका नाम क्या है? |
| `ask-age` | hi | आपकी उम्र कितने साल है? |
| `ask-gender` | hi | कृपया अपना लिंग चुनें। |
| `ask-primary-concern` | hi | आज आपकी मुख्य समस्या क्या है? |

## Generation

```bash
# dry run: inventory only, no network, no writes to public/audio
deno run --allow-read --allow-write --allow-env scripts/generate-prompt-audio.ts

# validate whatever is currently in public/audio (no network)
deno run --allow-read --allow-write --allow-env --allow-run scripts/generate-prompt-audio.ts --verify

# paid generation, double opt-in, one request per prompt, no retries
GNANI_API_KEY=… deno run --allow-read --allow-write --allow-env --allow-net --allow-run \
  scripts/generate-prompt-audio.ts --live --i-authorize-paid-generation
```

Before a live run, reserve exactly `requestCount` Timbre attempts in the
application limit for the current IST day (AGENTS.md). Never lower the limit by
more than the number of attempts you will actually make.

## Owner listening pass (required before these are called approved)

A passing validator proves the file is decodable, long enough and not silent. It
does not prove the words are intelligible or correctly pronounced. The owner must
listen to at least one English and one Hindi greeting and confirm:

1. the words match the approved text;
2. the language and script are correct;
3. no prompt is truncated or clipped;
4. the greeting does not promise diagnosis or treatment.

Until that pass is recorded, D-06 stays `OWNER ACTION` in the defect register.
