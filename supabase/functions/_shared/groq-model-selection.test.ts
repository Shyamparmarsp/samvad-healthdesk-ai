/**
 * Model-selection guards for the Groq reasoning paths.
 *
 * AGENTS.md: exactly one reasoning provider (Groq) and, after the owner-selected
 * migration, exactly one reasoning model (`qwen/qwen3.8-27b`). These tests assert the
 * **actual request body** produced by the two shipped call sites — department suggestion
 * and adaptive-question selection — rather than only the adapter constant, so a future
 * edit that reintroduces a GPT model or a silent second model fails here.
 *
 * No network access: every transport is an injected stub. No live Groq call is made.
 */

import { GROQ_MODEL } from "./groq.ts";
import { suggestDepartment } from "./groq-routing.ts";
import { selectAdaptiveQuestion } from "./intake/select.ts";
import { getQuestion } from "./intake/question-bank.ts";
import { assert, assertEqual } from "./testing.ts";

const EXPECTED_MODEL = "qwen/qwen3.8-27b";

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(
  handler: () => Response,
  captured?: Captured[],
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (captured) {
      captured.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    }
    return Promise.resolve(handler());
  }) as typeof fetch;
}

function candidates() {
  const first = getQuestion("GM-001");
  const second = getQuestion("GM-002");
  assert(first !== null && second !== null, "approved bank questions exist");
  return [first!, second!];
}

Deno.test("model selection: the adapter default is the owner-selected Qwen model", () => {
  assertEqual(GROQ_MODEL, EXPECTED_MODEL, "adapter constant");
});

Deno.test("model selection: department suggestion sends exactly the Qwen model", async () => {
  const captured: Captured[] = [];
  const department = await suggestDepartment(
    { apiKey: "stub-key", fetchImpl: stubFetch(() => completion('{"department_key":"orthopedics"}'), captured) },
    "knee pain for three weeks",
  );
  assertEqual(captured.length, 1, "one request");
  assertEqual(captured[0].body.model, EXPECTED_MODEL, "model in the department request");
  assertEqual(department, "orthopedics", "mocked answer parsed");
});

Deno.test("model selection: adaptive-question selection sends exactly the Qwen model", async () => {
  const captured: Captured[] = [];
  const picked = await selectAdaptiveQuestion(
    { apiKey: "stub-key", fetchImpl: stubFetch(() => completion('{"question_id":"GM-002"}'), captured) },
    candidates(),
    "fever since yesterday",
  );
  assertEqual(captured.length, 1, "one request");
  assertEqual(captured[0].body.model, EXPECTED_MODEL, "model in the adaptive request");
  assertEqual(picked?.id, "GM-002", "approved id from the mocked answer");
  assertEqual(picked?.source, "model", "source is the model");
});

Deno.test("model selection: strict JSON Schema is requested on both paths", async () => {
  const captured: Captured[] = [];
  await suggestDepartment(
    { apiKey: "k", fetchImpl: stubFetch(() => completion('{"department_key":"cardiology"}'), captured) },
    "chest pain",
  );
  await selectAdaptiveQuestion(
    { apiKey: "k", fetchImpl: stubFetch(() => completion('{"question_id":"GM-001"}'), captured) },
    candidates(),
    "fever",
  );
  assertEqual(captured.length, 2, "two requests");
  for (const request of captured) {
    const format = request.body.response_format as {
      type: string;
      json_schema: { strict: boolean; schema: { additionalProperties: boolean; required: string[] } };
    };
    assertEqual(request.body.model, EXPECTED_MODEL, "model on every reasoning path");
    assertEqual(format.type, "json_schema", "json_schema mode");
    assertEqual(format.json_schema.strict, true, "strict mode");
    assertEqual(format.json_schema.schema.additionalProperties, false, "closed object");
    assert(format.json_schema.schema.required.length > 0, "required list present");
    assert(!("stream" in request.body), "no streaming");
    assert(!("tools" in request.body), "no tool use");
    assert(!("reasoning_effort" in request.body), "no reasoning parameter sent");
  }
});

Deno.test("model selection: no GPT model id reaches any reasoning request", async () => {
  const captured: Captured[] = [];
  await suggestDepartment(
    { apiKey: "k", fetchImpl: stubFetch(() => completion('{"department_key":"general_medicine"}'), captured) },
    "tired",
  );
  await selectAdaptiveQuestion(
    { apiKey: "k", fetchImpl: stubFetch(() => completion('{"question_id":"GM-001"}'), captured) },
    candidates(),
    "fever",
  );
  assertEqual(captured.length, 2, "two requests");
  for (const request of captured) {
    assertEqual(request.body.model, EXPECTED_MODEL, "only the Qwen model is selected");
    assert(!String(request.body.model).includes("gpt"), "no GPT model id");
    assert(!String(request.body.model).includes("oss"), "no OSS model id");
  }
});

