/**
 * Groq adapter — constrained structured extraction.
 *
 * Verified against official documentation on 1 November 2026:
 *   https://console.groq.com/docs/structured-outputs
 *   https://console.groq.com/docs/models
 *
 * Fixed facts encoded here:
 *   - base URL https://api.groq.com/openai/v1, endpoint POST /chat/completions
 *   - auth: Authorization: Bearer <key>
 *   - response_format.json_schema with strict: true is supported on qwen/qwen3.8-27b
 *   - streaming and tool use are NOT supported together with structured outputs
 *
 * Model selection (owner decision): GROQ_MODEL is the single active reasoning model.
 * `qwen/qwen3.8-27b` replaced the previous default model; the historical record lives in
 * `docs/provider-notes.md` §1.3, not in runtime code. There is no model fallback: a
 * provider failure returns a typed failure and the caller uses its scripted/deterministic
 * fallback, never a second model. No reasoning-specific request parameter
 * (`reasoning_effort`, `reasoning_format`) is sent, because none is documented as
 * required for structured output, and the documented contract for this model allows the
 * same body. Keep it that way unless the owner authorizes a change.
 *
 * Deliberately NOT encoded: any request timeout value, retry policy or rate-limit
 * assumption. No timeout is documented for /chat/completions, so the caller supplies
 * one and a timeout is always treated as "use the scripted fallback".
 *
 * Privacy: the provider body is never copied into the failure result, because it can
 * echo patient text. Failures expose an enum and an HTTP status only.
 */

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
/**
 * The only reasoning model this application selects. Owner-selected migration target.
 * Documented as supporting `response_format.json_schema` with `strict: true` in
 * `docs/provider-notes.md` §1.2. Max completion tokens: 16,384 (requests here are tiny).
 */
export const GROQ_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_TIMEOUT_MS = 6_000;

export type GroqFailureKind =
  | "config"
  | "timeout"
  | "network"
  | "auth"
  | "rate_limited"
  | "invalid_request"
  | "server"
  | "invalid_output";

export type GroqResult<T> =
  | { ok: true; value: T; model: string; durationMs: number }
  | { ok: false; kind: GroqFailureKind; status?: number; durationMs: number };

export interface GroqOptions {
  apiKey: string;
  // There is deliberately no `model` option: the model is not caller-selectable, so no
  // code path can select a second reasoning model. `GROQ_MODEL` is the only one sent.
  timeoutMs?: number;
  baseUrl?: string;
  /** Injected for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface StructuredRequest<T> {
  /** Short stable name for the JSON schema. */
  schemaName: string;
  /** JSON Schema with every property required and additionalProperties: false. */
  schema: Record<string, unknown>;
  system: string;
  user: string;
  /**
   * Runtime validation of the parsed payload. Return the narrowed value, or null
   * to reject the whole response (unknown field, invented fact, bad enum).
   */
  validate: (parsed: unknown) => T | null;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function statusToKind(status: number): GroqFailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "invalid_request";
}

/** Sends one constrained request. Never retries: the caller owns fallback policy. */
export async function requestStructured<T>(
  options: GroqOptions,
  request: StructuredRequest<T>,
): Promise<GroqResult<T>> {
  if (!options.apiKey) return { ok: false, kind: "config", durationMs: 0 };

  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  const model = GROQ_MODEL;
  const doFetch = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await doFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        // The answer is one short id, so a small completion budget is enough and keeps
        // the model from spending time on extra tokens. Deterministic decoding keeps the
        // selection stable for identical inputs.
        temperature: 0,
        max_completion_tokens: 32,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      }),
    });
  } catch (error) {
    return { ok: false, kind: isAbortError(error) ? "timeout" : "network", durationMs: elapsed() };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Drain the body without reading it into the result.
    await response.body?.cancel().catch(() => {});
    return { ok: false, kind: statusToKind(response.status), status: response.status, durationMs: elapsed() };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, kind: "invalid_output", status: response.status, durationMs: elapsed() };
  }

  const content = extractContent(payload);
  if (content === null) return { ok: false, kind: "invalid_output", status: response.status, durationMs: elapsed() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, kind: "invalid_output", status: response.status, durationMs: elapsed() };
  }

  let value: T | null;
  try {
    value = request.validate(parsed);
  } catch {
    return { ok: false, kind: "invalid_output", status: response.status, durationMs: elapsed() };
  }
  if (value === null) return { ok: false, kind: "invalid_output", status: response.status, durationMs: elapsed() };

  return { ok: true, value, model, durationMs: elapsed() };
}

function extractContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

/** Constant-time-free helper: rejects any unknown key in a validated object. */
export function hasOnlyKeys(value: unknown, allowed: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== allowed.length) return false;
  return keys.every((key) => allowed.includes(key));
}
