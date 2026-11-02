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
 * Speech round-trip mode (opt-in; exactly four requests maximum):
 *   GNANI_API_KEY=… \
 *     deno run --allow-env --allow-net --allow-write scripts/provider-smoke.ts --live --roundtrip
 *
 * Options:
 *   --provider all|groq|prisma|timbre   select checks (comma-separated allowed)
 *   --roundtrip                         Timbre TTS -> Prisma STT for English and Hindi
 *                                       (combine with --live to execute; never with --provider)
 *   --out-dir <path>                    where synthetic TTS clips are written
 *                                       (default .provider-audio, git-ignored)
 *
 * Safety:
 *   - keys are read from the environment only; any key-shaped command-line argument is
 *     refused before a request;
 *   - only synthetic text and a silent synthetic WAV are sent;
 *   - no transcript, audio body, header, key or provider body is printed;
 *   - TTS clips are written locally outside Git for the owner to listen to;
 *   - live calls may consume paid credits and are never automatic;
 *   - no retries: a failed provider call stops the round trip and the rest is NOT TESTED.
 */

import { requestStructured } from "../supabase/functions/_shared/groq.ts";
import {
  isAcceptedAudioType,
  transcribe,
} from "../supabase/functions/_shared/prisma.ts";
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
  roundTrip: boolean;
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

/** Repository-relative directory that `.gitignore` already excludes. */
export const DEFAULT_AUDIO_DIR = ".provider-audio";

/**
 * Explicit client-side timeout for each round-trip request. The adapters default to
 * 15 s (Timbre) and 20 s (Prisma); the round trip uses one documented value so a hung
 * request fails safely instead of waiting indefinitely.
 */
export const ROUNDTRIP_TIMEOUT_MS = 30_000;

/** A complete two-language run is two TTS + two STT requests. Never more. */
export const MAX_ROUNDTRIP_REQUESTS = 4;

export type RoundTripLanguage = "en-IN" | "hi-IN";

/**
 * Fixed synthetic, non-medical sentences. They are public constants, not patient data,
 * and are the expected side of the transcript comparison.
 */
export const ROUNDTRIP_SENTENCES: Readonly<Record<RoundTripLanguage, string>> = {
  "en-IN": "This is a simple speech test.",
  "hi-IN": "आज मौसम बहुत अच्छा है।",
};

export const ROUNDTRIP_LANGUAGES: readonly RoundTripLanguage[] = ["en-IN", "hi-IN"];

function fail(message: string): never {
  throw new SmokeUsageError(message);
}

/** Parse only known flags. Any credential-like flag is rejected before execution. */
export function parseSmokeArgs(args: readonly string[]): SmokeOptions {
  let live = false;
  let roundTrip = false;
  let outDir = DEFAULT_AUDIO_DIR;
  let reportPath: string | null = null;
  let providerFlag = false;
  const providers = new Set<Provider>(ALL_PROVIDERS);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (/^--(api[-_]?key|key|token|secret|password)(=|$)/i.test(arg)) {
      fail("Refused: do not pass API keys on the command line. Use environment variables.");
    }
    if (arg === "--live") {
      live = true;
    } else if (arg === "--roundtrip" || arg === "--round-trip") {
      roundTrip = true;
    } else if (arg === "--provider" || arg === "--providers") {
      providerFlag = true;
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
          "[--live] [--roundtrip] [--provider all|groq|prisma|timbre] " +
          "[--out-dir <path>] [--report <path>]",
      );
      Deno.exit(0);
    } else {
      fail(`Unknown argument "${arg}". Use --help.`);
    }
  }

  if (roundTrip && providerFlag) {
    fail("--roundtrip runs Prisma and Timbre only; do not combine it with --provider.");
  }
  if (providers.size === 0) fail("Select at least one provider: all, groq, prisma or timbre.");
  return {
    live,
    roundTrip,
    providers: ALL_PROVIDERS.filter((provider) => providers.has(provider)),
    outDir,
    reportPath,
  };
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

