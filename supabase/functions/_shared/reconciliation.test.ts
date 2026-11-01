import { planResume, type ResumeMessageRow, type ResumeSessionRow } from "./reconciliation.ts";
import { emptyFieldMap, type FieldMap } from "./report.ts";
import { applyAnswer, parseAnswer } from "./conversation.ts";
import { assert, assertEqual } from "./testing.ts";

function session(overrides: Partial<ResumeSessionRow> = {}): ResumeSessionRow {
  return {
    answer_turn_count: 3,
    current_question_id: "primary_concern",
    status: "in_progress",
    pending_transcript_question_id: null,
    pending_transcript_expected_turn: null,
    pending_transcript_expires_at: null,
    ...overrides,
  };
}

function messages(turns: number[]): ResumeMessageRow[] {
  return turns.map((turn) => ({ role: "patient" as const, turn_index: turn }));
}

function fieldsAfter(question: Parameters<typeof parseAnswer>[0], answer: string): FieldMap {
  const parsed = parseAnswer(question, answer);
  const fields = emptyFieldMap();
  return parsed ? applyAnswer(fields, parsed) : fields;
}

Deno.test("reconciliation: message inserted but session advance interrupted", () => {
  const fields = fieldsAfter("primary_concern", "knee pain");
  const plan = planResume(session(), messages([1, 2, 3, 4]), fields);
  assert(plan.needsAdvance, "advance required");
  assertEqual(plan.orphanTurn, 4, "orphan turn");
  assertEqual(plan.reason, "orphan_message", "reason");
  assertEqual(plan.nextQuestionId, "duration", "scripted next question");
});

Deno.test("reconciliation: session already advanced needs no repair", () => {
  const fields = fieldsAfter("primary_concern", "knee pain");
  const plan = planResume(session({ answer_turn_count: 4, current_question_id: "duration" }), messages([1, 2, 3, 4]), fields);
  assert(!plan.needsAdvance, "no advance");
  assertEqual(plan.reason, "none", "reason");
});

Deno.test("reconciliation: a duplicate submit does not create a second orphan", () => {
  // The duplicate is rejected by the unique index; resume must stay a no-op.
  const fields = fieldsAfter("primary_concern", "knee pain");
  const plan = planResume(session({ answer_turn_count: 4 }), messages([1, 2, 3, 4]), fields);
  assert(!plan.needsAdvance, "no advance on duplicate");
});

Deno.test("reconciliation: terminal sessions drop transient audio state", () => {
  for (const status of ["ended", "declined", "emergency", "submitted"]) {
    const plan = planResume(
      session({ status, pending_transcript_question_id: "name", pending_transcript_expires_at: "2999-01-01T00:00:00.000Z" }),
      messages([1, 2, 3]),
      emptyFieldMap(),
    );
    assertEqual(plan.reason, "terminal_session", `${status} reason`);
    assert(plan.clearPendingTranscript, `${status} clears pending`);
    assert(!plan.needsAdvance, `${status} never advances`);
  }
});

Deno.test("reconciliation: expired pending transcript is cleared", () => {
  const plan = planResume(
    session({ pending_transcript_question_id: "primary_concern", pending_transcript_expires_at: "2020-01-01T00:00:00.000Z" }),
    messages([1, 2, 3]),
    emptyFieldMap(),
    new Date("2026-11-02T00:00:00.000Z"),
  );
  assert(plan.clearPendingTranscript, "cleared");
  assertEqual(plan.reason, "pending_expired", "reason");
});

Deno.test("reconciliation: a live pending transcript is preserved", () => {
  const plan = planResume(
    session({ pending_transcript_question_id: "primary_concern", pending_transcript_expires_at: "2026-11-02T00:10:00.000Z" }),
    messages([1, 2, 3]),
    emptyFieldMap(),
    new Date("2026-11-02T00:00:00.000Z"),
  );
  assert(!plan.clearPendingTranscript, "kept");
  assertEqual(plan.reason, "none", "reason");
});

Deno.test("reconciliation: audio pending while a text answer arrives is not an orphan", () => {
  // The text answer was accepted (turn advanced), so the pending transcript is stale
  // and must be cleared without advancing again.
  const fields = fieldsAfter("primary_concern", "knee pain");
  const plan = planResume(
    session({ answer_turn_count: 4, pending_transcript_question_id: "primary_concern", pending_transcript_expires_at: "2026-11-02T00:10:00.000Z" }),
    messages([1, 2, 3, 4]),
    fields,
    new Date("2026-11-02T00:00:00.000Z"),
  );
  assert(!plan.needsAdvance, "no double advance");
});

Deno.test("reconciliation: a late audio result after text acceptance never advances", () => {
  const plan = planResume(session({ answer_turn_count: 5 }), messages([1, 2, 3, 4, 5]), emptyFieldMap());
  assert(!plan.needsAdvance, "late result ignored");
});

Deno.test("reconciliation: an orphan at the turn cap is not advanced past 15", () => {
  const plan = planResume(session({ answer_turn_count: 15 }), messages([15, 16]), emptyFieldMap());
  assert(!plan.needsAdvance, "no sixteenth turn");
  assertEqual(plan.reason, "terminal_session", "treated as terminal");
});
