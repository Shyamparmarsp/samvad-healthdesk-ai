/**
 * Offline tests for the opt-in TTS -> STT round-trip harness.
 *
 * No provider is contacted: every request goes to an injected fetch stub and every clip
 * is written through an injected writer. These tests prove the harness's own contract
 * (comparison, failure classification, cost bounds, opt-in gate). They are NOT evidence
 * of live provider performance; see docs/speech-roundtrip-verification/.
 */

import {
  DEFAULT_AUDIO_DIR,
  MAX_ROUNDTRIP_REQUESTS,
  ROUNDTRIP_SENTENCES,
  ROUNDTRIP_TIMEOUT_MS,
  assertSafeAudioDir,
  audioMimeTypeFor,
  compareTranscripts,
  looksLikeMp3,
  normalizeTranscript,
  parseSmokeArgs,
  runRoundTrip,
  runRoundTripIfLive,
  SmokeUsageError,
  type RoundTripLanguage,
} from "../../scripts/provider-smoke.ts";

const FIXTURE_DIR = new URL("./fixtures/speech-roundtrip/", import.meta.url);
const CASES = JSON.parse(
  await Deno.readTextFile(new URL("cases.json", FIXTURE_DIR)),
) as {
  cases: Record<string, { sentence: string; transcript: string; expectedVerdict: string }>;
  providerResponses: Record<string, unknown>;
};
const FAKE_AUDIO = Uint8Array.from(
  atob((await Deno.readTextFile(new URL("fake-tts.mp3.b64", FIXTURE_DIR))).trim()),
  (character) => character.charCodeAt(0),
);

const TEST_KEY = "offline-test-key-never-real";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

interface CapturedCall {
  url: string;
  init: RequestInit;
}

interface FetchStub {
  fetchImpl: typeof fetch;
  calls: CapturedCall[];
}

