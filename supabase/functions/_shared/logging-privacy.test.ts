/**
 * Diagnostic-log privacy tests.
 *
 * AGENTS.md: patient statements, transcripts, audio, keys and provider bodies must never
 * reach logs. These tests exercise the sanitizer and scan the actual call sites, so a new
 * log field cannot quietly add health content.
 */

import { consoleLogger, sanitizeFields } from "./logging.ts";
import { assert, assertEqual } from "./testing.ts";

const SOURCES = [
  "./logging.ts",
  "../chat-turn/index.ts",
  "../speak/index.ts",
] as const;

Deno.test("logging: forbidden keys are removed", () => {
  const marker = "SYNTHETIC_PATIENT_STATEMENT_MARKER";
  const safe = sanitizeFields({
    provider: "timbre",
    ok: true,
    text: marker,
    final_text: marker,
    original_text: marker,
    transcript: marker,
    patient_statement: marker,
    clarification_answer: marker,
    audio: marker,
    patient_name: marker,
    api_key: marker,
    authorization: marker,
  });
  assertEqual(JSON.stringify(safe), JSON.stringify({ provider: "timbre", ok: true }), "only safe metadata");
  assert(!JSON.stringify(safe).includes(marker), "statement never survives");
});

Deno.test("logging: scalar metadata survives; long strings truncate; objects drop", () => {
  const safe = sanitizeFields({
    provider: "prisma",
    ok: false,
    status: 503,
    duration_ms: 12,
    reason: null,
    long: "x".repeat(200),
    nested: { text: "nope" } as unknown as string,
  });
  assertEqual(safe.provider, "prisma", "provider");
  assertEqual(safe.ok, false, "boolean");
  assertEqual(safe.status, 503, "number");
  assertEqual(safe.duration_ms, 12, "duration");
  assertEqual(safe.reason, null, "null");
  assertEqual((safe.long as string).length, 64, "strings truncate to 64");
  assert(!("nested" in safe), "non-scalar dropped");
});

Deno.test("logging: a synthetic statement never reaches the emitted line", () => {
  const marker = "SYNTHETIC_PATIENT_STATEMENT_MARKER";
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    consoleLogger.info("provider_attempt", {
      provider: "timbre",
      ok: true,
      patient_statement: marker,
      final_text: marker,
      transcript: marker,
    });
    consoleLogger.error("action_rejected", {
      action: "submit_turn",
      code: "invalid_state",
      patient_statement: marker,
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  const emitted = lines.join("\n");
  assert(!emitted.includes(marker), "statement must not be logged");
  assert(emitted.includes("provider_attempt"), "event name still logged");
  assert(emitted.includes("action_rejected"), "error event still logged");
});

Deno.test("logging: no call site passes a patient-content identifier", async () => {
  const forbidden = [
    "final_text",
    "original_text",
    "patient_statement",
    "clarification_answer",
    "transcript",
    "audio_base64",
    "apiKey",
  ];
  for (const relative of SOURCES) {
    const source = await Deno.readTextFile(new URL(relative, import.meta.url));
    const calls = source.match(/consoleLogger\.(?:info|error)\([\s\S]*?\);/g) ?? [];
    for (const call of calls) {
      for (const identifier of forbidden) {
        assert(
          !call.includes(identifier),
          `${relative} log call references ${identifier}`,
        );
      }
    }
  }
});
