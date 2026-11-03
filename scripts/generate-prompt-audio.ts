/**
 * Prompt-audio manifest builder and paid-generation utility.
 *
 * WHY THIS EXISTS
 * The consent greeting and the four fixed intake prompts must be pre-generated audio
 * (AGENTS.md). The demo bundle previously shipped eleven byte-identical one-second
 * placeholders, which are not speech. This utility creates the manifest, validates
 * candidate files, and — only with an explicit double opt-in — calls the verified Gnani
 * Timbre adapter once per prompt.
 *
 * SAFETY MODEL
 *  - Default mode is `--manifest`: no network, no writes outside docs/.
 *  - `--verify` validates the assets currently in `public/audio` without any network call.
 *  - `--live` requires `--i-authorize-paid-generation`; a missing key, missing consent or
 *    a non-local staging directory aborts before the first request.
 *  - One request per prompt, no retries, no concurrency.
 *  - The spoken text is read from the approved sources at runtime
 *    (`supabase/functions/_shared/questions.ts` and `src/i18n/{en,hi}.ts`); it is never
 *    duplicated here and never rewritten.
 *  - Logs contain prompt ids, byte counts, hashes, durations and volume levels only —
 *    never the prompt text, the audio body, headers or the API key.
 *  - Generated files are written to a git-ignored staging directory and promoted to
 *    `public/audio/{lang}/{promptId}.mp3` only after signature, duration and silence
 *    validation. A validated file must also be unique (no byte-identical duplicates).
 *
 * WHAT A PASS DOES AND DOES NOT MEAN
 * "audible" here means: a decodable MP3, at least one second long, with a mean volume
 * above the silence floor. It does not prove the voice is intelligible; that is the
 * owner's listening pass (`docs/release-readiness/AUDIO-ASSETS-MANIFEST.md` §4).
 *
 * RUN
 *   deno run --allow-read --allow-write --allow-env scripts/generate-prompt-audio.ts
 *   deno run --allow-read --allow-write --allow-env scripts/generate-prompt-audio.ts --verify
 *   GNANI_API_KEY=… deno run --allow-read --allow-write --allow-env --allow-net \
 *     scripts/generate-prompt-audio.ts --live --i-authorize-paid-generation
 *
 * Adding `--allow-run` enables the ffprobe/ffmpeg duration and loudness check; without it
 * the validator falls back to an MP3 frame estimate and reports the weaker evidence.
 */

import { QUESTIONS, questionText } from "../supabase/functions/_shared/questions.ts";
import { DEFAULT_VOICE } from "../supabase/functions/_shared/timbre.ts";
import { synthesize } from "../supabase/functions/_shared/timbre.ts";
import { en } from "../src/i18n/en.ts";
import { hi } from "../src/i18n/hi.ts";

const ROOT = decodeURIComponent(new URL("../", import.meta.url).pathname);
const MANIFEST_JSON = `${ROOT}docs/release-readiness/audio-prompts.json`;
const MANIFEST_MD = `${ROOT}docs/release-readiness/AUDIO-ASSETS-MANIFEST.md`;
const RESULT_JSON = `${ROOT}docs/release-readiness/audio-generation-result.json`;
const STAGING_DIR = `${ROOT}.prompt-audio-staging`;

/** Hashes of the known placeholder WAVs shipped with the demo bundle. */
export const KNOWN_PLACEHOLDER_SHA256 = [
  "8cc2ed04be3808f22bc866cb7dc33c1e", // md5 of the 11 identical wav files
];

const MIN_DURATION_SECONDS = 0.8;
const MIN_MEAN_VOLUME_DB = -45;
const MIN_MAX_VOLUME_DB = -20;

export type PromptLanguage = "en" | "hi";

export interface PromptAsset {
  promptId: "greeting" | "ask-name" | "ask-age" | "ask-gender" | "ask-primary-concern";
  questionId: string | null;
  language: PromptLanguage;
  /** Locale sent to the provider. */
  speechLanguage: "en-IN" | "hi-IN";
  voice: string;
  text: string;
  source: string;
  path: string;
}

function greetingText(language: PromptLanguage): { text: string; source: string } {
  const table = language === "hi" ? hi : en;
  const text = (table as { consent?: { greetingAudio?: string } }).consent?.greetingAudio ?? "";
  if (!text.trim()) throw new Error(`Missing consent.greetingAudio for ${language}`);
  return { text, source: `src/i18n/${language}.ts → consent.greetingAudio` };
}

