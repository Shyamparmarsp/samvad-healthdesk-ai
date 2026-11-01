/**
 * Gnani Timbre adapter — text to speech (v2.5).
 *
 * Verified against official documentation on 1 November 2026:
 *   https://docs.gnani.ai/api/TTS/tts-inference
 *   https://docs.gnani.ai/api/TTS/available-voices
 *
 * Fixed facts encoded here:
 *   - endpoint POST https://api.vachana.ai/api/v1/tts/inference, application/json
 *   - auth: X-API-Key-ID
 *   - model MUST be sent explicitly as "timbre-v2.5"; Timbre v2.0 is deprecated and
 *     the Python SDK still defaults to it, so omitting the field is a defect
 *   - voices are model-specific; Nalini is documented for hi-IN, Kaveri for en-IN
 *   - output is raw binary audio; mp3 is produced with container "mp3"
 *   - the maximum accepted text length is not documented (over-long text yields 500),
 *     so a conservative local cap is applied below
 *
 * Privacy: the provider body is never copied into the failure result.
 */

const DEFAULT_ENDPOINT = "https://api.vachana.ai/api/v1/tts/inference";
const MODEL = "timbre-v2.5";
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Self-imposed guard, not a documented provider limit. One approved question is far
 * shorter than this; the cap only prevents an accidental oversized synthesis.
 */
export const MAX_TEXT_CHARACTERS = 600;

export type SpeechLanguage = "hi-IN" | "en-IN";

/** Documented Timbre v2.5 voices chosen for the demo, per language. */
export const DEFAULT_VOICE: Record<SpeechLanguage, string> = {
  "hi-IN": "Nalini",
  "en-IN": "Kaveri",
};

export type TimbreFailureKind =
  | "config"
  | "invalid_text"
  | "timeout"
  | "network"
  | "auth"
  | "rate_limited"
  | "invalid_request"
  | "provider_error"
  | "invalid_response";

export type SynthesisResult =
  | { ok: true; audio: Uint8Array; contentType: string }
  | { ok: false; kind: TimbreFailureKind; status?: number };

export interface TimbreOptions {
  apiKey: string;
  timeoutMs?: number;
  endpoint?: string;
  /** Injected for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface SynthesisRequest {
  text: string;
  language: SpeechLanguage;
  /** Defaults to DEFAULT_VOICE[language]; must belong to the timbre-v2.5 catalogue. */
  voice?: string;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function failureForStatus(status: number): TimbreFailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "invalid_request";
  return "provider_error";
}

export async function synthesize(
  options: TimbreOptions,
  request: SynthesisRequest,
): Promise<SynthesisResult> {
  if (!options.apiKey) return { ok: false, kind: "config" };

  const text = request.text.trim();
  if (text.length === 0 || text.length > MAX_TEXT_CHARACTERS) {
    return { ok: false, kind: "invalid_text" };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const voice = request.voice ?? DEFAULT_VOICE[request.language];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-Key-ID": options.apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        voice,
        model: MODEL,
        language: request.language,
        speed: 1.0,
        audio_config: {
          sample_rate: 24000,
          num_channels: 1,
          sample_width: 2,
          encoding: "linear_pcm",
          container: "mp3",
        },
      }),
    });
  } catch (error) {
    return { ok: false, kind: isAbortError(error) ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, kind: failureForStatus(response.status), status: response.status };
  }

  let audio: Uint8Array;
  try {
    audio = new Uint8Array(await response.arrayBuffer());
  } catch {
    return { ok: false, kind: "invalid_response", status: response.status };
  }

  if (audio.byteLength === 0) {
    return { ok: false, kind: "invalid_response", status: response.status };
  }

  return {
    ok: true,
    audio,
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}