function stubFetch(
  handler: (call: CapturedCall) => Response | Promise<Response>,
): FetchStub {
  const calls: CapturedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: CapturedCall = { url: String(input), init: init ?? {} };
    calls.push(call);
    return await handler(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function ttsAudioResponse(audio: Uint8Array = FAKE_AUDIO, contentType = "audio/mpeg"): Response {
  const body = new ArrayBuffer(audio.byteLength);
  new Uint8Array(body).set(audio);
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

function sttJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isTts(call: CapturedCall): boolean {
  return call.url.includes("/tts/");
}

interface RunOptions {
  languages?: RoundTripLanguage[];
  transcripts?: Partial<Record<RoundTripLanguage, string>>;
  tts?: (call: CapturedCall) => Response | Promise<Response>;
  stt?: (call: CapturedCall) => Response | Promise<Response>;
  timeoutMs?: number;
  apiKey?: string;
  outDir?: string;
}

async function runWithStub(options: RunOptions = {}) {
  const stub = stubFetch((call) => {
    if (isTts(call)) {
      return options.tts ? options.tts(call) : ttsAudioResponse();
    }
    if (options.stt) return options.stt(call);
    const language = (call.init.body as FormData).get("language_code") as RoundTripLanguage;
    const provided = options.transcripts?.[language];
    if (provided !== undefined) {
      return sttJsonResponse({ success: true, transcript: provided, model: "prisma-v2.5" });
    }
    const fallback = language === "hi-IN"
      ? CASES.providerResponses.sttSuccessHindi
      : CASES.providerResponses.sttSuccessEnglish;
    return sttJsonResponse(fallback);
  });

  const saved: Array<{ language: RoundTripLanguage; bytes: number }> = [];
  const report = await runRoundTrip({
    apiKey: options.apiKey ?? TEST_KEY,
    outDir: options.outDir ?? DEFAULT_AUDIO_DIR,
    languages: options.languages,
    timeoutMs: options.timeoutMs ?? 250,
    fetchImpl: stub.fetchImpl,
    writeAudioImpl: (language, audio) => {
      saved.push({ language, bytes: audio.byteLength });
      return Promise.resolve(`${DEFAULT_AUDIO_DIR}/roundtrip-${language}.mp3`);
    },
  });
  return { report, calls: stub.calls, saved };
}

/* -------------------------------------------------------------------------- */
/* CLI contract                                                               */
/* -------------------------------------------------------------------------- */

Deno.test("round-trip args: --roundtrip is non-live by default", () => {
  const options = parseSmokeArgs(["--roundtrip"]);
  assertEqual(options.roundTrip, true, "round-trip selected");
  assertEqual(options.live, false, "live requires an explicit flag");
  assertEqual(options.outDir, DEFAULT_AUDIO_DIR, "default audio directory is git-ignored");
});

Deno.test("round-trip args: --live --roundtrip is accepted", () => {
  const options = parseSmokeArgs(["--live", "--roundtrip"]);
  assertEqual(options.live, true, "live");
  assertEqual(options.roundTrip, true, "round-trip");
});

Deno.test("round-trip args: combining --roundtrip with --provider is refused", () => {
  for (const args of [
    ["--roundtrip", "--provider", "timbre"],
    ["--provider", "prisma,timbre", "--roundtrip"],
  ]) {
    let refused = false;
    try {
      parseSmokeArgs(args);
    } catch (error) {
      refused = error instanceof SmokeUsageError;
    }
    assert(refused, `${args.join(" ")} must be refused`);
  }
});

Deno.test("round-trip gate: live work never runs without --live", async () => {
  let invoked = false;
  const result = await runRoundTripIfLive(
    { live: false, outDir: DEFAULT_AUDIO_DIR },
    () => {
      invoked = true;
      throw new Error("live path must not run");
    },
  );
  assert(result.dryRun, "dry-run plan returned");
  if (result.dryRun) {
    assertEqual(result.requests, MAX_ROUNDTRIP_REQUESTS, "planned request count");
    assertEqual(result.languages.length, 2, "both languages planned");
  }
  assertEqual(invoked, false, "live callback never invoked");
});

Deno.test("round-trip gate: live mode rejects an audio directory outside .provider-audio", async () => {
  for (const outDir of ["src/audio", "docs", "../outside", ".provider-audio-evil"]) {
    let invoked = false;
    let refused = false;
    try {
      await runRoundTripIfLive({ live: true, outDir }, () => {
        invoked = true;
        throw new Error("live path must not run");
      });
    } catch (error) {
      refused = error instanceof SmokeUsageError;
    }
    assert(refused, `${outDir} must be refused`);
    assertEqual(invoked, false, "no provider work before the directory check");
  }
});

Deno.test("round-trip gate: the git-ignored audio directory is enforced and documented", async () => {
  const gitignore = await Deno.readTextFile(new URL("../../.gitignore", import.meta.url));
  assert(gitignore.split("\n").map((line) => line.trim()).includes(`${DEFAULT_AUDIO_DIR}/`), ".gitignore covers the audio directory");
  assertEqual(DEFAULT_AUDIO_DIR, ".provider-audio", "default directory");

  assertSafeAudioDir(DEFAULT_AUDIO_DIR);
  assertSafeAudioDir(`${DEFAULT_AUDIO_DIR}/nested`);
  for (const unsafe of ["audio", "src", "docs/audio", ".provider-audio-evil", "../escape"]) {
    let refused = false;
    try {
      assertSafeAudioDir(unsafe);
    } catch (error) {
      refused = error instanceof SmokeUsageError;
    }
    assert(refused, `${unsafe} must be refused`);
  }
});

/* -------------------------------------------------------------------------- */
/* Comparison                                                                 */
/* -------------------------------------------------------------------------- */

Deno.test("comparison: every fixture case produces the documented verdict", () => {
  for (const [name, entry] of Object.entries(CASES.cases)) {
    const result = compareTranscripts(entry.sentence, entry.transcript);
    assertEqual(result.verdict, entry.expectedVerdict, `fixture ${name}`);
  }
});

Deno.test("normalisation: Unicode NFC, zero-width removal, case and punctuation tolerance", () => {
  assertEqual(
    normalizeTranscript("  THIS, is a simple   speech test!! "),
    "this is a simple speech test",
    "case/punctuation/whitespace",
  );
  assertEqual(
    normalizeTranscript("cafe\u0301"),
    normalizeTranscript("café"),
    "composed vs decomposed",
  );
  assertEqual(
    normalizeTranscript("This\u200b is\u200d a\ufeff test."),
    "this is a test",
    "zero-width characters removed",
  );
  const hindi = normalizeTranscript("  आज   मौसम बहुत अच्छा है !!! ");
  assert(hindi.includes("आज"), "Devanagari letters preserved");
  assert(hindi.includes("अच्छा"), "Devanagari combining marks preserved");
  assertEqual(hindi, "आज मौसम बहुत अच्छा है", "danda and spacing normalised");
});

Deno.test("comparison: a material difference is never reported as a match", () => {
  const mismatch = compareTranscripts(
    "This is a simple speech test.",
    "This is a simple speech task.",
  );
  assertEqual(mismatch.verdict, "MISMATCH", "substituted word");
  assert(mismatch.differenceTokens > 0, "differences counted");
  assert(mismatch.similarity < 1, "never full similarity");

  const missing = compareTranscripts(
    "This is a simple speech test.",
    "This is a speech test.",
  );
  assertEqual(missing.verdict, "MISMATCH", "missing word");

  const romanized = compareTranscripts(
    ROUNDTRIP_SENTENCES["hi-IN"],
    "aaj mausam bahut achha hai",
  );
  assertEqual(romanized.verdict, "MISMATCH", "no silent transliteration");
});

Deno.test("comparison: an empty or punctuation-only transcript is EMPTY, not a match", () => {
  for (const actual of ["", "   ", "...", "।"]) {
    const result = compareTranscripts(ROUNDTRIP_SENTENCES["en-IN"], actual);
    assertEqual(result.verdict, "EMPTY", JSON.stringify(actual));
  }
});

/* -------------------------------------------------------------------------- */
/* Round-trip: success                                                        */
/* -------------------------------------------------------------------------- */

Deno.test("english round trip: TTS then STT, normalised match passes", async () => {
  const { report, calls, saved } = await runWithStub({ languages: ["en-IN"] });
  assertEqual(report.status, "PASS", "overall status");
  assertEqual(report.requestCount, 2, "one TTS + one STT");
  assertEqual(calls.length, 2, "exactly two provider calls");
  assert(isTts(calls[0]), "first call is TTS");
  assert(!isTts(calls[1]), "second call is STT");
  assertEqual(saved.length, 1, "one clip saved");
  assertEqual(report.languages[0].comparison?.verdict, "MATCH", "comparison");
  assert(report.checks.every((check) => check.status === "PASS"), "every check PASS");
});

Deno.test("hindi round trip: Devanagari transcript matches after normalisation", async () => {
  const { report, calls } = await runWithStub({
    languages: ["hi-IN"],
    transcripts: { "hi-IN": "  आज   मौसम बहुत अच्छा है !!! " },
  });
  assertEqual(report.status, "PASS", "overall status");
  assertEqual(report.requestCount, 2, "two requests");
  assertEqual(report.languages[0].comparison?.verdict, "MATCH", "comparison");
  const form = calls[1].init.body as FormData;
  assertEqual(form.get("language_code"), "hi-IN", "Hindi STT configuration");
});

Deno.test("both languages: exactly four provider requests and two saved clips", async () => {
  const { report, calls, saved } = await runWithStub();
  assertEqual(report.status, "PASS", "overall status");
  assertEqual(report.requestCount, 4, "2 TTS + 2 STT");
  assertEqual(report.requestCount, calls.length, "count matches observed calls");
  assertEqual(report.maxRequests, 4, "documented hard maximum");
  assertEqual(saved.length, 2, "two clips");
  assertEqual(report.audioPaths.length, 2, "two reported paths");
  assertEqual(
    calls.filter((call) => isTts(call)).length,
    2,
    "two TTS calls",
  );
});

Deno.test("provider contracts: existing Timbre and Prisma configuration is reused", async () => {
  const { calls } = await runWithStub();
  const englishTts = JSON.parse(String(calls[0].init.body));
  assertEqual(englishTts.model, "timbre-v2.5", "explicit Timbre model");
  assertEqual(englishTts.voice, "Kaveri", "English voice");
  assertEqual(englishTts.language, "en-IN", "English language");
  assertEqual(englishTts.audio_config.container, "mp3", "mp3 container");

  const hindiTts = JSON.parse(String(calls[2].init.body));
  assertEqual(hindiTts.voice, "Nalini", "Hindi voice");
  assertEqual(hindiTts.language, "hi-IN", "Hindi language");

  const englishForm = calls[1].init.body as FormData;
  assertEqual(englishForm.get("language_code"), "en-IN", "STT language code");
  const englishFile = englishForm.get("audio_file") as File;
  assert(englishFile instanceof File, "audio_file is a file");
  assert(englishFile.size > 0, "audio_file is not empty");
  assert(englishFile.name.endsWith(".mp3"), "mp3 filename extension");
});

/* -------------------------------------------------------------------------- */
/* Round-trip: failures                                                       */
/* -------------------------------------------------------------------------- */

Deno.test("material mismatch: the run fails and reports counts without transcripts", async () => {
  const { report } = await runWithStub({
    transcripts: { "en-IN": "This is a simple speech task." },
  });
  assertEqual(report.status, "FAIL", "overall status");
  assertEqual(report.languages[0].comparison?.verdict, "MISMATCH", "comparison");
  const comparisonCheck = report.checks.find((check) => check.check.includes("transcript comparison (en-IN)"));
  assert(comparisonCheck !== undefined, "comparison check exists");
  assertEqual(comparisonCheck?.status, "FAIL", "comparison check fails");
  assert(comparisonCheck?.detail.includes("verdict=MISMATCH") === true, "verdict detail");
});

Deno.test("empty STT transcript: the round trip fails, it is not a successful match", async () => {
  const { report } = await runWithStub({
    languages: ["en-IN"],
    transcripts: { "en-IN": "" },
  });
  assertEqual(report.status, "FAIL", "overall status");
  assertEqual(report.languages[0].comparison?.verdict, "EMPTY", "empty comparison");
  assertEqual(report.languages[0].stt.accepted, true, "provider call itself succeeded");
  assertEqual(report.requestCount, 2, "both requests were made");
});

Deno.test("malformed STT response: classified, no comparison attempted", async () => {
  const { report } = await runWithStub({
    languages: ["en-IN"],
    stt: () => sttJsonResponse(CASES.providerResponses.sttMalformed),
  });
  assertEqual(report.status, "FAIL", "overall status");
  assertEqual(report.languages[0].stt.accepted, false, "STT contract rejected");
  assertEqual(report.languages[0].comparison, null, "no comparison");
  const sttCheck = report.checks.find((check) => check.check === "STT request (en-IN)");
  assert(sttCheck?.detail.includes("invalid_response") === true, "stable failure kind");
});

Deno.test("TTS failure: no STT call, no retry, remaining language NOT TESTED", async () => {
  const { report, calls } = await runWithStub({
    tts: () => new Response("{}", { status: 503 }),
  });
  assertEqual(report.status, "FAIL", "overall status");
  assertEqual(report.requestCount, 1, "only the TTS attempt");
  assertEqual(calls.length, 1, "no automatic retry");
  assertEqual(report.languages[0].tts.accepted, false, "TTS failed");
  assertEqual(report.languages[0].audioPath, null, "no clip saved");
  assertEqual(report.languages[1].checks[0].status, "NOT TESTED", "second language skipped");
  assertEqual(report.languages[1].comparison, null, "no comparison");
});

Deno.test("STT failure: one TTS + one STT, then stop", async () => {
  const { report, calls } = await runWithStub({
    stt: () => new Response("{}", { status: 503 }),
  });
  assertEqual(report.status, "FAIL", "overall status");
  assertEqual(report.requestCount, 2, "one TTS + one STT");
  assertEqual(calls.length, 2, "no retry");
  assertEqual(report.languages[1].checks[0].status, "NOT TESTED", "second language skipped");
});

Deno.test("timeout: the request aborts, fails safely and does not hang", async () => {
  const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort);
    })) as typeof fetch;

  const report = await runRoundTrip({
    apiKey: TEST_KEY,
    outDir: DEFAULT_AUDIO_DIR,
    languages: ["en-IN"],
    timeoutMs: 25,
    fetchImpl,
    writeAudioImpl: () => Promise.resolve(`${DEFAULT_AUDIO_DIR}/unused.mp3`),
  });
  assertEqual(report.status, "FAIL", "timeout fails the round trip");
  assertEqual(report.requestCount, 1, "one aborted request");
  const ttsCheck = report.checks.find((check) => check.check === "TTS request (en-IN)");
  assert(ttsCheck?.detail.includes("timeout") === true, "timeout kind");
});