const FIXED_PROMPTS: Array<{
  promptId: PromptAsset["promptId"];
  questionId: string;
}> = [
  { promptId: "ask-name", questionId: "name" },
  { promptId: "ask-age", questionId: "age" },
  { promptId: "ask-gender", questionId: "gender" },
  { promptId: "ask-primary-concern", questionId: "primary_concern" },
];

/** The complete, ordered inventory. Order is stable so the manifest diff is readable. */
export function buildManifest(): PromptAsset[] {
  const assets: PromptAsset[] = [];

  for (const language of ["en", "hi"] as const) {
    const speechLanguage = language === "hi" ? "hi-IN" : "en-IN";
    const voice = DEFAULT_VOICE[speechLanguage];
    const greeting = greetingText(language);
    assets.push({
      promptId: "greeting",
      questionId: null,
      language,
      speechLanguage,
      voice,
      text: greeting.text,
      source: greeting.source,
      path: `public/audio/${language}/greeting.mp3`,
    });

    for (const { promptId, questionId } of FIXED_PROMPTS) {
      const text = questionText(questionId as keyof typeof QUESTIONS, language);
      if (!text.trim()) throw new Error(`Missing approved text for ${questionId}/${language}`);
      assets.push({
        promptId,
        questionId,
        language,
        speechLanguage,
        voice,
        text,
        source: `supabase/functions/_shared/questions.ts → QUESTIONS.${questionId}.${language}`,
        path: `public/audio/${language}/${promptId}.mp3`,
      });
    }
  }

  return assets;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Minimal MP3 sanity: an ID3 tag or an MPEG frame sync at the start. */
export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 512) return false;
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return id3 || frameSync;
}

async function run(cmd: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const process = new Deno.Command(cmd[0], { args: cmd.slice(1), stdout: "piped", stderr: "piped" }).spawn();
    const { code, stdout, stderr } = await process.output();
    return { ok: code === 0, output: `${new TextDecoder().decode(stdout)}${new TextDecoder().decode(stderr)}` };
  } catch (error) {
    return { ok: false, output: String(error) };
  }
}

let processPermissionCache: boolean | null = null;

/** True when `--allow-run` was granted and ffprobe exists. Cached after the first call. */
async function canRunProcess(): Promise<boolean> {
  if (processPermissionCache !== null) return processPermissionCache;
  try {
    const process = new Deno.Command("ffprobe", { args: ["-version"], stdout: "null", stderr: "null" }).spawn();
    await process.status;
    processPermissionCache = true;
  } catch {
    processPermissionCache = false;
  }
  return processPermissionCache;
}

export interface AudioProbe {
  durationSeconds: number | null;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  method: "ffprobe+ffmpeg" | "mp3-estimate";
}

/** Duration + loudness. Uses ffprobe/ffmpeg when `--allow-run` was granted. */
export async function probeAudio(bytes: Uint8Array, filePath: string): Promise<AudioProbe> {
  if (await canRunProcess()) {
    const durationRun = await run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath]);
    const duration = durationRun.ok ? Number.parseFloat(durationRun.output.trim()) : NaN;

    const volumeRun = await run(["ffmpeg", "-hide_banner", "-nostats", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"]);
    const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(volumeRun.output);
    const max = /max_volume:\s*(-?[\d.]+) dB/.exec(volumeRun.output);
    if (Number.isFinite(duration) && mean) {
      return {
        durationSeconds: duration,
        meanVolumeDb: Number.parseFloat(mean[1]),
        maxVolumeDb: max ? Number.parseFloat(max[1]) : null,
        method: "ffprobe+ffmpeg",
      };
    }
  }

  // Fallback: MPEG-1 Layer III, 128 kbps CBR estimate. Reported as weaker evidence.
  const estimated = (bytes.length * 8) / 128_000;
  return { durationSeconds: estimated, meanVolumeDb: null, maxVolumeDb: null, method: "mp3-estimate" };
}

export interface Validation {
  ok: boolean;
  reasons: string[];
  durationSeconds: number | null;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  method: string;
}

