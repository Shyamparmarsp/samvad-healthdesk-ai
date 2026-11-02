/**
 * Question-bank source integrity verifier.
 *
 * Compares every row of the owner-reviewed CSV with the active `question-bank-v2`
 * implementation. This is intentionally exact: wording, options, tags, topic, report
 * field, answer type and review metadata must match character-for-character. The only
 * transformation applied to the CSV is removal of a leading UTF-8 BOM.
 *
 *   deno run --allow-read scripts/verify-question-bank-integrity.ts
 *   deno run --allow-read scripts/verify-question-bank-integrity.ts --csv <path>
 *   BANK_REVIEW_CSV=<path> deno run --allow-read scripts/verify-question-bank-integrity.ts
 *
 * Exit 0 = the CSV and the active bank agree. Exit 1 = a mismatch, a missing row or an
 * unexpected row. Exit 2 = the CSV could not be read or parsed.
 */

import {
  BANK_VERSION,
  QUESTIONS,
  type BankQuestion,
} from "../supabase/functions/_shared/intake/question-bank.ts";
import { REVIEW_RECORDS } from "../supabase/functions/_shared/intake/bank-v2.ts";
import {
  BANK_VERSION as V1_BANK_VERSION,
  RAW_QUESTIONS as V1_RAW_QUESTIONS,
} from "../supabase/functions/_shared/intake/bank-v1.ts";

const HEADER = [
  "question_id",
  "department",
  "english_question",
  "hindi_question",
  "english_options",
  "hindi_options",
  "answer_type",
  "tags",
  "report_field",
  "clinical_review_status",
  "hindi_review_status",
  "reviewer_comments",
  "revision_notes",
] as const;

type Header = (typeof HEADER)[number];
type Row = Record<Header, string>;

function argValue(name: string): string | undefined {
  const index = Deno.args.indexOf(name);
  if (index < 0) return undefined;
  const value = Deno.args[index + 1];
  if (!value) {
    console.error(`${name} requires a path`);
    Deno.exit(2);
  }
  return value;
}

let envPath: string | undefined;
try {
  envPath = Deno.env.get("BANK_REVIEW_CSV") ?? undefined;
} catch {
  // --allow-env is optional; the repository-relative default still works.
}

const csvPath = argValue("--csv") ??
  envPath ??
  "docs/question-bank-review/question-bank-v2-reviewed.csv";

/** RFC-4180-style parser: quoted commas, escaped quotes, CRLF and a leading BOM. */
function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
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
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => !(cells.length === 1 && cells[0] === ""));
}

function splitOption(part: string): [value: string, label: string] | null {
  const separator = part.indexOf(":");
  if (separator <= 0) return null;
  return [part.slice(0, separator), part.slice(separator + 1).trimStart()];
}

