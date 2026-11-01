/**
 * Imports a completed review CSV and produces a PROPOSAL. Never edits bank-v1.ts.
 *   deno run --allow-read --allow-write scripts/import-question-bank-review.ts <review.csv>
 */
import { QUESTIONS } from "../supabase/functions/_shared/intake/question-bank.ts";

const file = Deno.args[0];
if (!file) { console.error("usage: import-question-bank-review.ts <review.csv>"); Deno.exit(2); }

const text = await Deno.readTextFile(file);
const lines = text.trimEnd().split("\n");
const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, ""));
const idx = (name: string) => header.indexOf(name);
const idAt = idx("question_id");
if (idAt < 0) { console.error("missing question_id column"); Deno.exit(2); }

const rows = lines.slice(1).map((line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replaceAll('""', '"')) ?? []);
const problems: string[] = [];
const decisions: Array<{ id: string; clinical: string; hindi: string; comments: string }> = [];
const seen = new Set<string>();

for (const row of rows) {
  const id = row[idAt];
  if (!id) continue;
  if (seen.has(id)) problems.push(`duplicate id ${id}`);
  seen.add(id);
  const question = QUESTIONS.find((q) => q.id === id);
  if (!question) { problems.push(`unknown id ${id}`); continue; }
  const clinical = row[idx("clinical_review_status")] ?? "pending";
  const hindi = row[idx("hindi_review_status")] ?? "pending";
  const allowed = ["pending", "approved", "needs_revision"];
  if (!allowed.includes(clinical)) problems.push(`${id}: invalid clinical status ${clinical}`);
  if (!allowed.includes(hindi)) problems.push(`${id}: invalid hindi status ${hindi}`);
  const en = row[idx("english_question")] ?? "";
  const hi = row[idx("hindi_question")] ?? "";
  if (en && en !== question.en) problems.push(`${id}: English text changed in the CSV`);
  if (hi && hi !== question.hi) problems.push(`${id}: Hindi text changed in the CSV`);
  decisions.push({ id, clinical, hindi, comments: row[idx("reviewer_comments")] ?? "" });
}

for (const question of QUESTIONS) if (!seen.has(question.id)) problems.push(`missing row for ${question.id}`);

const clinicalApproved = decisions.filter((d) => d.clinical === "approved").length;
const hindiApproved = decisions.filter((d) => d.hindi === "approved").length;
const revisions = decisions.filter((d) => d.clinical === "needs_revision" || d.hindi === "needs_revision").length;

console.log(`rows: ${decisions.length}/150`);
console.log(`clinical approved: ${clinicalApproved}, hindi approved: ${hindiApproved}, needs revision: ${revisions}`);
if (problems.length) {
  console.error(`\nREJECTED (${problems.length}):`);
  for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
  Deno.exit(1);
}

await Deno.writeTextFile("question-bank-review-proposal.json", JSON.stringify({ reviewedAt: new Date().toISOString(), clinicalApproved, hindiApproved, revisions, decisions }, null, 2));
console.log("\nVALID. Proposal written to question-bank-review-proposal.json.");
console.log("bank-v1.ts was NOT modified. A maintainer must apply accepted changes deliberately.");
