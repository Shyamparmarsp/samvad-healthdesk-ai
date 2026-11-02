/**
 * Prompt-audio manifest drift test.
 *
 * The manifest is generated from the approved sources. This test fails when the
 * committed manifest no longer matches them, which is the signal to regenerate it
 * (`deno run --allow-read --allow-write --allow-env --allow-run
 * scripts/generate-prompt-audio.ts --manifest`).
 *
 * It also guards the generation policy itself: a live run must be a double opt-in, and
 * the known placeholder files must never be classified as valid speech.
 */

import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildManifest } from "../../scripts/generate-prompt-audio.ts";

const MANIFEST_PATH = new URL("../../docs/release-readiness/audio-prompts.json", import.meta.url);

async function sha16(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value).buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

Deno.test("manifest declares exactly the ten required prompts", () => {
  const assets = buildManifest();
  assertEquals(assets.length, 10);
  assertEquals(assets.map((a) => `${a.language}/${a.promptId}`), [
    "en/greeting",
    "en/ask-name",
    "en/ask-age",
    "en/ask-gender",
    "en/ask-primary-concern",
    "hi/greeting",
    "hi/ask-name",
    "hi/ask-age",
    "hi/ask-gender",
    "hi/ask-primary-concern",
  ]);
  for (const asset of assets) {
    assertEquals(asset.path, `public/audio/${asset.language}/${asset.promptId}.mp3`);
    assert(asset.voice === "Kaveri" || asset.voice === "Nalini", "voice must be the verified one");
    assert(asset.text.trim().length > 0);
  }
});

Deno.test("committed manifest matches the approved sources", async () => {
  const committed = JSON.parse(await Deno.readTextFile(MANIFEST_PATH)) as {
    requestCount: number;
    assets: Array<{ path: string; language: string; promptId: string; textSha256: string; voice: string }>;
  };
  const assets = buildManifest();

  assertEquals(committed.requestCount, 10);
  assertEquals(committed.assets.length, assets.length);

  for (let index = 0; index < assets.length; index += 1) {
    const expected = assets[index];
    const actual = committed.assets[index];
    assertEquals(actual.path, expected.path);
    assertEquals(actual.language, expected.language);
    assertEquals(actual.promptId, expected.promptId);
    assertEquals(actual.voice, expected.voice);
    assertEquals(
      actual.textSha256,
      await sha16(expected.text),
      `${expected.language}/${expected.promptId} text changed: regenerate the manifest`,
    );
  }
});

Deno.test("no placeholder is recorded as valid audio", async () => {
  const committed = JSON.parse(await Deno.readTextFile(MANIFEST_PATH)) as {
    assets: Array<{ path: string; valid: string; legacy: { valid: string; meanVolumeDb: number | null } | null }>;
  };
  for (const asset of committed.assets) {
    assert(!asset.valid.startsWith("valid"), `${asset.path} must not be marked valid until generated`);
    if (asset.legacy) {
      assert(asset.legacy.valid.startsWith("INVALID"), "placeholder files must be recorded as invalid");
    }
  }
});
