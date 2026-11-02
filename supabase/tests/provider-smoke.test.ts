/**
 * Offline tests for the opt-in provider smoke harness. No provider request is made; every
 * adapter receives an injected fetch stub. These cover the failure classifications so a
 * live run's PASS cannot hide an authentication or contract error.
 */

import {
  checkGroq,
  checkPrisma,
  checkTimbre,
  looksLikeMp3,
  parseSmokeArgs,
  SmokeUsageError,
  syntheticWav,
} from "../../scripts/provider-smoke.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

function stubFetch(handler: () => Response | Promise<Response>): typeof fetch {
  return (() => Promise.resolve(handler())) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function completion(content: string): Response {
  return jsonResponse({ choices: [{ message: { role: "assistant", content } }] });
}

function statuses(checks: Array<{ status: string }>): string[] {
  return checks.map((check) => check.status);
}

Deno.test("smoke args: default is non-live and selects every provider", () => {
  const options = parseSmokeArgs([]);
  assertEqual(options.live, false, "non-live default");
  assertEqual(options.providers.join(","), "groq,prisma,timbre", "all providers");
  assertEqual(options.outDir, ".provider-audio", "audio directory");
  assertEqual(options.reportPath, null, "no report by default");
});

Deno.test("smoke args: live/provider/out-dir/report are explicit", () => {
  const options = parseSmokeArgs([
    "--live",
    "--provider",
    "groq,timbre",
    "--out-dir",
    "/tmp/samvad-audio",
    "--report",
    "/tmp/samvad-report.json",
  ]);
  assertEqual(options.live, true, "live");
  assertEqual(options.providers.join(","), "groq,timbre", "selected providers");
  assertEqual(options.outDir, "/tmp/samvad-audio", "out dir");
  assertEqual(options.reportPath, "/tmp/samvad-report.json", "report path");
});

Deno.test("smoke args: credential-like command-line arguments are refused", () => {
  for (const arg of ["--api-key=abc", "--key", "--token=abc", "--secret", "--password=abc"]) {
    let refused = false;
    try {
      parseSmokeArgs([arg]);
    } catch (error) {
      refused = error instanceof SmokeUsageError;
    }
    assert(refused, `${arg} must be refused`);
  }
});

Deno.test("smoke args: unknown arguments are refused", () => {
  let refused = false;
  try {
    parseSmokeArgs(["--not-a-flag"]);
  } catch (error) {
    refused = error instanceof SmokeUsageError;
  }
  assert(refused, "unknown flag refused");
});

Deno.test("synthetic WAV is a valid 16 kHz mono PCM container", () => {
  const wav = syntheticWav(1);
  assertEqual(wav.byteLength, 44 + 32_000, "byte length");
  assertEqual(String.fromCharCode(...wav.slice(0, 4)), "RIFF", "RIFF");
  assertEqual(String.fromCharCode(...wav.slice(8, 12)), "WAVE", "WAVE");
  assertEqual(String.fromCharCode(...wav.slice(36, 40)), "data", "data chunk");
});

Deno.test("MP3 validation accepts ID3 and frame sync, rejects JSON/empty", () => {
  assert(looksLikeMp3(new Uint8Array([0x49, 0x44, 0x33, 0x04])), "ID3");
  assert(looksLikeMp3(new Uint8Array([0xff, 0xfb, 0x90, 0x64])), "frame sync");
  assert(!looksLikeMp3(new Uint8Array([0x7b, 0x7d])), "JSON rejected");
  assert(!looksLikeMp3(new Uint8Array()), "empty rejected");
});

Deno.test("groq smoke: valid constrained JSON passes auth and parsing", async () => {
  const result = await checkGroq("smoke-secret-value", {
    fetchImpl: stubFetch(() => completion('{"marker":"synthetic-ok","urgent":false}')),
  });
  assertEqual(statuses(result.checks).join(","), "PASS,PASS", "both checks");
});

Deno.test("groq smoke: 401 fails auth and does not claim parsing", async () => {
  const result = await checkGroq("smoke-secret-value", {
    fetchImpl: stubFetch(() => new Response("{}", { status: 401 })),
  });
  assertEqual(statuses(result.checks).join(","), "FAIL,NOT TESTED", "auth vs parsing");
});

Deno.test("groq smoke: invalid output keeps auth PASS and fails parsing", async () => {
  const result = await checkGroq("smoke-secret-value", {
    fetchImpl: stubFetch(() => completion("not json")),
  });
  assertEqual(statuses(result.checks).join(","), "PASS,FAIL", "auth accepted, parsing failed");
});

Deno.test("groq smoke: timeout is a connectivity failure", async () => {
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  const result = await checkGroq("smoke-secret-value", {
    fetchImpl: (() => Promise.reject(aborted)) as unknown as typeof fetch,
  });
  assertEqual(statuses(result.checks).join(","), "FAIL,NOT TESTED", "timeout");
  assert(result.checks[0].detail.includes("timeout"), "timeout reason");
});

Deno.test("prisma smoke: empty transcript is a successful authentication and call", async () => {
  const result = await checkPrisma("smoke-secret-value", {
    fetchImpl: stubFetch(() => jsonResponse({ success: true, transcript: "", model: "prisma-v2.5" })),
  });
  assertEqual(statuses(result.checks).join(","), "PASS,PASS", "empty transcript allowed");
});

Deno.test("prisma smoke: 401 fails auth and does not claim STT", async () => {
  const result = await checkPrisma("smoke-secret-value", {
    fetchImpl: stubFetch(() => new Response("{}", { status: 401 })),
  });
  assertEqual(statuses(result.checks).join(","), "FAIL,NOT TESTED", "auth vs STT");
});

Deno.test("prisma smoke: malformed response keeps auth PASS and fails STT", async () => {
  const result = await checkPrisma("smoke-secret-value", {
    fetchImpl: stubFetch(() => jsonResponse({ success: true })),
  });
  assertEqual(statuses(result.checks).join(","), "PASS,FAIL", "contract failure");
});

Deno.test("timbre smoke: valid MP3 passes auth and audio validation", async () => {
  const audio = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
  const result = await checkTimbre("smoke-secret-value", "en-IN", "Synthetic sentence.", {
    fetchImpl: stubFetch(() => new Response(audio, { headers: { "content-type": "audio/mpeg" } })),
  });
  assertEqual(statuses(result.checks).join(","), "PASS,PASS", "both checks");
  assertEqual(result.audio?.byteLength, audio.byteLength, "audio returned");
});

Deno.test("timbre smoke: 401 fails auth and does not claim audio", async () => {
  const result = await checkTimbre("smoke-secret-value", "hi-IN", "कृत्रिम वाक्य।", {
    fetchImpl: stubFetch(() => new Response("{}", { status: 401 })),
  });
  assertEqual(statuses(result.checks).join(","), "FAIL,NOT TESTED", "auth vs audio");
});

Deno.test("timbre smoke: empty 200 body keeps auth PASS and fails audio", async () => {
  const result = await checkTimbre("smoke-secret-value", "en-IN", "Synthetic sentence.", {
    fetchImpl: stubFetch(() => new Response(new Uint8Array(), { status: 200 })),
  });
  assertEqual(statuses(result.checks).join(","), "PASS,FAIL", "empty audio");
});

Deno.test("smoke output never contains the supplied key", async () => {
  const key = "smoke-secret-value-do-not-print";
  const groq = await checkGroq(key, { fetchImpl: stubFetch(() => new Response("{}", { status: 401 })) });
  const prisma = await checkPrisma(key, { fetchImpl: stubFetch(() => new Response("{}", { status: 401 })) });
  const timbre = await checkTimbre(key, "en-IN", "Synthetic sentence.", {
    fetchImpl: stubFetch(() => new Response("{}", { status: 401 })),
  });
  const serialized = JSON.stringify([...groq.checks, ...prisma.checks, ...timbre.checks]);
  assert(!serialized.includes(key), "key must never appear in diagnostics");
});