/* -------------------------------------------------------------------------- */
/* Speech round-trip: transcript comparison                                    */
/* -------------------------------------------------------------------------- */

/**
 * Normalises a transcript for a tolerant *technical* comparison only.
 *
 * - Unicode NFC so composed and decomposed forms compare equally;
 * - zero-width characters removed (they carry no speech);
 * - case-insensitive;
 * - punctuation and symbols become spaces, then whitespace collapses.
 *
 * Letters, combining marks and digits are preserved, including Devanagari. Nothing is
 * translated, transliterated, spell-corrected or rewritten. The original strings are
 * never mutated; this function returns a new comparison form.
 */
export function normalizeTranscript(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTranscript(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/** Longest common subsequence length; sentences are short, so plain DP is fine. */
function lcsLength(left: string[], right: string[]): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  let previous = new Uint16Array(columns);
  let current = new Uint16Array(columns);
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      current[column] = left[row - 1] === right[column - 1]
        ? previous[column - 1] + 1
        : Math.max(previous[column], current[column - 1]);
    }
    const swap = previous;
    previous = current;
    current = swap;
    current.fill(0);
  }
  return previous[columns - 1];
}

export interface TranscriptComparison {
  /** MATCH only when the normalised strings are exactly equal. */
  verdict: "MATCH" | "MISMATCH" | "EMPTY";
  expectedTokens: number;
  actualTokens: number;
  matchingTokens: number;
  differenceTokens: number;
  similarity: number;
}

/**
 * Compares the documented sentence with the provider transcript.
 *
 * A MATCH requires exact equality after normalisation. A single additional, missing or
 * substituted word is a MISMATCH: the harness never rounds a material difference up to a
 * pass. Counts only are reported, never transcript text.
 */
export function compareTranscripts(expected: string, actual: string): TranscriptComparison {
  const expectedNormalized = normalizeTranscript(expected);
  if (expectedNormalized.length === 0) {
    throw new SmokeUsageError("The expected round-trip sentence must not be empty.");
  }
  const actualNormalized = normalizeTranscript(actual);
  if (actualNormalized.length === 0) {
    return {
      verdict: "EMPTY",
      expectedTokens: tokenizeTranscript(expectedNormalized).length,
      actualTokens: 0,
      matchingTokens: 0,
      differenceTokens: tokenizeTranscript(expectedNormalized).length,
      similarity: 0,
    };
  }
  if (expectedNormalized === actualNormalized) {
    const tokens = tokenizeTranscript(expectedNormalized).length;
    return {
      verdict: "MATCH",
      expectedTokens: tokens,
      actualTokens: tokens,
      matchingTokens: tokens,
      differenceTokens: 0,
      similarity: 1,
    };
  }

  const expectedTokens = tokenizeTranscript(expectedNormalized);
  const actualTokens = tokenizeTranscript(actualNormalized);
  const matching = lcsLength(expectedTokens, actualTokens);
  const longest = Math.max(expectedTokens.length, actualTokens.length);
  return {
    verdict: "MISMATCH",
    expectedTokens: expectedTokens.length,
    actualTokens: actualTokens.length,
    matchingTokens: matching,
    differenceTokens: longest - matching,
    similarity: longest === 0 ? 0 : Number((matching / longest).toFixed(3)),
  };
}

/**
 * Restricts round-trip audio to the repository's git-ignored directory. The existing
 * smoke checks keep their historical `--out-dir` freedom; round-trip mode does not,
 * because generated audio must never be committable by accident.
 */
export function assertSafeAudioDir(outDir: string): void {
  const normalized = outDir.replaceAll("\\", "/").replace(/\/+$/, "");
  const isDefault = normalized === DEFAULT_AUDIO_DIR;
  const isNested = normalized.startsWith(`${DEFAULT_AUDIO_DIR}/`);
  if (!isDefault && !isNested) {
    fail(
      `Round-trip audio must be written under the git-ignored ${DEFAULT_AUDIO_DIR}/ directory ` +
        `(got "${outDir}").`,
    );
  }
}