Deno.test("model selection: malformed provider output falls back deterministically", async () => {
  const routing = await suggestDepartment(
    { apiKey: "k", fetchImpl: stubFetch(() => completion("not json at all")) },
    "knee pain",
  );
  assertEqual(routing, null, "routing yields null so routing.ts can fall back");

  const picked = await selectAdaptiveQuestion(
    { apiKey: "k", fetchImpl: stubFetch(() => completion('{"question_id":"NOT-IN-CANDIDATES"}')) },
    candidates(),
    "fever",
  );
  assertEqual(picked?.source, "fallback", "adaptive selection uses its scripted fallback");
  assertEqual(picked?.id, "GM-001", "first candidate is the deterministic fallback");
});

Deno.test("model selection: schema-invalid and non-object output fall back deterministically", async () => {
  for (const content of ['{"department_key":"emergency"}', '{"department_key":123}', "[]", "null"]) {
    const routing = await suggestDepartment(
      { apiKey: "k", fetchImpl: stubFetch(() => completion(content)) },
      "knee pain",
    );
    assertEqual(routing, null, `routing rejects ${content}`);
  }
});

Deno.test("model selection: timeouts and provider errors fall back deterministically", async () => {
  const aborted = new Error("aborted");
  aborted.name = "AbortError";

  const timeoutRouting = await suggestDepartment(
    { apiKey: "k", timeoutMs: 10, fetchImpl: stubFetch(() => { throw aborted; }) },
    "knee pain",
  );
  assertEqual(timeoutRouting, null, "timeout yields null");

  const errorRouting = await suggestDepartment(
    { apiKey: "k", fetchImpl: stubFetch(() => new Response("{}", { status: 500 })) },
    "knee pain",
  );
  assertEqual(errorRouting, null, "500 yields null");

  const limitedRouting = await suggestDepartment(
    { apiKey: "k", fetchImpl: stubFetch(() => new Response("{}", { status: 429 })) },
    "knee pain",
  );
  assertEqual(limitedRouting, null, "429 yields null");
});

Deno.test("model selection: no key means no request on either path", async () => {
  const captured: Captured[] = [];
  const routing = await suggestDepartment(
    { apiKey: "", fetchImpl: stubFetch(() => completion("{}"), captured) },
    "knee pain",
  );
  const picked = await selectAdaptiveQuestion(
    { apiKey: "", fetchImpl: stubFetch(() => completion("{}"), captured) },
    candidates(),
    "fever",
  );
  assertEqual(routing, null, "no department suggestion without a key");
  assertEqual(picked?.source, "fallback", "scripted fallback without a key");
  assertEqual(captured.length, 0, "no request attempted");
});

/**
 * Loopback transport check. It proves the adapter serialises the Qwen model over real
 * HTTP and parses the answer, without any provider or Docker dependency. Skipped when the
 * suite runs without `--allow-net`; run it explicitly with
 * `deno test --allow-read --allow-env --allow-net supabase/functions/_shared/groq-model-selection.test.ts`.
 */
const netAllowed = (await Deno.permissions.query({ name: "net" })).state === "granted";

Deno.test({
  name: "model selection: a loopback HTTP round trip carries the Qwen model",
  ignore: !netAllowed,
  fn: async () => {
    const seen: { model?: unknown; topLevel?: string[] } = {};
    const server = Deno.serve({ port: 0, hostname: "127.0.0.1" }, async (request) => {
      const body = (await request.json()) as Record<string, unknown>;
      seen.model = body.model;
      seen.topLevel = Object.keys(body).sort();
      return new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: '{"department_key":"dermatology"}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    try {
      const { port } = server.addr as Deno.NetAddr;
      const department = await suggestDepartment(
        { apiKey: "stub-key", baseUrl: `http://127.0.0.1:${port}` },
        "itchy rash on the arm",
      );
      assertEqual(department, "dermatology", "loopback answer parsed");
      assertEqual(seen.model, EXPECTED_MODEL, "model over the wire");
      assertEqual(seen.topLevel?.join(","), "messages,model,response_format", "request keys");
    } finally {
      await server.shutdown();
    }
  },
});

Deno.test("model selection: runtime sources contain no GPT-OSS model id", () => {
  for (const file of [
    "supabase/functions/_shared/groq.ts",
    "supabase/functions/_shared/groq-routing.ts",
    "supabase/functions/_shared/intake/select.ts",
    "supabase/functions/chat-turn/index.ts",
    "supabase/functions/speak/index.ts",
  ]) {
    const source = Deno.readTextFileSync(new URL(`../../../${file}`, import.meta.url)).toLowerCase();
    assert(!source.includes("gpt-oss"), `${file} must not reference gpt-oss`);
    assert(!source.includes("gpt_oss"), `${file} must not reference gpt_oss`);
    // The OpenAI-compatible base path `/openai/v1` is a transport detail, not a model. It
    // must stay: it is Groq's documented endpoint, not an OpenAI model selection.
  }
});
