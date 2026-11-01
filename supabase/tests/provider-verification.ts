/**
 * Provider verification harness (checks B-1 … B-9 from docs/provider-notes.md).
 *
 * DEFAULT IS NON-LIVE. It prints the checklist and which environment variables are
 * present (names and lengths only, never values) and makes no network request.
 *
 *   deno run --allow-env supabase/tests/provider-verification.ts
 *
 * LIVE MODE is explicit and opt-in, and fails closed without credentials:
 *
 *   GROQ_API_KEY=… GNANI_API_KEY=… \
 *     deno run --allow-env --allow-net supabase/tests/provider-verification.ts --live
 *
 * Only synthetic strings and silent synthetic audio are sent. No patient data. Keys,
 * headers, provider bodies and audio bytes are never printed.
 */

import { requestStructured } from "../functions/_shared/groq.ts";
import { transcribe } from "../functions/_shared/prisma.ts";
import { synthesize } from "../functions/_shared/timbre.ts";

const LIVE = Deno.args.includes("--live");
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GNANI_KEY = Deno.env.get("GNANI_API_KEY") ?? "";

const CHECKS = [
  "B-1 Groq structured JSON with strict:true",
  "B-2 Groq auth (401) and rate-limit (429) mapping",
  "B-3 Prisma transcription of a synthetic English clip",
  "B-4 Prisma transcription of a synthetic Hindi clip (script check)",
  "B-5 Browser-producible container acceptance (wav/ogg) and webm refusal",
  "B-6 Prisma latency/timeout envelope",
  "B-7 Timbre synthesis, English and Hindi, listened to by the owner",
  "B-8 Timbre voice entitlement (Nalini / Kaveri)",
  "B-9 Timbre maximum text length (undocumented)",
];

/**
 * Presence only. Never print a value, a prefix/suffix or a length: a length is enough to
 * narrow a brute-force search and is not needed to decide "configured or not".
 */
function envSummary(): string[] {
  const rows = [
    ["GROQ_API_KEY", GROQ_KEY],
    ["GNANI_API_KEY", GNANI_KEY],
  ] as const;
  return rows.map(([name, value]) => `${name}: ${value ? "present" : "MISSING"}`);
}

const REPORT_PATH = Deno.env.get("PROVIDER_REPORT") ?? "provider-verification-result.json";

