import {
  DEFAULT_VOICE,
  MAX_TEXT_CHARACTERS,
  synthesize,
  type TimbreOptions,
} from "./timbre.ts";

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

function audioResponse(bytes: number[] = [9, 8, 7]): Response {
  const buffer = new Uint8Array(bytes).buffer as ArrayBuffer;
  return new Response(buffer, { status: 200, headers: { "content-type": "audio/mpeg" } });
}

function baseOptions(overrides: Partial<TimbreOptions> = {}): TimbreOptions {
  return { apiKey: "test-key", timeoutMs: 50, ...overrides };
}

Deno.test("timbre: hindi audio is returned", async () => {
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => audioResponse()) }),
    { text: "क्या आपका नाम क्या है?", language: "hi-IN" },
  );
  assert(result.ok, "expected success");
  if (!result.ok) return;
  assertEqual(result.audio.byteLength, 3, "audio bytes");
  assertEqual(result.contentType, "audio/mpeg", "content type");
});

Deno.test("timbre: english audio is returned", async () => {
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => audioResponse()) }),
    { text: "What is your name?", language: "en-IN" },
  );
  assert(result.ok, "expected success");
});

Deno.test("timbre: request sends the explicit v2.5 model, voice and mp3 config", async () => {
  const captured: Captured[] = [];
  await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => audioResponse(), captured) }),
    { text: "What is your name?", language: "en-IN" },
  );
  assertEqual(captured.length, 1, "exactly one request");
  assertEqual(captured[0].url, "https://api.vachana.ai/api/v1/tts/inference", "endpoint");
  const headers = captured[0].init.headers as Record<string, string>;
  assertEqual(headers["X-API-Key-ID"], "test-key", "auth header");
  const body = JSON.parse(String(captured[0].init.body)) as {
    text: string;
    voice: string;
    model: string;
    language: string;
    audio_config: { container: string; sample_rate: number; num_channels: number };
  };
  assertEqual(body.model, "timbre-v2.5", "model sent explicitly, never omitted");
  assertEqual(body.voice, "Kaveri", "english default voice");
  assertEqual(body.language, "en-IN", "language");
  assertEqual(body.audio_config.container, "mp3", "mp3 container");
  assertEqual(body.audio_config.sample_rate, 24000, "sample rate");
  assertEqual(body.audio_config.num_channels, 1, "mono");
});

Deno.test("timbre: hindi default voice is Nalini", async () => {
  const captured: Captured[] = [];
  await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => audioResponse(), captured) }),
    { text: "नमस्ते", language: "hi-IN" },
  );
  const body = JSON.parse(String(captured[0].init.body)) as { voice: string };
  assertEqual(body.voice, "Nalini", "hindi default voice");
  assertEqual(DEFAULT_VOICE["hi-IN"], "Nalini", "constant matches documentation");
});

Deno.test("timbre: an explicit voice overrides the default", async () => {
  const captured: Captured[] = [];
  await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => audioResponse(), captured) }),
    { text: "नमस्ते", language: "hi-IN", voice: "Deepak" },
  );
  const body = JSON.parse(String(captured[0].init.body)) as { voice: string };
  assertEqual(body.voice, "Deepak", "explicit voice honoured");
});

Deno.test("timbre: empty text is rejected without a request", async () => {
  const captured: Captured[] = [];
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => audioResponse(), captured) }),
    { text: "   ", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_text", "kind");
  assertEqual(captured.length, 0, "no provider request");
});

Deno.test("timbre: oversized text is rejected without a request", async () => {
  const captured: Captured[] = [];
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => audioResponse(), captured) }),
    { text: "a".repeat(MAX_TEXT_CHARACTERS + 1), language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_text", "kind");
  assertEqual(captured.length, 0, "no provider request");
});

Deno.test("timbre: 400 maps to invalid_request (unknown voice)", async () => {
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 400 })) }),
    { text: "Hello", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_request", "kind");
});

Deno.test("timbre: 429 maps to rate_limited", async () => {
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 429 })) }),
    { text: "Hello", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "rate_limited", "kind");
});

Deno.test("timbre: 500 maps to provider_error", async () => {
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 500 })) }),
    { text: "Hello", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "provider_error", "kind");
});

Deno.test("timbre: empty audio body maps to invalid_response", async () => {
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => new Response(new ArrayBuffer(0), { status: 200 })) }),
    { text: "Hello", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_response", "kind");
});

Deno.test("timbre: abort maps to timeout", async () => {
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  const result = await synthesize(
    baseOptions({ fetchImpl: stubFetch(() => { throw aborted; }) }),
    { text: "Hello", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "timeout", "kind");
});

Deno.test("timbre: missing key fails without a request", async () => {
  const captured: Captured[] = [];
  const result = await synthesize(
    baseOptions({ apiKey: "", fetchImpl: stubFetch(() => audioResponse(), captured) }),
    { text: "Hello", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "config", "kind");
  assertEqual(captured.length, 0, "no request attempted");
});

Deno.test("timbre: provider body is never echoed in the failure", async () => {
  const result = await synthesize(
    baseOptions({
      fetchImpl: stubFetch(() =>
        new Response(JSON.stringify({ success: false, message: "patient text leaked" }), { status: 500 })
      ),
    }),
    { text: "Hello", language: "en-IN" },
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assert(!JSON.stringify(result).includes("leaked"), "no provider text in the result");
});