Deno.test("unsupported TTS container: no STT request is made", async () => {
  const notAudio = Uint8Array.from([0x7b, 0x7d]);
  const { report, calls } = await runWithStub({
    languages: ["en-IN"],
    tts: () => ttsAudioResponse(notAudio, "application/json"),
  });
  assertEqual(report.status, "FAIL", "overall status");
  assertEqual(report.requestCount, 1, "no STT call");
  assertEqual(calls.length, 1, "one request only");
  const container = report.checks.find((check) => check.check === "TTS audio container (en-IN)");
  assertEqual(container?.status, "FAIL", "container check");
});

Deno.test("missing credentials: no request is made and nothing claims a result", async () => {
  let called = false;
  const report = await runRoundTrip({
    apiKey: "",
    outDir: DEFAULT_AUDIO_DIR,
    fetchImpl: (() => {
      called = true;
      throw new Error("network must not be used");
    }) as unknown as typeof fetch,
    writeAudioImpl: () => {
      throw new Error("file writer must not be used");
    },
  });
  assertEqual(report.status, "NOT TESTED", "no credential, no result");
  assertEqual(report.requestCount, 0, "zero requests");
  assertEqual(called, false, "fetch never invoked");
  assert(report.checks.every((check) => check.status === "NOT TESTED"), "all checks NOT TESTED");
});

