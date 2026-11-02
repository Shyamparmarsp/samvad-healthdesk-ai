/**
 * Opt-in provider smoke harness.
 *
 * DEFAULT IS NON-LIVE: it reads only environment-variable *presence* and prints the checks
 * that would run. It makes no network request and writes no file.
 *
 * Explicit live opt-in:
 *   GROQ_API_KEY=… GNANI_API_KEY=… \
 *     deno run --allow-env --allow-net --allow-write scripts/provider-smoke.ts --live
 *
 * Options:
 *   --provider all|groq|prisma|timbre   select checks (comma-separated allowed)
 *   --out-dir <path>                    where synthetic TTS clips are written
 *                                       (default .provider-audio, git-ignored)
 *
 * Safety:
 *   - keys are read from the environment only; any key-shaped command-line argument is
 *     refused before a request;
 *   - only synthetic text and a silent synthetic WAV are sent;
 *   - no transcript, audio body, header, key or provider body is printed;
 *   - TTS clips are written locally outside Git for the owner to listen to;
 *   - live calls may consume paid credits and are never automatic.
 */

import { requestStructured } from "../supabase/functions/_shared/groq.ts";
import { transcribe } from "../supabase/functions/_shared/prisma.ts";
import { synthesize } from "../supabase/functions/_shared/timbre.ts";

export type Provider = "groq" | "prisma" | "timbre";
export type CheckStatus = "PASS" | "FAIL" | "NOT TESTED";

export interface SmokeCheck {
  provider: Provider | "local";
  check: string;
  status: CheckStatus;
  detail: string;
}

export interface SmokeOptions {
  live: boolean;
  providers: Provider[];
  outDir: string;
  reportPath: string | null;
}

export class SmokeUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmokeUsageError";
  }
}

const ALL_PROVIDERS: Provider[] = ["groq", "prisma", "timbre"];

function fail(message: string): never {
  throw new SmokeUsageError(message);
}

/** Parse only known flags. Any credential-like flag is rejected before execution. */
export function parseSmokeArgs(args: readonly string[]): SmokeOptions {
  let live = false;
  let outDir = ".provider-audio";
  let reportPath: string | null = null;
  const providers = new Set<Provider>(ALL_PROVIDERS);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (/^--(api[-_]?key|key|token|secret|password)(=|$)/i.test(arg)) {
      fail("Refused: do not pass API keys on the command line. Use environment variables.");
    }
    if (arg === "--live") {
      live = true;
    } else if (arg === "--provider" || arg === "--providers") {
      const value = args[index + 1];
      if (!value) fail(`${arg} requires a value`);
      providers.clear();
      for (const token of value.split(",").map((entry) => entry.trim().toLowerCase())) {
        if (token === "all") {
          for (const provider of ALL_PROVIDERS) providers.add(provider);
        } else if (token === "groq" || token === "prisma" || token === "timbre") {
          providers.add(token);
        } else {
          fail(`Unknown provider "${token}". Use all, groq, prisma or timbre.`);
        }
      }
      index += 1;
    } else if (arg === "--out-dir") {
      const value = args[index + 1];
      if (!value) fail("--out-dir requires a path");
      outDir = value;
      index += 1;
    } else if (arg === "--report") {
      const value = args[index + 1];
      if (!value) fail("--report requires a path");
      reportPath = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: deno run --allow-env --allow-net --allow-write scripts/provider-smoke.ts " +
          "[--live] [--provider all|groq|prisma|timbre] [--out-dir <path>] [--report <path>]",
      );
      Deno.exit(0);
    } else {
      fail(`Unknown argument "${arg}". Use --help.`);
    }
  }

  if (providers.size === 0) fail("Select at least one provider: all, groq, prisma or timbre.");
  return { live, providers: ALL_PROVIDERS.filter((provider) => providers.has(provider)), outDir, reportPath };
}

/** 1 s of 16 kHz 16-bit mono silence; synthetic only. */
export function syntheticWav(seconds = 1, sampleRate = 16_000): Uint8Array {
  const samples = Math.max(1, Math.floor(seconds * sampleRate));
  const dataBytes = samples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(buffer);
}

/** MP3 containers begin with ID3 or an MPEG frame sync (0xFFEx). */
export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return id3 || frameSync;
}

