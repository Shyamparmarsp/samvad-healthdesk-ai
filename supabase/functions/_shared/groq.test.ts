import { GROQ_MODEL, requestStructured, type GroqOptions } from "./groq.ts";

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
function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`Assertion failed: ${message} — expected ${b}, got ${a}`);
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

Deno.test("groq: the single active reasoning model is the owner-selected Qwen model", () => {
  assertEqual(GROQ_MODEL, "qwen/qwen3.8-27b", "active model id");
});

Deno.test("groq: valid schema-conforming JSON is returned", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => completion('{"duration":"3 weeks","possible_urgent":false}')) }),
    REQUEST,
  );
  assert(result.ok, "expected success");
  if (!result.ok) return;
  assertEqual(result.value.duration, "3 weeks", "duration parsed");
  assertEqual(result.value.possible_urgent, false, "flag parsed");
  assertEqual(result.model, "qwen/qwen3.8-27b", "default model recorded");
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
  assertEqual(body.model, "qwen/qwen3.8-27b", "model sent explicitly");
  assertEqual(body.response_format.type, "json_schema", "json_schema mode");
  assertEqual(body.response_format.json_schema.strict, true, "strict mode");
  assertEqual(body.response_format.json_schema.name, "probe", "schema name");
  assertEqual(body.stream, undefined, "no streaming");
});

Deno.test("groq: request body carries no reasoning, tool or sampling parameters", async () => {
  const captured: Captured[] = [];
  await requestStructured(
    baseOptions({
      fetchImpl: stubFetch(() => completion('{"duration":"3 weeks","possible_urgent":false}'), captured),
    }),
    REQUEST,
  );
  const body = JSON.parse(String(captured[0].init.body)) as Record<string, unknown>;
  // The structured-output contract needs messages/model/response_format plus the two
  // deterministic decoding controls: temperature 0 and a small completion budget (the
  // answer is one short id). No reasoning, tool or free-form sampling parameter is sent.
  assertDeepEqual(
    Object.keys(body).sort(),
    ["max_completion_tokens", "messages", "model", "response_format", "temperature"],
    "top-level keys",
  );
  assertEqual(body.temperature, 0, "deterministic decoding");
  assertEqual(body.max_completion_tokens, 32, "small completion budget");
  for (const forbidden of ["reasoning_effort", "reasoning_format", "top_p", "max_tokens", "tools", "tool_choice", "stream", "presence_penalty", "frequency_penalty"]) {
    assert(!(forbidden in body), `${forbidden} is not sent`);
  }
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

Deno.test("groq: the client timeout aborts the request and maps to timeout", async () => {
  const result = await requestStructured(
    baseOptions({
      timeoutMs: 10,
      fetchImpl: stubFetch((_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          // Never answers: only the adapter's own AbortController can end this.
          init.signal?.addEventListener("abort", () => {
            const aborted = new Error("aborted");
            aborted.name = "AbortError";
            reject(aborted);
          });
        })
      ),
    }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "timeout", "kind");
});

Deno.test("groq: a non-JSON success body maps to invalid_output", async () => {
  const result = await requestStructured(
    baseOptions({
      fetchImpl: stubFetch(() =>
        new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } })
      ),
    }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_output", "kind");
});

Deno.test("groq: a response without message content maps to invalid_output", async () => {
  for (const body of [{}, { choices: [] }, { choices: [{ message: {} }] }, { choices: [{ message: { content: null } }] }]) {
    const result = await requestStructured(
      baseOptions({ fetchImpl: stubFetch(() => jsonResponse(body)) }),
      REQUEST,
    );
    assert(!result.ok, `expected failure for ${JSON.stringify(body)}`);
    if (result.ok) return;
    assertEqual(result.kind, "invalid_output", "kind");
  }
});

Deno.test("groq: JSON null content is rejected by the validator", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => completion("null")) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_output", "kind");
});

Deno.test("groq: 400 maps to invalid_request", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 400 })) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "invalid_request", "kind");
  assertEqual(result.status, 400, "status");
});

Deno.test("groq: 502 maps to server", async () => {
  const result = await requestStructured(
    baseOptions({ fetchImpl: stubFetch(() => new Response("{}", { status: 502 })) }),
    REQUEST,
  );
  assert(!result.ok, "expected failure");
  if (result.ok) return;
  assertEqual(result.kind, "server", "kind");
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