/* -------------------------------------------------------------------------- */
/* Safety output                                                              */
/* -------------------------------------------------------------------------- */

Deno.test("report output: no key, audio bytes or transcript text", async () => {
  const marker = "UNIQUE_TRANSCRIPT_MARKER_DO_NOT_LOG";
  const { report } = await runWithStub({ transcripts: { "en-IN": marker } });
  const serialized = JSON.stringify(report);
  assert(!serialized.includes(TEST_KEY), "key must never appear");
  assert(!serialized.includes(marker), "transcript text must never appear");
  const base64Audio = btoa(String.fromCharCode(...FAKE_AUDIO));
  assert(!serialized.includes(base64Audio), "audio bytes must never appear");
});

Deno.test("mime mapping: accepts documented types, infers MP3 only from a valid signature", () => {
  assertEqual(audioMimeTypeFor("audio/mpeg", FAKE_AUDIO), "audio/mpeg", "direct mpeg");
  assertEqual(audioMimeTypeFor("audio/mpeg; charset=binary", FAKE_AUDIO), "audio/mpeg", "parameter stripped");
  assertEqual(audioMimeTypeFor("application/octet-stream", FAKE_AUDIO), "audio/mpeg", "MP3 signature");
  assertEqual(audioMimeTypeFor("application/octet-stream", Uint8Array.from([0x7b, 0x7d])), null, "no guessing");
  assertEqual(audioMimeTypeFor("audio/webm", Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), null, "webm refused");
});

Deno.test("constants: sentences are synthetic, short and non-empty", () => {
  assertEqual(ROUNDTRIP_TIMEOUT_MS, 30_000, "timeout documented");
  for (const language of ["en-IN", "hi-IN"] as const) {
    const sentence = ROUNDTRIP_SENTENCES[language];
    assert(sentence.length > 0 && sentence.length <= 120, `${language} length`);
    assert(!/patient|symptom|pain|medicine|diagnos/i.test(sentence), `${language} is non-medical`);
  }
  assert(looksLikeMp3(FAKE_AUDIO), "fixture is a minimal MP3");
});