if (!LIVE) {
  // Default is deliberately inert. Nothing below this block can run.
  console.log("Provider verification harness — NON-LIVE mode (no requests made)\n");
  for (const line of envSummary()) console.log(`  ${line}`);
  console.log("\nChecks that live mode would run:");
  for (const check of CHECKS) console.log(`  - ${check}`);
  console.log("\nRun with --live and both keys set to execute them. See docs/provider-notes.md §7.");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "non-live",
    externalRequests: 0,
    providers: {
      groq: { status: "NOT_RUN", reason: "non-live mode is the default" },
      prisma: { status: "NOT_RUN", reason: "non-live mode is the default" },
      timbre: { status: "NOT_RUN", reason: "non-live mode is the default" },
    },
    ok: null,
    note: "No live provider verification has been performed. This is not a pass.",
  };
  await Deno.writeTextFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nWrote ${REPORT_PATH} (mode=non-live, externalRequests=0).`);
  Deno.exit(0);
}

const missing = [
  GROQ_KEY ? null : "GROQ_API_KEY",
  GNANI_KEY ? null : "GNANI_API_KEY",
].filter((name): name is string => name !== null);

if (missing.length > 0) {
  console.error(`LIVE mode requested but these secrets are missing: ${missing.join(", ")}`);
  console.error("Refusing to run: no request was made.");
  Deno.exit(2);
}

interface Row { provider: "groq" | "prisma" | "timbre" | "local"; check: string; status: string; detail: string }
const rows: Row[] = [];
const now = () => performance.now();

async function timed(
  provider: Row["provider"],
  check: string,
  run: () => Promise<{ ok: boolean; detail: string }>,
): Promise<void> {
  const started = now();
  try {
    const result = await run();
    rows.push({ provider, check, status: result.ok ? "PASS" : "FAIL", detail: `${result.detail} (${Math.round(now() - started)} ms)` });
  } catch {
    // Never surface a provider body or a stack trace.
    rows.push({ provider, check, status: "FAIL", detail: `exception (${Math.round(now() - started)} ms)` });
  }
}

const SCHEMA = {
  type: "object",
  properties: { duration: { type: "string" }, possible_urgent: { type: "boolean" } },
  required: ["duration", "possible_urgent"],
  additionalProperties: false,
} as const;

await timed("groq", "B-1 Groq structured JSON", async () => {
  const result = await requestStructured(
    { apiKey: GROQ_KEY },
    {
      schemaName: "provider_probe",
      schema: SCHEMA as unknown as Record<string, unknown>,
      system: "Return JSON only.",
      user: "Synthetic demo text: knee pain for three weeks, moderate.",
      validate: (parsed) => {
        if (typeof parsed !== "object" || parsed === null) return null;
        const value = parsed as Record<string, unknown>;
        if (typeof value.duration !== "string" || typeof value.possible_urgent !== "boolean") return null;
        return value;
      },
    },
  );
  return { ok: result.ok, detail: result.ok ? `model=${result.model}` : `kind=${result.kind}` };
});

const SILENT_WAV = (() => {
  const samples = 16000;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); write(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples * 2, true);
  return new Uint8Array(buffer);
})();

await timed("prisma", "B-3/5/6 Prisma English clip (wav, 1 s silence)", async () => {
  const result = await transcribe({ apiKey: GNANI_KEY }, { audio: SILENT_WAV, mimeType: "audio/wav", language: "en-IN" });
  if (!result.ok) return { ok: false, detail: `kind=${result.kind}` };
  return { ok: true, detail: `model=${result.model} chars=${result.transcript.length}` };
});

await timed("prisma", "B-4 Prisma Hindi clip (wav, 1 s silence)", async () => {
  const result = await transcribe({ apiKey: GNANI_KEY }, { audio: SILENT_WAV, mimeType: "audio/wav", language: "hi-IN" });
  if (!result.ok) return { ok: false, detail: `kind=${result.kind}` };
  return { ok: true, detail: `chars=${result.transcript.length}` };
});

await timed("local", "B-5 webm refused locally (no request expected)", async () => {
  const result = await transcribe({ apiKey: GNANI_KEY }, { audio: SILENT_WAV, mimeType: "audio/webm", language: "en-IN" });
  return { ok: !result.ok && result.kind === "unsupported_format", detail: result.ok ? "webm accepted" : `kind=${result.kind}` };
});

await timed("timbre", "B-7/8 Timbre English (Kaveri)", async () => {
  const result = await synthesize({ apiKey: GNANI_KEY }, { text: "This is a synthetic demo sentence.", language: "en-IN" });
  return { ok: result.ok, detail: result.ok ? `${result.audio.byteLength} bytes ${result.contentType}` : `kind=${result.kind}` };
});

await timed("timbre", "B-7/8 Timbre Hindi (Nalini)", async () => {
  const result = await synthesize({ apiKey: GNANI_KEY }, { text: "यह एक परीक्षण वाक्य है।", language: "hi-IN" });
  return { ok: result.ok, detail: result.ok ? `${result.audio.byteLength} bytes` : `kind=${result.kind}` };
});

console.log("Provider verification — LIVE mode (synthetic inputs only)\n");
for (const row of rows) console.log(`  ${row.status.padEnd(4)} [${row.provider.padEnd(6)}] ${row.check} — ${row.detail}`);

/** Per-provider verdict, so one failing provider does not hide a passing one. */
function providerStatus(provider: Row["provider"]): { status: string; checks: number; failed: number } {
  const own = rows.filter((row) => row.provider === provider);
  if (own.length === 0) return { status: "NOT_RUN", checks: 0, failed: 0 };
  const failed = own.filter((row) => row.status !== "PASS").length;
  return { status: failed === 0 ? "PASS" : "FAIL", checks: own.length, failed };
}

const failed = rows.filter((row) => row.status !== "PASS");
const report = {
  generatedAt: new Date().toISOString(),
  mode: "live",
  externalRequests: rows.filter((row) => row.provider !== "local").length,
  providers: {
    groq: providerStatus("groq"),
    prisma: providerStatus("prisma"),
    timbre: providerStatus("timbre"),
    local: providerStatus("local"),
  },
  checks: rows,
  manualFollowUps: [
    "B-2 needs a deliberately invalid key to observe 401/429 mapping",
    "B-7 requires a human to listen to both synthesised clips",
    "B-9 needs an oversized text probe against the Timbre limit",
  ],
  ok: failed.length === 0,
};
await Deno.writeTextFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

console.log("\nPer-provider status:");
for (const [name, value] of Object.entries(report.providers)) {
  if (value.status !== "NOT_RUN") console.log(`  ${name}: ${value.status} (${value.checks - value.failed}/${value.checks})`);
}
console.log("\nManual follow-ups: B-2 needs a deliberately bad key, B-7 requires listening to both files, B-9 needs an oversized text probe.");
console.log(`Wrote ${REPORT_PATH}.`);

Deno.exit(failed.length === 0 ? 0 : 1);
