/**
 * Exports the 150-question bank to a reviewer CSV, or validates it.
 *
 *   deno run --allow-read --allow-write scripts/export-question-bank.ts            # write CSV
 *   deno run --allow-read scripts/export-question-bank.ts --check                  # validate only
 *
 * The script never edits the bank and never marks anything approved.
 */
import { BANK_VERSION, QUESTIONS, DEPARTMENT_KEYS, getQuestion } from "../supabase/functions/_shared/intake/question-bank.ts";

const CHECK = Deno.args.includes("--check");
const OUT = new URL("../docs/question-bank-review/question-bank-v1-review.csv", import.meta.url);

const HEADER = [
  "question_id", "department", "english_question", "hindi_question",
  "english_options", "hindi_options", "answer_type", "tags", "report_field",
  "clinical_review_status", "hindi_review_status", "reviewer_comments", "revision_notes",
];

function csvField(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function row(q: (typeof QUESTIONS)[number]): string[] {
  const enOpts = q.options.map((o) => `${o.value}: ${o.en}`).join(" | ");
  const hiOpts = q.options.map((o) => `${o.value}: ${o.hi}`).join(" | ");
  return [
    q.id, q.department, q.en, q.hi, enOpts, hiOpts, q.answerType,
    q.tags.join(" "), q.field, "pending", "pending", "", "",
  ];
}

const problems: string[] = [];
const ids = new Set<string>();
for (const q of QUESTIONS) {
  if (ids.has(q.id)) problems.push(`duplicate id: ${q.id}`);
  ids.add(q.id);
  if (!q.en.trim()) problems.push(`${q.id}: missing English`);
  if (!q.hi.trim()) problems.push(`${q.id}: missing Hindi`);
  if (q.answerType === "single_choice" && q.options.length < 2) problems.push(`${q.id}: missing localized options`);
  if (q.version !== BANK_VERSION) problems.push(`${q.id}: version mismatch`);
}
if (QUESTIONS.length !== 150) problems.push(`expected 150 questions, found ${QUESTIONS.length}`);
for (const department of DEPARTMENT_KEYS) {
  const count = QUESTIONS.filter((q) => q.department === department).length;
  if (count !== 30) problems.push(`${department}: expected 30, found ${count}`);
}

const csv = [HEADER, ...QUESTIONS.map((q) => row(q).map(csvField))].map((cells) => cells.join(",")).join("\n") + "\n";

if (CHECK) {
  const lines = csv.trimEnd().split("\n");
  const body = lines.slice(1);
  const pending = body.filter((line) => line.includes(",pending,pending,")).length;
  const revision = QUESTIONS.filter((q) => false).length; // no reviewer decisions exist yet by design
  console.log(`bank version: ${BANK_VERSION}`);
  console.log(`rows: ${body.length} (header excluded)`);
  console.log(`clinical review: ${pending} pending, 0 approved, ${revision} marked for revision`);
  console.log(`hindi review: ${pending} pending, 0 approved`);
  for (const department of DEPARTMENT_KEYS) {
    console.log(`  ${department}: ${QUESTIONS.filter((q) => q.department === department).length}`);
  }
  if (problems.length > 0) {
    console.error(`\nVALIDATION FAILED (${problems.length}):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    Deno.exit(1);
  }
  console.log("\nVALIDATION PASSED");
  Deno.exit(0);
}

await Deno.writeTextFile(OUT, csv);
console.log(`wrote ${QUESTIONS.length} rows to docs/question-bank-review/question-bank-v1-review.csv`);
if (problems.length > 0) {
  console.error(`warnings: ${problems.join("; ")}`);
  Deno.exit(1);
}
