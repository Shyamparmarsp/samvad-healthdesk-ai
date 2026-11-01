import {
  ACCEPTED_MIME_TYPES,
  isAcceptedAudioType,
  transcribe,
  type PrismaOptions,
} from "./prisma.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

interface Captured {
  url: string;
  init: RequestInit;
}

function stubFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
  captured?: Captured[],
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const requestInit = init ?? {};
    captured?.push({ url, init: requestInit });
    try {
      return Promise.resolve(handler(url, requestInit));
    } catch (error) {
      return Promise.reject(error);
    }
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const AUDIO = new Uint8Array([1, 2, 3, 4]);

function baseOptions(overrides: Partial<PrismaOptions> = {}): PrismaOptions {
  return { apiKey: "test-key", timeoutMs: 50, ...overrides };
}

Deno.test("prisma: english transcript is returned", async () => {
  const result = await transcribe(
    baseOptions({
      fetchImpl: stubFetch(() =>
        jsonResponse({
          success: true,
          request_id: "req_1",
          transcript: "My knee hurts when I walk.",
          model: "prisma-v2.5",
          output: { literal: "My knee hurts when I walk." },
        })
      ),
    }),
    { audio: AUDIO, mimeType: "audio/wav", language: "en-IN" },
  );
  assert(result.ok, "expected success");
  if (!result.ok) return;
  assertEqual(result.transcript, "My knee hurts when I walk.", "transcript");
  assertEqual(result.model, "prisma-v2.5", "model reported");
  assertEqual(result.requestId, "req_1", "request id");
});

Deno.test("prisma: hindi transcript is returned unchanged (Devanagari)", async () => {
  const result = await transcribe(
    baseOptions({
      fetchImpl: stubFetch(() =>
        jsonResponse({ success: true, transcript: "सीने में दर्द है", model: "prisma-v2.5" })
      ),
    }),
    { audio: AUDIO, mimeType: "audio/wav", language: "hi-IN" },
  );
  assert(result.ok, "expected success");
  if (!result.ok) return;
  assertEqual(result.transcript, "सीने में दर्द है", "devanagari preserved");
});

Deno.test("prisma: empty transcript is a success, not an error", async () => {
  const result = await transcribe(
    baseOptions({
      fetchImpl: stubFetch(() => jsonResponse({ success: true, transcript: "", model: "prisma-v2.5" })),
    }),
    { audio: AUDIO, mimeType: "audio/wav", language: "en-IN" },
  );
  assert(result.ok, "expected success");
  if (!result.ok) return;
  assertEqual(result.transcript, "", "empty transcript");
});

Deno.test("prisma: webm is rejected locally without a request", async () => {
  const captured: Captured[] = [];
  const result = await transcribe(
    baseOptions({ fetchImpl: stubFetch(() => jsonResponse({}), captured) }),
    { audio: AUDIO, mimeType: "audio/webm", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "unsupported_format", "kind");
  assertEqual(captured.length, 0, "no provider request");
});

Deno.test("prisma: accepted mime types match the documented container list", () => {
  for (const mime of ["audio/wav", "audio/mpeg", "audio/ogg", "audio/flac", "audio/aac", "audio/mp4"]) {
    assert(isAcceptedAudioType(mime), `${mime} accepted`);
  }
  assert(!isAcceptedAudioType("audio/webm"), "webm rejected");
  assert(!isAcceptedAudioType("video/mp4"), "video container rejected");
  assert(ACCEPTED_MIME_TYPES.length > 0, "list not empty");
});

Deno.test("prisma: zero-byte audio is rejected without a request", async () => {
  const captured: Captured[] = [];
  const result = await transcribe(
    baseOptions({ fetchImpl: stubFetch(() => jsonResponse({}), captured) }),
    { audio: new Uint8Array(), mimeType: "audio/wav", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "audio_rejected", "kind");
  assertEqual(captured.length, 0, "no provider request");
});

Deno.test("prisma: request is multipart to /stt/v3 with the api key header", async () => {
  const captured: Captured[] = [];
  await transcribe(
    baseOptions({
      fetchImpl: stubFetch(() => jsonResponse({ success: true, transcript: "ok" }), captured),
    }),
    { audio: AUDIO, mimeType: "audio/wav", language: "hi-IN" },
  );
  assertEqual(captured.length, 1, "exactly one request");
  assertEqual(captured[0].url, "https://api.vachana.ai/stt/v3", "endpoint");
  const headers = captured[0].init.headers as Record<string, string>;
  assertEqual(headers["X-API-Key-ID"], "test-key", "auth header");
  const form = captured[0].init.body;
  assert(form instanceof FormData, "multipart body");
  if (!(form instanceof FormData)) return;
  assertEqual(form.get("language_code"), "hi-IN", "language field");
  const file = form.get("audio_file");
  assert(file instanceof File, "audio_file is a file part");
  if (file instanceof File) assertEqual(file.name, "answer.wav", "filename extension");
  assertEqual(form.get("model"), null, "model omitted so v2.5 is used");
});

Deno.test("prisma: 400 maps to audio_rejected", async () => {
  const result = await transcribe(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 400 })) }),
    { audio: AUDIO, mimeType: "audio/wav", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "audio_rejected", "kind");
});

Deno.test("prisma: 429 maps to rate_limited", async () => {
  const result = await transcribe(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 429 })) }),
    { audio: AUDIO, mimeType: "audio/wav", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "rate_limited", "kind");
});

Deno.test("prisma: 401 maps to auth", async () => {
  const result = await transcribe(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 401 })) }),
    { audio: AUDIO, mimeType: "audio/wav", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "auth", "kind");
});

Deno.test("prisma: malformed body maps to invalid_response", async () => {
  const result = await transcribe(
    baseOptions({ fetchImpl: stubFetch(() => jsonResponse({ success: true })) }),
    { audio: AUDIO, mimeType: "audio/wav", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_response", "kind");
});

Deno.test("prisma: abort maps to timeout", async () => {
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  const result = await transcribe(
    baseOptions({ fetchImpl: stubFetch(() => { throw aborted; }) }),
    { audio: AUDIO, mimeType: "audio/wav", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "timeout", "kind");
});

Deno.test("prisma: missing key fails without a request", async () => {
  const captured: Captured[] = [];
  const result = await transcribe(
    baseOptions({ apiKey: "", fetchImpl: stubFetch(() => jsonResponse({}), captured) }),
    { audio: AUDIO, mimeType: "audio/wav", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "config", "kind");
  assertEqual(captured.length, 0, "no request attempted");
});
