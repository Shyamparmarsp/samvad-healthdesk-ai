/**
 * Static policy guards for decisions the owner has not resolved.
 *
 * These read the implementation source and the published contract, so an accidental
 * "clean up" of conservative behaviour fails the suite instead of shipping silently.
 *
 * OD-02: clarification-answer turn accounting is undecided. The answer must be stored
 *        as evidence but must not advance answer_turn_count.
 * OD-09: needs_human_review is never cleared by a later "No".
 */

import { assert, assertEqual } from "./testing.ts";

const ROOT = new URL("../../../", import.meta.url);

function read(relative: string): string {
  return Deno.readTextFileSync(new URL(relative, ROOT));
}

Deno.test("policy OD-09: needs_human_review is never cleared or reset", () => {
  const source = read("supabase/functions/chat-turn/index.ts");
  assert(!/needs_human_review\s*:\s*false/.test(source), "never set to false");
  assert(!/needs_human_review\s*:\s*null/.test(source), "never nulled");
  assert(source.includes("needs_human_review: true"), "only ever raised");
  assert(source.includes("OD-09") || source.includes("never cleared"), "decision documented in code");
});

Deno.test("policy OD-02: clarification evidence is stored without counting a turn", () => {
  const source = read("supabase/functions/chat-turn/index.ts");
  assert(source.includes("clarification_answer"), "evidence column used");

  // The "No" branch must not increment the turn counter.
  const noBranch = source.slice(source.indexOf('resolution === "no"'), source.indexOf('resolution === "unresolved"'));
  assert(!/answer_turn_count/.test(noBranch), "No does not advance the turn counter");
  assert(source.includes("OD-02"), "decision referenced in code");
});

Deno.test("policy: emergency matching runs before any model routing", () => {
  const source = read("supabase/functions/chat-turn/index.ts");
  const turnStart = source.indexOf("async function handleSubmitTurn");
  const turnEnd = source.indexOf("async function handleCorrectDraft");
  assert(turnStart > 0 && turnEnd > turnStart, "turn handler located");
  const handler = source.slice(turnStart, turnEnd);

  const matchIndex = handler.indexOf("classifyAnswer(text)");
  const routingIndex = handler.indexOf("ensureDraftReport(");
  assert(matchIndex > 0, "matcher called in the turn handler");
  assert(routingIndex > 0, "draft routing reached only after matching");
  assert(matchIndex < routingIndex, "deterministic matching precedes routing");
});

Deno.test("policy: no provider call is possible during resume", () => {
  const source = read("supabase/functions/chat-turn/index.ts");
  const resumeStart = source.indexOf("async function handleResume");
  const resumeEnd = source.indexOf("async function handleConsent");
  assert(resumeStart > 0 && resumeEnd > resumeStart, "resume function located");
  const resume = source.slice(resumeStart, resumeEnd);
  for (const forbidden of ["suggestDepartment(", "transcribe(", "synthesize(", "requestStructured("]) {
    assert(!resume.includes(forbidden), `resume must not call ${forbidden}`);
  }
});

Deno.test("policy: the published contract mentions every adopted contract item", () => {
  const doc = read("docs/integration-contract.md");
  for (const token of ["transcript_preview", "2026-11-01.v1", "field_not_editable", "demo_busy", "15 accepted answers"]) {
    assert(doc.includes(token), `contract mentions ${token}`);
  }
});

Deno.test("policy: no server secret is referenced outside the provider adapters", () => {
  const files = [
    "supabase/functions/chat-turn/index.ts",
    "supabase/functions/speak/index.ts",
  ];
  for (const file of files) {
    const source = read(file);
    const matches = source.match(/Deno\.env\.get\("([A-Z_]+)"\)/g) ?? [];
    for (const match of matches) {
      assert(
        match.includes("GNANI_API_KEY") || match.includes("GROQ_API_KEY"),
        `${file} reads an unexpected secret ${match}`,
      );
    }
  }
  assertEqual(true, true, "allowlist holds");
});