function parseOptions(english: string, hindi: string): { value: string; en: string; hi: string }[] {
  if (english === "" && hindi === "") return [];
  if (english === "" || hindi === "") throw new Error("one language has options and the other does not");

  const enParts = english.split(" | ").map(splitOption);
  const hiParts = hindi.split(" | ").map(splitOption);
  if (enParts.some((part) => part === null) || hiParts.some((part) => part === null)) {
    throw new Error("option is missing a 'value: label' pair");
  }
  if (enParts.length !== hiParts.length) throw new Error("option counts differ by language");

  return enParts.map((enPart, index) => {
    const en = enPart!;
    const hi = hiParts[index]!;
    if (en[0] !== hi[0]) throw new Error(`option value differs: ${en[0]} vs ${hi[0]}`);
    return { value: en[0], en: en[1], hi: hi[1] };
  });
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function describeOptions(options: readonly { value: string; en: string; hi: string }[]): string {
  return options.map((option) => `${option.value}: ${option.en} / ${option.hi}`).join(" | ");
}

function main(): void {
  let raw: string;
  try {
    raw = Deno.readTextFileSync(csvPath);
  } catch (error) {
    console.error(`Cannot read CSV at ${csvPath}: ${(error as Error).message}`);
    Deno.exit(2);
  }

  let table: string[][];
  try {
    table = parseCsv(raw);
  } catch (error) {
    console.error(`Cannot parse CSV: ${(error as Error).message}`);
    Deno.exit(2);
  }

  if (table.length < 2) {
    console.error("CSV has no data rows");
    Deno.exit(2);
  }

  const header = table[0];
  if (!sameArray(header, HEADER)) {
    console.error("CSV header does not match the expected columns");
    console.error(`expected: ${HEADER.join(",")}`);
    console.error(`actual:   ${header.join(",")}`);
    Deno.exit(1);
  }

  const rows: Row[] = table.slice(1).map((cells, rowIndex) => {
    if (cells.length !== HEADER.length) {
      console.error(`Row ${rowIndex + 2}: expected ${HEADER.length} columns, found ${cells.length}`);
      Deno.exit(1);
    }
    return Object.fromEntries(HEADER.map((name, index) => [name, cells[index]])) as Row;
  });

  const problems: string[] = [];
  const reviewById = new Map(REVIEW_RECORDS.map((record) => [record[0], record]));
  const bankIds = new Set(QUESTIONS.map((question) => question.id));
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const id = row.question_id;
    const question: BankQuestion | undefined = QUESTIONS.find((entry) => entry.id === id);

    if (!id) {
      problems.push(`line ${line}: empty question_id`);
      continue;
    }
    if (seen.has(id)) {
      problems.push(`line ${line}: duplicate CSV id ${id}`);
      continue;
    }
    seen.add(id);

    if (!question) {
      problems.push(`line ${line}: CSV id ${id} is not in the active bank`);
      continue;
    }

    if (row.department !== question.department) {
      problems.push(`${id}: department "${row.department}" != "${question.department}"`);
    }

    const csvTags = row.tags === "" ? [] : row.tags.split(/\s+/);
    if (!sameArray(csvTags, question.tags)) {
      problems.push(`${id}: tags [${csvTags.join(", ")}] != [${question.tags.join(", ")}]`);
    }

    const derivedTopic = csvTags.join("-");
    if (derivedTopic !== question.topic) {
      problems.push(`${id}: topic "${question.topic}" != tags-derived "${derivedTopic}"`);
    }

    if (row.english_question !== question.en) {
      problems.push(`${id}: English question changed`);
    }
    if (row.hindi_question !== question.hi) {
      problems.push(`${id}: Hindi question changed`);
    }
    if (row.report_field !== question.field) {
      problems.push(`${id}: report field "${row.report_field}" != "${question.field}"`);
    }
    if (row.answer_type !== question.answerType) {
      problems.push(`${id}: answer type "${row.answer_type}" != "${question.answerType}"`);
    }

    let csvOptions: { value: string; en: string; hi: string }[];
    try {
      csvOptions = parseOptions(row.english_options, row.hindi_options);
    } catch (error) {
      problems.push(`${id}: ${(error as Error).message}`);
      continue;
    }

    if (
      csvOptions.length !== question.options.length ||
      csvOptions.some((option, optionIndex) => {
        const actual = question.options[optionIndex];
        return !actual ||
          option.value !== actual.value ||
          option.en !== actual.en ||
          option.hi !== actual.hi;
      })
    ) {
      problems.push(
        `${id}: options differ\n    CSV:  ${describeOptions(csvOptions)}\n    BANK: ${describeOptions(question.options)}`,
      );
    }

    const review = reviewById.get(id);
    if (!review) {
      problems.push(`${id}: missing review record`);
    } else {
      const [, clinical, hindi, comments, notes] = review;
      if (row.clinical_review_status !== clinical) {
        problems.push(`${id}: clinical review "${row.clinical_review_status}" != "${clinical}"`);
      }
      if (row.hindi_review_status !== hindi) {
        problems.push(`${id}: Hindi review "${row.hindi_review_status}" != "${hindi}"`);
      }
      if (row.reviewer_comments !== comments) {
        problems.push(`${id}: reviewer comments changed`);
      }
      if (row.revision_notes !== notes) {
        problems.push(`${id}: revision notes changed`);
      }
    }
  }

  for (const id of bankIds) {
    if (!seen.has(id)) problems.push(`${id}: present in the bank but missing from the CSV`);
  }
  for (const id of reviewById.keys()) {
    if (!bankIds.has(id)) problems.push(`${id}: review record has no bank question`);
  }

  if (BANK_VERSION !== "question-bank-v2") {
    problems.push(`active bank version is ${BANK_VERSION}, expected question-bank-v2`);
  }
  if (QUESTIONS.length !== 150) {
    problems.push(`active bank has ${QUESTIONS.length} questions, expected 150`);
  }
  if (new Set(QUESTIONS.map((question) => question.id)).size !== QUESTIONS.length) {
    problems.push("active bank contains duplicate question ids");
  }
  if (REVIEW_RECORDS.length !== 150) {
    problems.push(`active bank has ${REVIEW_RECORDS.length} review records, expected 150`);
  }
  if (new Set(REVIEW_RECORDS.map((record) => record[0])).size !== REVIEW_RECORDS.length) {
    problems.push("active bank contains duplicate review-record ids");
  }
  if (rows.length !== 150) {
    problems.push(`CSV has ${rows.length} rows, expected 150`);
  }
  if (V1_BANK_VERSION !== "question-bank-v1") {
    problems.push(`v1 rollback bank version is ${V1_BANK_VERSION}, expected question-bank-v1`);
  }
  if (V1_RAW_QUESTIONS.length !== 150) {
    problems.push(`v1 rollback bank has ${V1_RAW_QUESTIONS.length} questions, expected 150`);
  }

  console.log("Question-bank source integrity");
  console.log(`  CSV              ${csvPath}`);
  console.log(`  CSV rows         ${rows.length}`);
  console.log(`  Active questions ${QUESTIONS.length} (${BANK_VERSION})`);
  console.log(`  Review records   ${REVIEW_RECORDS.length}`);
  console.log(`  v1 rollback      ${V1_RAW_QUESTIONS.length} questions (${V1_BANK_VERSION})`);

  if (problems.length > 0) {
    console.error(`\nFAIL: ${problems.length} integrity problem(s)`);
    for (const problem of problems) console.error(`  - ${problem}`);
    Deno.exit(1);
  }

  console.log("\nPASS: every CSV question, option and review field matches the active bank.");
}

main();