export interface GroqCheckResult {
  checks: SmokeCheck[];
}

/** Constrained synthetic Groq probe: exact enum values, no patient text. */
export async function checkGroq(
  apiKey: string,
  options: { timeoutMs?: number; baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<GroqCheckResult> {
  const schema = {
    type: "object",
    properties: {
      marker: { type: "string", enum: ["synthetic-ok"] },
      urgent: { type: "boolean", enum: [false] },
    },
    required: ["marker", "urgent"],
    additionalProperties: false,
  } as const;

  const result = await requestStructured(
    {
      apiKey,
      timeoutMs: options.timeoutMs,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
    },
    {
      schemaName: "provider_smoke",
      schema: schema as unknown as Record<string, unknown>,
      system: "Return JSON only. Use exactly the supplied schema.",
      user: 'Synthetic provider smoke input. Return {"marker":"synthetic-ok","urgent":false}.',
      validate: (parsed) => {
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
        const value = parsed as Record<string, unknown>;
        if (Object.keys(value).length !== 2) return null;
        if (value.marker !== "synthetic-ok" || value.urgent !== false) return null;
        return { marker: value.marker, urgent: value.urgent };
      },
    },
  );

  if (result.ok) {
    return {
      checks: [
        { provider: "groq", check: "credentials/connectivity", status: "PASS", detail: `model=${result.model}` },
        { provider: "groq", check: "constrained response parsing", status: "PASS", detail: "exact enum payload accepted" },
      ],
    };
  }

  if (result.kind === "auth") {
    return {
      checks: [
        { provider: "groq", check: "credentials/connectivity", status: "FAIL", detail: `auth rejected (status=${result.status ?? "unknown"})` },
        { provider: "groq", check: "constrained response parsing", status: "NOT TESTED", detail: "request not authenticated" },
      ],
    };
  }

  if (result.kind === "config") {
    return {
      checks: [
        { provider: "groq", check: "credentials/connectivity", status: "NOT TESTED", detail: "apiKey missing; no request made" },
        { provider: "groq", check: "constrained response parsing", status: "NOT TESTED", detail: "apiKey missing; no request made" },
      ],
    };
  }

  if (result.kind === "invalid_output") {
    return {
      checks: [
        { provider: "groq", check: "credentials/connectivity", status: "PASS", detail: "request accepted" },
        { provider: "groq", check: "constrained response parsing", status: "FAIL", detail: "schema-invalid or extra-field output rejected" },
      ],
    };
  }

  const connectivity = result.kind === "timeout" || result.kind === "network";
  return {
    checks: [
      {
        provider: "groq",
        check: "credentials/connectivity",
        status: "FAIL",
        detail: connectivity ? `connectivity failed: ${result.kind}` : `provider failure: ${result.kind}`,
      },
      { provider: "groq", check: "constrained response parsing", status: "NOT TESTED", detail: "request did not complete" },
    ],
  };
}

export interface PrismaCheckResult {
  checks: SmokeCheck[];
}

/** One silent synthetic WAV; transcription content is never printed. */
export async function checkPrisma(
  apiKey: string,
  options: { timeoutMs?: number; baseUrl?: string; fetchImpl?: typeof fetch; language?: "en-IN" | "hi-IN" } = {},
): Promise<PrismaCheckResult> {
  const result = await transcribe(
    {
      apiKey,
      timeoutMs: options.timeoutMs,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
    },
    {
      audio: syntheticWav(1),
      mimeType: "audio/wav",
      language: options.language ?? "en-IN",
    },
  );

  if (result.ok) {
    return {
      checks: [
        { provider: "prisma", check: "credentials/connectivity", status: "PASS", detail: "request accepted" },
        {
          provider: "prisma",
          check: `speech-to-text endpoint (${options.language ?? "en-IN"})`,
          status: "PASS",
          detail: `model=${result.model} chars=${result.transcript.length} (empty transcript is valid; recognition quality needs a spoken synthetic clip)`,
        },
      ],
    };
  }

  if (result.kind === "auth") {
    return {
      checks: [
        { provider: "prisma", check: "credentials/connectivity", status: "FAIL", detail: `auth rejected (status=${result.status ?? "unknown"})` },
        { provider: "prisma", check: "speech-to-text endpoint", status: "NOT TESTED", detail: "request not authenticated" },
      ],
    };
  }

  if (result.kind === "config") {
    return {
      checks: [
        { provider: "prisma", check: "credentials/connectivity", status: "NOT TESTED", detail: "apiKey missing; no request made" },
        { provider: "prisma", check: "speech-to-text endpoint", status: "NOT TESTED", detail: "apiKey missing; no request made" },
      ],
    };
  }

  if (result.kind === "timeout" || result.kind === "network") {
    return {
      checks: [
        { provider: "prisma", check: "credentials/connectivity", status: "FAIL", detail: `connectivity failed: ${result.kind}` },
        { provider: "prisma", check: "speech-to-text endpoint", status: "NOT TESTED", detail: "request did not complete" },
      ],
    };
  }

  return {
    checks: [
      { provider: "prisma", check: "credentials/connectivity", status: "PASS", detail: "request reached the provider" },
      { provider: "prisma", check: "speech-to-text endpoint", status: "FAIL", detail: `kind=${result.kind}${result.status ? ` status=${result.status}` : ""}` },
    ],
  };
}

export interface TimbreCheckResult {
  checks: SmokeCheck[];
  audio?: Uint8Array;
  contentType?: string;
}

/** One synthetic sentence per language; audio is returned for local saving. */
export async function checkTimbre(
  apiKey: string,
  language: "en-IN" | "hi-IN",
  text: string,
  options: { timeoutMs?: number; endpoint?: string; fetchImpl?: typeof fetch } = {},
): Promise<TimbreCheckResult> {
  const result = await synthesize(
    {
      apiKey,
      timeoutMs: options.timeoutMs,
      endpoint: options.endpoint,
      fetchImpl: options.fetchImpl,
    },
    { text, language },
  );

  if (result.ok) {
    const valid = looksLikeMp3(result.audio);
    return {
      audio: result.audio,
      contentType: result.contentType,
      checks: [
        { provider: "timbre", check: `credentials/connectivity (${language})`, status: "PASS", detail: "request accepted" },
        {
          provider: "timbre",
          check: `audio response (${language})`,
          status: valid ? "PASS" : "FAIL",
          detail: `${result.audio.byteLength} bytes, content-type=${result.contentType}${valid ? "" : ", not an MP3 signature"}`,
        },
      ],
    };
  }

  if (result.kind === "auth") {
    return {
      checks: [
        { provider: "timbre", check: `credentials/connectivity (${language})`, status: "FAIL", detail: `auth rejected (status=${result.status ?? "unknown"})` },
        { provider: "timbre", check: `audio response (${language})`, status: "NOT TESTED", detail: "request not authenticated" },
      ],
    };
  }

  if (result.kind === "config") {
    return {
      checks: [
        { provider: "timbre", check: `credentials/connectivity (${language})`, status: "NOT TESTED", detail: "apiKey missing; no request made" },
        { provider: "timbre", check: `audio response (${language})`, status: "NOT TESTED", detail: "apiKey missing; no request made" },
      ],
    };
  }

  if (result.kind === "timeout" || result.kind === "network") {
    return {
      checks: [
        { provider: "timbre", check: `credentials/connectivity (${language})`, status: "FAIL", detail: `connectivity failed: ${result.kind}` },
        { provider: "timbre", check: `audio response (${language})`, status: "NOT TESTED", detail: "request did not complete" },
      ],
    };
  }

  return {
    checks: [
      { provider: "timbre", check: `credentials/connectivity (${language})`, status: "PASS", detail: "request reached the provider" },
      { provider: "timbre", check: `audio response (${language})`, status: "FAIL", detail: `kind=${result.kind}${result.status ? ` status=${result.status}` : ""}` },
    ],
  };
}

function present(name: string): string {
  return Deno.env.get(name) ? "present" : "MISSING";
}

function printChecks(checks: SmokeCheck[]): void {
  for (const check of checks) {
    console.log(`  ${check.status.padEnd(10)} [${check.provider.padEnd(6)}] ${check.check} — ${check.detail}`);
  }
}

function summarize(checks: SmokeCheck[]): { pass: number; fail: number; notTested: number } {
  return {
    pass: checks.filter((check) => check.status === "PASS").length,
    fail: checks.filter((check) => check.status === "FAIL").length,
    notTested: checks.filter((check) => check.status === "NOT TESTED").length,
  };
}

async function writeAudio(outDir: string, language: "en-IN" | "hi-IN", audio: Uint8Array): Promise<string> {
  await Deno.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${outDir}/timbre-${language === "hi-IN" ? "hi" : "en"}-${stamp}.mp3`;
  await Deno.writeFile(path, audio);
  return path;
}

async function run(): Promise<void> {
  const options = parseSmokeArgs(Deno.args);

  if (!options.live) {
    console.log("Provider smoke harness — NON-LIVE mode (no requests, no files)\n");
    for (const name of ["GROQ_API_KEY", "GNANI_API_KEY", "GROQ_BASE_URL", "PRISMA_BASE_URL", "TIMBRE_ENDPOINT"]) {
      console.log(`  ${name}: ${present(name)}`);
    }
    console.log("\nSelected checks that live mode would run:");
    for (const provider of options.providers) {
      if (provider === "groq") console.log("  - Groq authentication, connectivity and constrained JSON parsing");
      if (provider === "prisma") console.log("  - Prisma authentication and English speech-to-text (synthetic WAV)");
      if (provider === "timbre") console.log("  - Timbre authentication and English/Hindi TTS (synthetic sentences)");
    }
    console.log("\nNo request was made and no audio file was written.");
    console.log("Run with --live to execute. Live calls may consume API credits.");
    Deno.exit(0);
  }

  console.warn("WARNING: LIVE provider mode. Synthetic inputs only, but calls may consume paid API credits.");
  console.warn("No patient data, transcript, audio body, key or provider response body will be printed.\n");

  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
  const gnaniKey = Deno.env.get("GNANI_API_KEY") ?? "";

  if (options.providers.includes("groq") && !groqKey) fail("GROQ_API_KEY is missing; refusing to make a request.");
  if ((options.providers.includes("prisma") || options.providers.includes("timbre")) && !gnaniKey) {
    fail("GNANI_API_KEY is missing; refusing to make a request.");
  }

  if (Deno.env.get("GROQ_BASE_URL") || Deno.env.get("PRISMA_BASE_URL") || Deno.env.get("TIMBRE_ENDPOINT")) {
    fail("Refusing live mode with stub endpoint overrides set. Unset GROQ_BASE_URL, PRISMA_BASE_URL and TIMBRE_ENDPOINT.");
  }

  const checks: SmokeCheck[] = [];

  if (options.providers.includes("groq")) {
    const result = await checkGroq(groqKey);
    checks.push(...result.checks);
  }

  if (options.providers.includes("prisma")) {
    const result = await checkPrisma(gnaniKey);
    checks.push(...result.checks);
  }

  if (options.providers.includes("timbre")) {
    const english = await checkTimbre(gnaniKey, "en-IN", "This is a synthetic provider smoke test.");
    checks.push(...english.checks);
    if (english.audio) {
      const path = await writeAudio(options.outDir, "en-IN", english.audio);
      checks.push({ provider: "timbre", check: "English clip saved", status: "PASS", detail: path });
    }

    const hindi = await checkTimbre(gnaniKey, "hi-IN", "यह एक कृत्रिम परीक्षण वाक्य है।");
    checks.push(...hindi.checks);
    if (hindi.audio) {
      const path = await writeAudio(options.outDir, "hi-IN", hindi.audio);
      checks.push({ provider: "timbre", check: "Hindi clip saved", status: "PASS", detail: path });
    }
  }

  console.log("Provider smoke harness — LIVE results (synthetic inputs only)\n");
  printChecks(checks);
  const summary = summarize(checks);
  console.log(`\nSummary: ${summary.pass} PASS, ${summary.fail} FAIL, ${summary.notTested} NOT TESTED`);
  console.log(`TTS clips (listen manually, never commit): ${options.outDir}/`);

  if (options.reportPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: "live",
      syntheticInputsOnly: true,
      providers: options.providers,
      checks,
      summary,
    };
    await Deno.writeTextFile(options.reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Wrote ${options.reportPath}`);
  }

  Deno.exit(summary.fail === 0 ? 0 : 1);
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof SmokeUsageError) {
      console.error(error.message);
      Deno.exit(2);
    }
    throw error;
  }
}

if (import.meta.main) {
  await main();
}