/** Maps the TTS content type to a Prisma-accepted type; never guesses for non-MP3 audio. */
export function audioMimeTypeFor(contentType: string, audio: Uint8Array): string | null {
  const base = contentType.split(";")[0].trim().toLowerCase();
  if (isAcceptedAudioType(base)) return base;
  // Timbre normally returns audio/mpeg. A missing or generic header is acceptable only
  // when the bytes are verifiably an MP3 container.
  if (looksLikeMp3(audio)) return "audio/mpeg";
  return null;
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

/* -------------------------------------------------------------------------- */
/* Speech round-trip: TTS -> STT                                               */
/* -------------------------------------------------------------------------- */

export interface RoundTripLanguageReport {
  language: RoundTripLanguage;
  /** Public synthetic constant; never a provider transcript. */
  sentence: string;
  tts: { accepted: boolean; bytes: number | null; contentType: string | null };
  audioPath: string | null;
  stt: { accepted: boolean; model: string | null; characters: number | null };
  comparison: TranscriptComparison | null;
  checks: SmokeCheck[];
}

export interface RoundTripReport {
  status: CheckStatus;
  requestCount: number;
  maxRequests: number;
  checks: SmokeCheck[];
  languages: RoundTripLanguageReport[];
  audioPaths: string[];
}

export interface RoundTripOptions {
  apiKey: string;
  outDir: string;
  /** Defaults to both languages; tests can narrow it. */
  languages?: readonly RoundTripLanguage[];
  timeoutMs?: number;
  timbreEndpoint?: string;
  prismaBaseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injected by tests; the CLI uses the git-ignored file writer. */
  writeAudioImpl?: (language: RoundTripLanguage, audio: Uint8Array) => Promise<string>;
}

/**
 * One TTS request and one STT request per language, in that order. A failed request is
 * not retried; the run stops and every later step is reported NOT TESTED. A transcript
 * mismatch does not stop the run (the second language is still exercised), but it is a
 * FAIL, never a PASS.
 */
export async function runRoundTrip(options: RoundTripOptions): Promise<RoundTripReport> {
  const languages = options.languages ?? ROUNDTRIP_LANGUAGES;
  const timeoutMs = options.timeoutMs ?? ROUNDTRIP_TIMEOUT_MS;
  const checks: SmokeCheck[] = [];
  const languageReports: RoundTripLanguageReport[] = [];
  const audioPaths: string[] = [];
  let requestCount = 0;
  let stopped = false;

  if (!options.apiKey) {
    for (const language of languages) {
      const check: SmokeCheck = {
        provider: "prisma",
        check: `round-trip (${language})`,
        status: "NOT TESTED",
        detail: "GNANI_API_KEY missing; no request made",
      };
      checks.push(check);
      languageReports.push({
        language,
        sentence: ROUNDTRIP_SENTENCES[language],
        tts: { accepted: false, bytes: null, contentType: null },
        audioPath: null,
        stt: { accepted: false, model: null, characters: null },
        comparison: null,
        checks: [check],
      });
    }
    return {
      status: "NOT TESTED",
      requestCount: 0,
      maxRequests: MAX_ROUNDTRIP_REQUESTS,
      checks,
      languages: languageReports,
      audioPaths,
    };
  }

  for (const language of languages) {
    const sentence = ROUNDTRIP_SENTENCES[language];
    const languageChecks: SmokeCheck[] = [];
    const report: RoundTripLanguageReport = {
      language,
      sentence,
      tts: { accepted: false, bytes: null, contentType: null },
      audioPath: null,
      stt: { accepted: false, model: null, characters: null },
      comparison: null,
      checks: languageChecks,
    };
    languageReports.push(report);

    if (stopped) {
      const check: SmokeCheck = {
        provider: "local",
        check: `round-trip (${language})`,
        status: "NOT TESTED",
        detail: "not attempted after an earlier provider failure",
      };
      languageChecks.push(check);
      checks.push(check);
      continue;
    }

    if (requestCount >= MAX_ROUNDTRIP_REQUESTS) {
      throw new SmokeUsageError(
        `Refused: the round trip may not exceed ${MAX_ROUNDTRIP_REQUESTS} provider requests.`,
      );
    }

    requestCount += 1;
    const tts = await synthesize(
      {
        apiKey: options.apiKey,
        timeoutMs,
        endpoint: options.timbreEndpoint,
        fetchImpl: options.fetchImpl,
      },
      { text: sentence, language },
    );

    if (!tts.ok) {
      const check: SmokeCheck = {
        provider: "timbre",
        check: `TTS request (${language})`,
        status: "FAIL",
        detail: `kind=${tts.kind}${tts.status ? ` status=${tts.status}` : ""}; no retry`,
      };
      languageChecks.push(check);
      checks.push(check);
      stopped = true;
      continue;
    }

    report.tts = { accepted: true, bytes: tts.audio.byteLength, contentType: tts.contentType };
    const ttsCheck: SmokeCheck = {
      provider: "timbre",
      check: `TTS request (${language})`,
      status: "PASS",
      detail: `${tts.audio.byteLength} bytes, content-type=${tts.contentType}`,
    };
    languageChecks.push(ttsCheck);
    checks.push(ttsCheck);

    const mimeType = audioMimeTypeFor(tts.contentType, tts.audio);
    if (!mimeType) {
      const check: SmokeCheck = {
        provider: "timbre",
        check: `TTS audio container (${language})`,
        status: "FAIL",
        detail: `unsupported content-type "${tts.contentType}"; no STT request made`,
      };
      languageChecks.push(check);
      checks.push(check);
      stopped = true;
      continue;
    }

    let audioPath: string;
    try {
      audioPath = options.writeAudioImpl
        ? await options.writeAudioImpl(language, tts.audio)
        : await writeRoundTripAudio(options.outDir, language, tts.audio);
    } catch {
      const check: SmokeCheck = {
        provider: "local",
        check: `audio saved (${language})`,
        status: "FAIL",
        detail: "could not write the clip inside the git-ignored directory",
      };
      languageChecks.push(check);
      checks.push(check);
      stopped = true;
      continue;
    }
    report.audioPath = audioPath;
    audioPaths.push(audioPath);
    const savedCheck: SmokeCheck = {
      provider: "local",
      check: `audio saved (${language})`,
      status: "PASS",
      detail: audioPath,
    };
    languageChecks.push(savedCheck);
    checks.push(savedCheck);

    requestCount += 1;
    const stt = await transcribe(
      {
        apiKey: options.apiKey,
        timeoutMs,
        baseUrl: options.prismaBaseUrl,
        fetchImpl: options.fetchImpl,
      },
      { audio: tts.audio, mimeType, language },
    );

    if (!stt.ok) {
      const check: SmokeCheck = {
        provider: "prisma",
        check: `STT request (${language})`,
        status: "FAIL",
        detail: `kind=${stt.kind}${stt.status ? ` status=${stt.status}` : ""}; no retry`,
      };
      languageChecks.push(check);
      checks.push(check);
      stopped = true;
      continue;
    }

    report.stt = { accepted: true, model: stt.model, characters: stt.transcript.length };
    const sttCheck: SmokeCheck = {
      provider: "prisma",
      check: `STT request (${language})`,
      status: "PASS",
      detail: `model=${stt.model} chars=${stt.transcript.length}`,
    };
    languageChecks.push(sttCheck);
    checks.push(sttCheck);

    const comparison = compareTranscripts(sentence, stt.transcript);
    report.comparison = comparison;
    const matchCheck: SmokeCheck = {
      provider: "prisma",
      check: `transcript comparison (${language})`,
      status: comparison.verdict === "MATCH" ? "PASS" : "FAIL",
      detail:
        `verdict=${comparison.verdict} tokens=${comparison.expectedTokens}/${comparison.actualTokens} ` +
        `matching=${comparison.matchingTokens} differences=${comparison.differenceTokens} ` +
        `similarity=${comparison.similarity}`,
    };
    languageChecks.push(matchCheck);
    checks.push(matchCheck);
    // A mismatch is reported, not retried, and does not hide the second language.
  }

  if (requestCount > MAX_ROUNDTRIP_REQUESTS) {
    throw new SmokeUsageError(
      `Refused: ${requestCount} provider requests exceeds the ${MAX_ROUNDTRIP_REQUESTS} limit.`,
    );
  }

  const status: CheckStatus = checks.some((check) => check.status === "FAIL")
    ? "FAIL"
    : checks.every((check) => check.status === "PASS")
    ? "PASS"
    : "NOT TESTED";

  return {
    status,
    requestCount,
    maxRequests: MAX_ROUNDTRIP_REQUESTS,
    checks,
    languages: languageReports,
    audioPaths,
  };
}

export type RoundTripGateResult =
  | {
    dryRun: true;
    requests: number;
    languages: readonly RoundTripLanguage[];
    sentences: Readonly<Record<RoundTripLanguage, string>>;
    outDir: string;
  }
  | { dryRun: false; report: RoundTripReport };

/**
 * The only route from CLI options to a live round trip. Without an explicit `--live`,
 * `runLive` is never invoked; callers get a plan for the dry run instead.
 */
export async function runRoundTripIfLive(
  options: Pick<SmokeOptions, "live" | "outDir">,
  runLive: () => Promise<RoundTripReport>,
): Promise<RoundTripGateResult> {
  if (!options.live) {
    return {
      dryRun: true,
      requests: ROUNDTRIP_LANGUAGES.length * 2,
      languages: ROUNDTRIP_LANGUAGES,
      sentences: ROUNDTRIP_SENTENCES,
      outDir: options.outDir,
    };
  }
  if (options.outDir !== DEFAULT_AUDIO_DIR && !options.outDir.startsWith(`${DEFAULT_AUDIO_DIR}/`)) {
    // Defence in depth: the CLI validates earlier, but a programmatic caller cannot
    // bypass the git-ignore requirement.
    assertSafeAudioDir(options.outDir);
  }
  return { dryRun: false, report: await runLive() };
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

/** Round-trip clips use a distinct name so they are never confused with smoke clips. */
async function writeRoundTripAudio(
  outDir: string,
  language: RoundTripLanguage,
  audio: Uint8Array,
): Promise<string> {
  await Deno.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${outDir}/roundtrip-${language === "hi-IN" ? "hi" : "en"}-${stamp}.mp3`;
  await Deno.writeFile(path, audio);
  return path;
}

function printRoundTripPlan(options: SmokeOptions): void {
  console.log("\nSpeech round-trip plan (no request made, no file written):");
  console.log(`  requests: ${ROUNDTRIP_LANGUAGES.length * 2} (2 Timbre TTS + 2 Prisma STT) — hard maximum`);
  console.log(`  timeout per request: ${ROUNDTRIP_TIMEOUT_MS} ms; no retries`);
  console.log(`  audio target: ${options.outDir}/roundtrip-<language>-<timestamp>.mp3 (git-ignored)`);
  for (const language of ROUNDTRIP_LANGUAGES) {
    console.log(`  ${language}: "${ROUNDTRIP_SENTENCES[language]}"`);
  }
}

function printRoundTripChecklist(report: RoundTripReport): void {
  console.log("\nManual listening checklist (not automated; never commit these files):");
  for (const entry of report.languages) {
    const path = entry.audioPath ?? "(no audio saved)";
    const voice = entry.language === "hi-IN" ? "Nalini (hi-IN)" : "Kaveri (en-IN)";
    console.log(`  [ ] ${entry.language} — ${path}`);
    console.log(`      expected sentence: ${entry.sentence}`);
    console.log(
      `      confirm: language/voice is ${voice}; audio is audible and not clipped; ` +
        `transcript comparison is ${entry.comparison?.verdict ?? "NOT TESTED"}`,
    );
  }
  console.log(`  [ ] Keep or delete the clips privately; ${DEFAULT_AUDIO_DIR}/ is git-ignored.`);
  console.log("  [ ] A transcript mismatch is reported above as FAIL; do not record it as a pass.");
}

async function run(): Promise<void> {
  const options = parseSmokeArgs(Deno.args);

  if (!options.live) {
    console.log("Provider smoke harness — NON-LIVE mode (no requests, no files)\n");
    for (const name of ["GROQ_API_KEY", "GNANI_API_KEY", "GROQ_BASE_URL", "PRISMA_BASE_URL", "TIMBRE_ENDPOINT"]) {
      console.log(`  ${name}: ${present(name)}`);
    }

    if (options.roundTrip) {
      printRoundTripPlan(options);
      console.log("\nNo request was made and no audio file was written.");
      console.log("Run with --live --roundtrip to execute. Live calls may consume API credits.");
      Deno.exit(0);
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

  const gnaniKey = Deno.env.get("GNANI_API_KEY") ?? "";

  // Stub overrides would silently turn a "live" run into a local stub call. Refuse before
  // any request, in both smoke and round-trip modes.
  if (Deno.env.get("GROQ_BASE_URL") || Deno.env.get("PRISMA_BASE_URL") || Deno.env.get("TIMBRE_ENDPOINT")) {
    fail("Refusing live mode with stub endpoint overrides set. Unset GROQ_BASE_URL, PRISMA_BASE_URL and TIMBRE_ENDPOINT.");
  }

  if (options.roundTrip) {
    assertSafeAudioDir(options.outDir);
    if (!gnaniKey) fail("GNANI_API_KEY is missing; refusing to make a request.");

    console.warn("WARNING: LIVE speech round-trip. 4 provider requests maximum (2 TTS + 2 STT).");
    console.warn("Synthetic sentences only. No transcript, audio body, key or provider body will be printed.");
    console.warn("Provider calls may consume paid API credits. No retry is attempted.\n");

    const gate = await runRoundTripIfLive(options, () =>
      runRoundTrip({ apiKey: gnaniKey, outDir: options.outDir })
    );
    if (gate.dryRun) {
      // Unreachable: the non-live branch above already returned. Kept for type safety.
      fail("Internal error: a dry-run plan reached the live branch.");
    }

    const report = gate.report;
    console.log("Speech round-trip — LIVE results (synthetic inputs only)\n");
    printChecks(report.checks);
    const summary = summarize(report.checks);
    console.log(`\nSummary: ${summary.pass} PASS, ${summary.fail} FAIL, ${summary.notTested} NOT TESTED`);
    console.log(`Provider requests used: ${report.requestCount} of ${report.maxRequests} maximum`);
    printRoundTripChecklist(report);

    if (options.reportPath) {
      const evidence = {
        generatedAt: new Date().toISOString(),
        mode: "live-roundtrip",
        syntheticInputsOnly: true,
        requestCount: report.requestCount,
        maxRequests: report.maxRequests,
        timeoutMs: ROUNDTRIP_TIMEOUT_MS,
        checks: report.checks,
        languages: report.languages.map((entry) => ({
          language: entry.language,
          sentence: entry.sentence,
          tts: entry.tts,
          audioPath: entry.audioPath,
          stt: entry.stt,
          comparison: entry.comparison,
        })),
        audioPaths: report.audioPaths,
        summary,
        status: report.status,
      };
      await Deno.writeTextFile(options.reportPath, JSON.stringify(evidence, null, 2) + "\n");
      console.log(`Wrote ${options.reportPath} (no transcripts)`);
    }

    Deno.exit(report.status === "PASS" ? 0 : 1);
  }

  console.warn("WARNING: LIVE provider mode. Synthetic inputs only, but calls may consume paid API credits.");
  console.warn("No patient data, transcript, audio body, key or provider response body will be printed.\n");

  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";

  if (options.providers.includes("groq") && !groqKey) fail("GROQ_API_KEY is missing; refusing to make a request.");
  if ((options.providers.includes("prisma") || options.providers.includes("timbre")) && !gnaniKey) {
    fail("GNANI_API_KEY is missing; refusing to make a request.");
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
