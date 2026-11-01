/**
 * Gnani Prisma adapter — speech to text (v2.5).
 *
 * Verified against official documentation on 1 November 2026:
 *   https://docs.gnani.ai/api/STT/speech-to-text
 *   https://docs.gnani.ai/api/introduction/introduction
 *
 * Fixed facts encoded here:
 *   - base URL https://api.vachana.ai, endpoint POST /stt/v3, multipart/form-data
 *   - auth: X-API-Key-ID
 *   - fields: audio_file (required), language_code (required, one code for v2.5)
 *   - model is omitted so the service uses Prisma v2.5 (response reports prisma-v2.5)
 *   - accepted containers: WAV, MP3, OGG, FLAC, AAC, M4A. WebM is NOT accepted.
 *   - maximum duration 30 seconds
 *   - an empty transcript is a successful result, not an error
 *
 * Deliberately NOT encoded: a timeout value or retry policy. No request timeout is
 * documented for v2.5, so the caller supplies one.
 *
 * Privacy: the response body is never copied into the failure result and the audio
 * is never retained after the request completes.
 */

const DEFAULT_BASE_URL = "https://api.vachana.ai";
const ENDPOINT_PATH = "/stt/v3";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_AUDIO_SECONDS = 30;

/**
 * MIME types the service accepts, mapped to the filename extension the service
 * validates. Anything else — notably audio/webm — is rejected before any request.
 */
const ACCEPTED_MIME: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

export const ACCEPTED_MIME_TYPES: readonly string[] = Object.keys(ACCEPTED_MIME);
export const MAX_AUDIO_DURATION_SECONDS = MAX_AUDIO_SECONDS;

export type TranscriptionLanguage = "en-IN" | "hi-IN";

export type PrismaFailureKind =
  | "config"
  | "unsupported_format"
  | "timeout"
  | "network"
  | "auth"
  | "rate_limited"
  | "audio_rejected"
  | "provider_error"
  | "invalid_response";

export type TranscriptionResult =
  | {
    ok: true;
    /** May be an empty string: the service reports "no speech" this way. */
    transcript: string;
    model: string;
    requestId: string | null;
  }
  | { ok: false; kind: PrismaFailureKind; status?: number };

export interface PrismaOptions {
  apiKey: string;
  timeoutMs?: number;
  baseUrl?: string;
  /** Injected for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface TranscribeRequest {
  audio: Uint8Array;
  mimeType: string;
  language: TranscriptionLanguage;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function failureForStatus(status: number): PrismaFailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 413 || status === 422) return "audio_rejected";
  return "provider_error";
}

/** Returns true when the browser-produced MIME type can be uploaded at all. */
export function isAcceptedAudioType(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ACCEPTED_MIME, mimeType.toLowerCase());
}

export async function transcribe(
  options: PrismaOptions,
  request: TranscribeRequest,
): Promise<TranscriptionResult> {
  if (!options.apiKey) return { ok: false, kind: "config" };

  const mimeType = request.mimeType.toLowerCase();
  const extension = ACCEPTED_MIME[mimeType];
  if (!extension) return { ok: false, kind: "unsupported_format" };
  if (request.audio.byteLength === 0) return { ok: false, kind: "audio_rejected" };

  const doFetch = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const form = new FormData();
  // Copy into a fresh ArrayBuffer-backed view so FormData never sees a detached buffer.
  const bytes = new Uint8Array(request.audio);
  form.append("audio_file", new Blob([bytes], { type: mimeType }), `answer.${extension}`);
  form.append("language_code", request.language);

  let response: Response;
  try {
    response = await doFetch(`${baseUrl}${ENDPOINT_PATH}`, {
      method: "POST",
      headers: { "X-API-Key-ID": options.apiKey },
      signal: controller.signal,
      body: form,
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

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, kind: "invalid_response", status: response.status };
  }

  if (typeof payload !== "object" || payload === null) {
    return { ok: false, kind: "invalid_response", status: response.status };
  }

  const body = payload as {
    success?: unknown;
    transcript?: unknown;
    model?: unknown;
    request_id?: unknown;
  };

  if (body.success !== true || typeof body.transcript !== "string") {
    return { ok: false, kind: "invalid_response", status: response.status };
  }

  return {
    ok: true,
    transcript: body.transcript,
    model: typeof body.model === "string" ? body.model : "prisma-v2.5",
    requestId: typeof body.request_id === "string" ? body.request_id : null,
  };
}
