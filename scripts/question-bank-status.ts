/**
 * Reviewer dashboard for the canonical bilingual question bank (question-bank-v1).
 *
 * Read-only. It never edits `bank-v1.ts` and never marks anything approved: the clinical
 * and Hindi review statuses stay exactly as the reviewers left them in the CSV.
 *
 *   deno run --allow-read scripts/question-bank-status.ts
 *   deno run --allow-read --allow-write scripts/question-bank-status.ts --json
 *
 * The CSV is optional. Without it the dashboard reports the bank inventory and states
 * that no review has been recorded yet.
 */

import {
  BANK_VERSION,
  DEPARTMENT_KEYS,
  QUESTIONS,
  validateBank,
} from "../supabase/functions/_shared/intake/question-bank.ts";

const CSV_PATH =
  Deno.env.get("BANK_REVIEW_CSV") ??
  "docs/question-bank-review/question-bank-v1-review.csv";
const JSON_ONLY = Deno.args.includes("--json");

interface ReviewRow {
  id: string;
  clinical: string;
  hindi: string;
  comments: string;
}

/** Small CSV reader: quoted fields, escaped quotes, embedded commas. */
function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  const [header, ...body] = records;
  if (!header) return [];
  return body
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => {
      const entry: Record<string, string> = {};
      header.forEach((name, index) => {
        entry[name.trim()] = (cells[index] ?? "").trim();
      });
      return entry;
    });
}

const validation = validateBank();
const inventory = {
  bankVersion: BANK_VERSION,
  total: QUESTIONS.length,
  departments: Object.fromEntries(
    DEPARTMENT_KEYS.map((key) => [key, QUESTIONS.filter((q) => q.department === key).length]),
  ),
  answerTypes: {
    free_text: QUESTIONS.filter((q) => q.answerType === "free_text").length,
    yes_no: QUESTIONS.filter((q) => q.answerType === "yes_no").length,
    single_choice: QUESTIONS.filter((q) => q.answerType === "single_choice").length,
  },
  withHindi: QUESTIONS.filter((q) => q.hi.trim().length > 0).length,
  withLocalisedChoices: QUESTIONS.filter((q) =>
    q.options.length > 0 && q.options.every((option) => option.hi.trim().length > 0)
  ).length,
  reviewStatuses: [...new Set(QUESTIONS.map((q) => q.review))],
  sourceIntegrity: validation.length === 0 ? "PASS" : "FAIL",
  sourceIssues: validation,
};

let review: ReviewRow[] | null = null;
const csvIssues: string[] = [];
let csvNote = "no review CSV found — nothing has been reviewed yet";

try {
  const text = await Deno.readTextFile(CSV_PATH);
  const records = parseCsv(text);
  review = records.map((record) => ({
    id: record.question_id ?? "",
    clinical: record.clinical_review_status || "pending",
    hindi: record.hindi_review_status || "pending",
    comments: record.reviewer_comments ?? "",
  }));
  csvNote = `${review.length} rows read from ${CSV_PATH}`;

  const seen = new Set<string>();
  const bankIds = new Set(QUESTIONS.map((q) => q.id));
  for (const row of review) {
    if (!row.id) continue;
    if (seen.has(row.id)) csvIssues.push(`duplicate id ${row.id}`);
    seen.add(row.id);
    if (!bankIds.has(row.id)) csvIssues.push(`unknown id ${row.id}`);
    for (const [label, value] of [["clinical", row.clinical], ["hindi", row.hindi]] as const) {
      if (!["pending", "approved", "needs_revision"].includes(value)) {
        csvIssues.push(`${row.id}: invalid ${label} status "${value}"`);
      }
    }
  }
  for (const id of bankIds) {
    if (!seen.has(id)) csvIssues.push(`missing id ${id}`);
  }
} catch {
  review = null;
}

const countBy = (key: "clinical" | "hindi", value: string) =>
  (review ?? []).filter((row) => row[key] === value).length;

const unresolved = (review ?? []).filter((row) => row.clinical !== "approved" || row.hindi !== "approved");
const needsRevision = (review ?? []).filter(
  (row) => row.clinical === "needs_revision" || row.hindi === "needs_revision",
);

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  bank: inventory,
  csv: { path: CSV_PATH, present: review !== null, note: csvNote, issues: csvIssues },
  progress: review === null
    ? null
    : {
        rows: review.length,
        clinical: {
          approved: countBy("clinical", "approved"),
          needs_revision: countBy("clinical", "needs_revision"),
          pending: countBy("clinical", "pending"),
        },
        hindi: {
          approved: countBy("hindi", "approved"),
          needs_revision: countBy("hindi", "needs_revision"),
          pending: countBy("hindi", "pending"),
        },
        awaitingAnyReview: unresolved.filter((row) => row.clinical === "pending" && row.hindi === "pending").length,
        needsRevision: needsRevision.map((row) => ({ id: row.id, clinical: row.clinical, hindi: row.hindi })),
      },
  clinicalValidation: "NOT CLAIMED — human owner review is required",
};

if (!JSON_ONLY) {
  console.log(`Question bank ${inventory.bankVersion} — reviewer dashboard`);
  console.log(`  questions: ${inventory.total} (${Object.entries(inventory.departments).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`  Hindi text present: ${inventory.withHindi}/${inventory.total}`);
  console.log(`  localised choice sets: ${inventory.withLocalisedChoices}`);
  console.log(`  source integrity: ${inventory.sourceIntegrity}${inventory.sourceIssues.length ? ` (${inventory.sourceIssues.length} issues)` : ""}`);
  console.log(`  review CSV: ${csvNote}`);
  if (report.progress) {
    const p = report.progress;
    console.log(`  clinical: approved ${p.clinical.approved}, needs_revision ${p.clinical.needs_revision}, pending ${p.clinical.pending}`);
    console.log(`  hindi:    approved ${p.hindi.approved}, needs_revision ${p.hindi.needs_revision}, pending ${p.hindi.pending}`);
    console.log(`  awaiting any review: ${p.awaitingAnyReview}`);
    console.log(`  needs revision: ${p.needsRevision.length ? p.needsRevision.map((r) => r.id).join(", ") : "none"}`);
    if (csvIssues.length) console.log(`  CSV issues: ${csvIssues.slice(0, 5).join("; ")}${csvIssues.length > 5 ? ` … ${csvIssues.length} total` : ""}`);
  }
  console.log("\n  Clinical validation and Hindi approval are NOT claimed. Only humans can do that.");
}

await Deno.writeTextFile("question-bank-review-status.json", JSON.stringify(report, null, 2) + "\n");
if (!JSON_ONLY) console.log("Wrote question-bank-review-status.json");

// A malformed CSV or a broken bank is actionable; a pending review is simply pending.
const fatal = inventory.sourceIntegrity === "FAIL" || csvIssues.some((issue) => issue.startsWith("duplicate") || issue.startsWith("unknown") || issue.startsWith("missing"));
Deno.exit(fatal ? 1 : 0);