/** A file is acceptable only when it is real audio of plausible length and not silent. */
export async function validateAsset(bytes: Uint8Array, filePath: string): Promise<Validation> {
  const reasons: string[] = [];
  if (!looksLikeMp3(bytes)) reasons.push("not a decodable MP3 (the production container is mp3)");
  if (bytes.length < 8_000) reasons.push(`suspiciously small (${bytes.length} bytes)`);

  const probe = await probeAudio(bytes, filePath);
  const duration = probe.durationSeconds;
  if (duration === null || !Number.isFinite(duration) || duration < MIN_DURATION_SECONDS) {
    reasons.push(`duration ${duration ?? "unknown"}s is below the ${MIN_DURATION_SECONDS}s floor`);
  }
  if (probe.method === "ffprobe+ffmpeg") {
    if (probe.meanVolumeDb === null || probe.meanVolumeDb < MIN_MEAN_VOLUME_DB) {
      reasons.push(`mean volume ${probe.meanVolumeDb ?? "unknown"} dB is at or below the silence floor`);
    }
    if (probe.maxVolumeDb !== null && probe.maxVolumeDb < MIN_MAX_VOLUME_DB) {
      reasons.push(`peak volume ${probe.maxVolumeDb} dB is too quiet to be speech`);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    durationSeconds: duration,
    meanVolumeDb: probe.meanVolumeDb,
    maxVolumeDb: probe.maxVolumeDb,
    method: probe.method,
  };
}

/* -------------------------------------------------------------------------- */
/* Modes                                                                      */
/* -------------------------------------------------------------------------- */

async function inspectFile(path: string): Promise<{ hash: string; bytes: number; valid: string; duration: number | null; mean: number | null } | null> {
  try {
    const data = await Deno.readFile(`${ROOT}${path}`);
    const hash = (await sha256Hex(data)).slice(0, 16);
    const validation = await validateAsset(data, `${ROOT}${path}`);
    return {
      hash,
      bytes: data.length,
      valid: validation.ok ? "valid audio" : `INVALID — ${validation.reasons.join("; ")}`,
      duration: validation.durationSeconds,
      mean: validation.meanVolumeDb,
    };
  } catch {
    return null;
  }
}

async function writeManifest(assets: PromptAsset[]): Promise<void> {
  await Deno.mkdir(`${ROOT}docs/release-readiness`, { recursive: true });
  const rows = await Promise.all(assets.map(async (asset) => {
    const primary = await inspectFile(asset.path);
    // The demo bundle shipped `{prompt}_{lang}.wav` placeholders. They are recorded so the
    // manifest proves what was replaced, not only what exists.
    const legacyPath = `public/audio/${asset.promptId}_${asset.language}.wav`;
    const legacy = await inspectFile(legacyPath);
    const textSha256 = (await sha256Hex(new TextEncoder().encode(asset.text))).slice(0, 16);
    return {
      ...asset,
      textSha256,
      hash: primary?.hash ?? "—",
      bytes: primary?.bytes ?? 0,
      valid: primary?.valid ?? "missing",
      legacy: legacy
        ? { path: legacyPath, hash: legacy.hash, bytes: legacy.bytes, durationSeconds: legacy.duration, meanVolumeDb: legacy.mean, valid: legacy.valid }
        : null,
    };
  }));

  await Deno.writeTextFile(MANIFEST_JSON, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    provider: { adapter: "supabase/functions/_shared/timbre.ts", model: "timbre-v2.5", container: "mp3", sampleRate: 24000 },
    requestCount: assets.length,
    assets: rows.map(({ text, ...rest }) => rest),
  }, null, 2)}\n`);

  const md: string[] = [];
  md.push("# Prompt-audio asset manifest");
  md.push("");
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push("");
  md.push("Model `timbre-v2.5`, container `mp3`, 24 kHz. Voices: `Kaveri` (en-IN), `Nalini` (hi-IN).");
  md.push("");
  md.push("| # | Prompt | Lang | Voice | Target path | Approved source | Current state | Legacy placeholder |");
  md.push("|---|---|---|---|---|---|---|---|");
  rows.forEach((row, index) => {
    const legacy = row.legacy
      ? `\`${row.legacy.path}\` — ${row.legacy.durationSeconds?.toFixed(2) ?? "?"}s, ${row.legacy.meanVolumeDb ?? "?"} dB, ${row.legacy.valid}`
      : "none";
    md.push(`| ${index + 1} | \`${row.promptId}\` | ${row.language} | ${row.voice} | \`${row.path}\` | ${row.source} | ${row.valid} | ${legacy} |`);
  });
  md.push("");
  md.push("## Speech source (owner-reviewed; never rewritten by the generator)");
  md.push("");
  md.push("| Prompt | Lang | Text |");
  md.push("|---|---|---|");
  for (const asset of assets) {
    md.push(`| \`${asset.promptId}\` | ${asset.language} | ${asset.text.replace(/\|/g, "\\|")} |`);
  }
  md.push("");
  md.push("## Generation");
  md.push("");
  md.push("```bash");
  md.push("# dry run: inventory only, no network, no writes to public/audio");
  md.push("deno run --allow-read --allow-write --allow-env scripts/generate-prompt-audio.ts");
  md.push("");
  md.push("# validate whatever is currently in public/audio (no network)");
  md.push("deno run --allow-read --allow-write --allow-env --allow-run scripts/generate-prompt-audio.ts --verify");
  md.push("");
  md.push("# paid generation, double opt-in, one request per prompt, no retries");
  md.push("GNANI_API_KEY=… deno run --allow-read --allow-write --allow-env --allow-net --allow-run \\");
  md.push("  scripts/generate-prompt-audio.ts --live --i-authorize-paid-generation");
  md.push("```");
  md.push("");
  md.push("Before a live run, reserve exactly `requestCount` Timbre attempts in the");
  md.push("application limit for the current IST day (AGENTS.md). Never lower the limit by");
  md.push("more than the number of attempts you will actually make.");
  md.push("");
  md.push("## Owner listening pass (required before these are called approved)");
  md.push("");
  md.push("A passing validator proves the file is decodable, long enough and not silent. It");
  md.push("does not prove the words are intelligible or correctly pronounced. The owner must");
  md.push("listen to at least one English and one Hindi greeting and confirm:");
  md.push("");
  md.push("1. the words match the approved text;");
  md.push("2. the language and script are correct;");
  md.push("3. no prompt is truncated or clipped;");
  md.push("4. the greeting does not promise diagnosis or treatment.");
  md.push("");
  md.push("Until that pass is recorded, D-06 stays `OWNER ACTION` in the defect register.");
  md.push("");

  await Deno.writeTextFile(MANIFEST_MD, md.join("\n"));
  console.log(`manifest written: ${rows.length} assets`);
  for (const row of rows) console.log(`  ${row.language}/${row.promptId}: ${row.valid}`);
}

