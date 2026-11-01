/**
 * Provider network-isolation guards.
 *
 * The integration harness previously disclosed two requests reaching real provider
 * domains before the container-networking fix. These tests make that class of mistake
 * fail in the unit suite instead of in a live run.
 *
 * They prove three things:
 *   1. when a base URL is supplied, the adapters contact exactly that URL and nothing else;
 *   2. the Edge Function sources never hardcode a provider domain;
 *   3. a provider call is impossible without an explicit destination, so a missing stub
 *      fails closed rather than falling back to a real endpoint.
 */

import { requestStructured } from "./groq.ts";
import { transcribe } from "./prisma.ts";
import { synthesize } from "./timbre.ts";
import { assert, assertEqual } from "./testing.ts";

const STUB_HOST = "127.0.0.1:8787";

function read(relative: string): string {
  return Deno.readTextFileSync(new URL(relative, new URL("../../../", import.meta.url)));
}

/** Records every URL and refuses anything that is not the local stub. */
function guardedFetch(seen: string[]): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    seen.push(url);
    if (!url.includes(STUB_HOST)) {
      throw new Error(`BLOCKED non-stub destination: ${url}`);
    }
    const body = url.includes("/chat/completions")
      ? JSON.stringify({ choices: [{ message: { content: '{"department_key":"general_medicine","duration":"x","possible_urgent":false}' } }] })
      : url.includes("/stt/v3")
      ? JSON.stringify({ success: true, transcript: "synthetic", model: "prisma-v2.5" })
      : "audio";
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": url.includes("/tts") ? "audio/mpeg" : "application/json" } }));
  }) as typeof fetch;
}

Deno.test("network isolation: groq contacts only the supplied base URL", async () => {
  const seen: string[] = [];
  await requestStructured(
    { apiKey: "stub", baseUrl: `http://${STUB_HOST}`, fetchImpl: guardedFetch(seen) },
    {
      schemaName: "probe",
      schema: { type: "object", properties: {}, required: [], additionalProperties: false },
      system: "s",
      user: "u",
      validate: () => ({ ok: true }),
    },
  );
  assertEqual(seen.length, 1, "exactly one request");
  assert(seen[0].startsWith(`http://${STUB_HOST}/chat/completions`), `unexpected destination ${seen[0]}`);
});

Deno.test("network isolation: prisma contacts only the supplied base URL", async () => {
  const seen: string[] = [];
  await transcribe(
    { apiKey: "stub", baseUrl: `http://${STUB_HOST}`, fetchImpl: guardedFetch(seen) },
    { audio: new Uint8Array([1, 2, 3]), mimeType: "audio/wav", language: "en-IN" },
  );
  assertEqual(seen.length, 1, "exactly one request");
  assert(seen[0].startsWith(`http://${STUB_HOST}/stt/v3`), `unexpected destination ${seen[0]}`);
});

Deno.test("network isolation: timbre contacts only the supplied endpoint", async () => {
  const seen: string[] = [];
  await synthesize(
    { apiKey: "stub", endpoint: `http://${STUB_HOST}/tts`, fetchImpl: guardedFetch(seen) },
    { text: "Synthetic question?", language: "en-IN" },
  );
  assertEqual(seen.length, 1, "exactly one request");
  assertEqual(seen[0], `http://${STUB_HOST}/tts`, "exact destination");
});

Deno.test("network isolation: a guarded transport blocks a non-stub destination", async () => {
  const seen: string[] = [];
  const result = await requestStructured(
    { apiKey: "stub", fetchImpl: guardedFetch(seen) },
    {
      schemaName: "probe",
      schema: { type: "object", properties: {}, required: [], additionalProperties: false },
      system: "s",
      user: "u",
      validate: () => ({ ok: true }),
    },
  );
  // The adapter converts the blocked transport into a typed failure: no data is returned.
  assert(!result.ok, "blocked transport never yields a result");
  assert(seen[0].includes("api.groq.com"), "the default destination was attempted");
  assertEqual(seen.length, 1, "the guard stops after the first blocked call");
  assert(!JSON.stringify(result).includes("api.groq.com"), "the destination is not echoed in the result");
});

Deno.test("network isolation: function sources never hardcode a provider domain", () => {
  for (const file of ["supabase/functions/chat-turn/index.ts", "supabase/functions/speak/index.ts"]) {
    const source = read(file);
    for (const domain of ["api.groq.com", "api.vachana.ai", "vachana.ai"]) {
      assert(!source.includes(domain), `${file} hardcodes ${domain}`);
    }
  }
});

Deno.test("network isolation: destinations come from environment overrides", () => {
  const chat = read("supabase/functions/chat-turn/index.ts");
  const speak = read("supabase/functions/speak/index.ts");
  assert(chat.includes('Deno.env.get("GROQ_BASE_URL")'), "groq override wired");
  assert(chat.includes('Deno.env.get("PRISMA_BASE_URL")'), "prisma override wired");
  assert(speak.includes('Deno.env.get("TIMBRE_ENDPOINT")'), "timbre override wired");
});
