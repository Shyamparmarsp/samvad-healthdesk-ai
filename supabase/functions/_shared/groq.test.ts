import { requestStructured, type GroqOptions } from "./groq.ts";

// ---------------------------------------------------------------------------
// Minimal local assertions: no external dependency, so tests run offline.
// ---------------------------------------------------------------------------
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

function completion(content: string): Response {
  return jsonResponse({ choices: [{ message: { role: "assistant", content } }] });
}

const SCHEMA = {
  type: "object",
  properties: { duration: { type: "string" }, possible_urgent: { type: "boolean" } },
  required: ["duration", "possible_urgent"],
  additionalProperties: false,
} as const;

type Probe = { duration: string; possible_urgent: boolean };

function probeValidator(parsed: unknown): Probe | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("duration") || !keys.includes("possible_urgent")) return null;
  if (typeof value.duration !== "string") return null;
  if (typeof value.possible_urgent !== "boolean") return null;
  return { duration: value.duration, possible_urgent: value.possible_urgent };
}

function baseOptions(overrides: Partial<GroqOptions> = {}): GroqOptions {
  return { apiKey: "test-key", timeoutMs: 50, ...overrides };
}

const REQUEST = {
  schemaName: "probe",
  schema: SCHEMA,
  system: "Return JSON only.",
  user: "Synthetic: knee pain for three weeks.",
  validate: probeValidator,
};

Deno.test("groq: valid schema-conforming JSON is returned", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => completion('{"duration":"3 weeks","possible_urgent":false}')) }),
    REQUEST,
  );
  assert(result.ok, "expected success");
  if (!result.ok) return;
  assertEqual(result.value.duration, "3 weeks", "duration parsed");
  assertEqual(result.value.possible_urgent, false, "flag parsed");
  assertEqual(result.model, "openai/gpt-oss-20b", "default model recorded");
});

Deno.test("groq: request uses chat/completions, strict schema and bearer auth", async () => {
  const captured: Captured[] = [];
  await requestStructured(
    baseOptions({
      fetchImpl: stubFetch(
        () => completion('{"duration":"3 weeks","possible_urgent":false}'),
        captured,
      ),
    }),
    REQUEST,
  );
  assertEqual(captured.length, 1, "exactly one request");
  assertEqual(captured[0].url, "https://api.groq.com/openai/v1/chat/completions", "endpoint");
  const headers = captured[0].init.headers as Record<string, string>;
  assertEqual(headers.Authorization, "Bearer test-key", "auth header");
  const body = JSON.parse(String(captured[0].init.body)) as {
    model: string;
    response_format: { type: string; json_schema: { name: string; strict: boolean } };
    stream?: unknown;
  };
  assertEqual(body.model, "openai/gpt-oss-20b", "model sent explicitly");
  assertEqual(body.response_format.type, "json_schema", "json_schema mode");
  assertEqual(body.response_format.json_schema.strict, true, "strict mode");
  assertEqual(body.response_format.json_schema.name, "probe", "schema name");
  assertEqual(body.stream, undefined, "no streaming");
});

Deno.test("groq: malformed JSON content is rejected", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => completion("not json")) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_output", "kind");
});

Deno.test("groq: schema-invalid payload is rejected by the validator", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => completion('{"duration":"3 weeks"}')) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_output", "missing field rejected");
});

Deno.test("groq: unknown field is rejected", async () => {
  const result = await requestStructured(
    baseOptions({
      fetchImpl: stubFetch(() =>
        completion('{"duration":"3 weeks","possible_urgent":false,"diagnosis":"sprain"}')
      ),
    }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_output", "extra field rejected");
});

Deno.test("groq: 401 maps to auth", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 401 })) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "auth", "kind");
  assertEqual(result.status, 401, "status");
});

Deno.test("groq: 429 maps to rate_limited", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 429 })) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "rate_limited", "kind");
});

Deno.test("groq: 500 maps to server", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 500 })) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "server", "kind");
});

Deno.test("groq: abort maps to timeout", async () => {
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => { throw aborted; }) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "timeout", "kind");
});

Deno.test("groq: transport error maps to network", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => { throw new TypeError("connection reset"); }) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "network", "kind");
});

Deno.test("groq: missing key fails without a request", async () => {
  const captured: Captured[] = [];
  const result = await requestStructured(
    baseOptions({
      apiKey: "",
      fetchImpl: stubFetch(() => completion("{}"), captured),
    }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "config", "kind");
  assertEqual(captured.length, 0, "no request attempted");
});

Deno.test("groq: provider body is never echoed in the failure", async () => {
  const result = await requestStructured(
    baseOptions({
      fetchImpl: stubFetch(() =>
        new Response(JSON.stringify({ error: { message: "patient reports chest pain" } }), { status: 500 })
      ),
    }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assert(!JSON.stringify(result).includes("chest pain"), "no health text in the result");
});