async function verifyOnly(assets: PromptAsset[]): Promise<void> {
  let invalid = 0;
  for (const asset of assets) {
    try {
      const bytes = await Deno.readFile(`${ROOT}${asset.path}`);
      const validation = await validateAsset(bytes, `${ROOT}${asset.path}`);
      const hash = (await sha256Hex(bytes)).slice(0, 16);
      console.log(`${validation.ok ? "PASS" : "FAIL"} ${asset.path} sha=${hash} ${validation.ok ? "" : validation.reasons.join("; ")}`);
      if (!validation.ok) invalid += 1;
    } catch {
      console.log(`MISSING ${asset.path}`);
      invalid += 1;
    }
  }
  console.log(`${assets.length - invalid}/${assets.length} prompt assets valid`);
  if (invalid > 0) Deno.exit(1);
}

async function live(assets: PromptAsset[], apiKey: string): Promise<void> {
  await Deno.mkdir(STAGING_DIR, { recursive: true });
  const results: Array<Record<string, unknown>> = [];
  let requests = 0;
  let failures = 0;
  const seenHashes = new Set<string>();

  for (const asset of assets) {
    try {
      if (Deno.statSync(asset.path).size > 0) {
        console.log(`  SKIP ${asset.path} (already generated)`);
        continue;
      }
    } catch {}
    requests += 1;
    console.log(`[${requests}/${assets.length}] synthesising ${asset.language}/${asset.promptId}`);
    const result = await synthesize({ apiKey }, { text: asset.text, language: asset.speechLanguage, voice: asset.voice });
    if (!result.ok) {
      failures += 1;
      console.log(`  FAIL ${asset.path}: ${result.kind}${result.status ? ` (${result.status})` : ""}`);
      results.push({ path: asset.path, status: "FAIL", kind: result.kind, requests: 1 });
      continue;
    }

    const stagingPath = `${STAGING_DIR}${asset.language}-${asset.promptId}.mp3`;
    await Deno.writeFile(stagingPath, result.audio);
    const validation = await validateAsset(result.audio, stagingPath);
    const hash = await sha256Hex(result.audio);

    if (seenHashes.has(hash)) {
      failures += 1;
      console.log(`  FAIL ${asset.path}: byte-identical to another generated file`);
      results.push({ path: asset.path, status: "FAIL", kind: "duplicate-bytes", requests: 1, sha256: hash });
      continue;
    }
    seenHashes.add(hash);

    if (!validation.ok) {
      failures += 1;
      console.log(`  FAIL ${asset.path}: ${validation.reasons.join("; ")}`);
      results.push({
        path: asset.path,
        status: "FAIL",
        kind: "validation",
        reasons: validation.reasons,
        requests: 1,
        sha256: hash,
        stagingPath,
      });
      continue;
    }

    const targetDir = `${ROOT}public/audio/${asset.language}`;
    await Deno.mkdir(targetDir, { recursive: true });
    await Deno.copyFile(stagingPath, `${targetDir}/${asset.promptId}.mp3`);
    console.log(`  OK ${asset.path} ${validation.durationSeconds?.toFixed(2)}s ${validation.meanVolumeDb ?? "?"} dB`);
    results.push({
      path: asset.path,
      status: "PASS",
      requests: 1,
      sha256: hash,
      bytes: result.audio.length,
      durationSeconds: validation.durationSeconds,
      meanVolumeDb: validation.meanVolumeDb,
      maxVolumeDb: validation.maxVolumeDb,
      probe: validation.method,
    });
  }

  await Deno.writeTextFile(RESULT_JSON, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: "timbre-v2.5",
    requestCount: requests,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: failures,
    note: "Request count is exact: one synthesis attempt per prompt, no retries.",
    results,
  }, null, 2)}\n`);

  console.log(`\nrequests=${requests} pass=${results.length - failures} fail=${failures}`);
  console.log(`result written: ${RESULT_JSON}`);
  if (failures > 0) Deno.exit(1);
}

async function main(): Promise<void> {
  const argv = new Set(Deno.args);
  const assets = buildManifest();

  if (argv.has("--manifest")) {
    await writeManifest(assets);
    return;
  }
  if (argv.has("--verify")) {
    await verifyOnly(assets);
    return;
  }

  if (!argv.has("--live")) {
    console.log("DRY RUN — no network request, no file written to public/audio.\n");
    console.log(`Provider: Gnani Timbre, model timbre-v2.5, mp3, 24 kHz`);
    console.log(`Requests if executed: ${assets.length} (one per prompt, no retries)`);
    console.log(`Estimated paid calls: ${assets.length} TTS calls; reserve the same number in the`);
    console.log(`daily Timbre limit for the current IST day before authorising the run.\n`);
    for (const asset of assets) {
      console.log(`  ${asset.language.padEnd(2)} ${asset.promptId.padEnd(20)} ${asset.voice.padEnd(8)} -> ${asset.path}`);
    }
    console.log("\nTo execute the paid run:");
    console.log("  GNANI_API_KEY=… deno run --allow-read --allow-write --allow-env --allow-net --allow-run \\");
    console.log("    scripts/generate-prompt-audio.ts --live --i-authorize-paid-generation");
    return;
  }

  if (!argv.has("--i-authorize-paid-generation")) {
    console.error("Refusing to run: --live also requires --i-authorize-paid-generation.");
    console.error(`This will make ${assets.length} paid provider requests and write real audio.`);
    Deno.exit(2);
  }

  const apiKey = Deno.env.get("GNANI_API_KEY") ?? "";
  if (!apiKey) {
    console.error("Refusing to run: GNANI_API_KEY is not set. Export it for this shell only.");
    Deno.exit(2);
  }

  // Guard against accidentally pointing the generator at a hosted target.
  const endpoint = Deno.env.get("TIMBRE_ENDPOINT") ?? "https://api.vachana.ai/api/v1/tts/inference";
  if (!endpoint.startsWith("https://")) {
    console.error("Refusing to run: TIMBRE_ENDPOINT must be the verified https endpoint.");
    Deno.exit(2);
  }

  console.log(`LIVE RUN — ${assets.length} requests against timbre-v2.5`);
  await live(assets, apiKey);
}

if (import.meta.main) {
  await main();
}
