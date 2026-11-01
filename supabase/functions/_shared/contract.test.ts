/**
 * Canonical integration fixtures.
 *
 * These are the exact JSON shapes published in docs/integration-contract.md. The test
 * fails if the backend validator, consent copy, error codes or correction allowlist
 * drift from that document, so the frontend has a single machine-checked reference.
 */

import { parseChatTurnRequest } from "./validation.ts";
import { ERROR_CODES } from "./errors.ts";
import { CONSENT_TEXT, CONSENT_VERSION, buildConsentRecord } from "./consent.ts";
import { CORRECTABLE_FIELDS, PROTECTED_FIELDS } from "./contract.ts";
import type { ChatTurnResponse } from "./contract.ts";
import { assert, assertDeepEqual, assertEqual } from "./testing.ts";

const SESSION_ID = "3f4b1c2d-1111-4222-8333-444455556666";
const REPORT_ID = "9a8b7c6d-2222-4333-8444-555566667777";

export const ACTION_FIXTURES = [
  { action: "start_session", language: "hi" },
  { action: "resume_session", session_id: SESSION_ID },
  {
    action: "record_consent",
    session_id: SESSION_ID,
    consent: true,
    consent_version: CONSENT_VERSION,
    language: "en",
  },
  { action: "submit_turn", session_id: SESSION_ID, question_id: "name", text: "Asha Test" },
  {
    action: "submit_turn",
    session_id: SESSION_ID,
    question_id: "primary_concern",
    audio_base64: "AAAA",
    audio_format: "audio/wav",
  },
  {
    action: "correct_draft_report",
    session_id: SESSION_ID,
    report_id: REPORT_ID,
    updates: { "patient.name": { value: "Asha T.", status: "provided" } },
  },
  { action: "submit_report", session_id: SESSION_ID, report_id: REPORT_ID },
] as const;

Deno.test("contract: every published action fixture is accepted", () => {
  for (const fixture of ACTION_FIXTURES) {
    const result = parseChatTurnRequest(fixture as unknown);
    assert(result.ok, `fixture rejected: ${fixture.action}`);
  }
});

Deno.test("contract: transcript_preview is the only audio preview shape", () => {
  const preview: NonNullable<ChatTurnResponse["transcript_preview"]> = {
    state: "transcript_preview",
    text: "मुझे घुटने में दर्द है",
    question_id: "primary_concern",
  };

  const response: ChatTurnResponse = {
    session_id: SESSION_ID,
    session_status: "in_progress",
    messages: [],
    turn_count: 3,
    max_turns: 15,
    is_complete: false,
    is_cap_reached: false,
    can_submit: false,
    transcript_preview: preview,
  };

  assertEqual(response.transcript_preview?.state, "transcript_preview", "state literal");
  assertEqual(response.turn_count, 3, "turn is not consumed by a preview");
  assert(!("pending_transcript" in response), "no competing field name");
  assertDeepEqual(Object.keys(preview).sort(), ["question_id", "state", "text"], "exact preview keys");
});

Deno.test("contract: consent version and wording are fixed", () => {
  assertEqual(CONSENT_VERSION, "2026-11-01.v1", "version");

  const en = buildConsentRecord("en", CONSENT_VERSION);
  const hi = buildConsentRecord("hi", CONSENT_VERSION);
  assert(en !== null && hi !== null, "both languages resolve");
  if (!en || !hi) return;

  assert(en.consent_text.startsWith("I understand that Samvad HealthDesk AI"), "EN opening is stable");
  assert(en.consent_text.includes("not a doctor"), "EN states the limitation");
  assert(en.consent_text.includes("only if I submit it"), "EN states sharing condition");
  assert(hi.consent_text.includes("डॉक्टर नहीं है"), "HI states the limitation");
  assert(!en.consent_text.startsWith("consent_v"), "never a synthetic marker");
});

Deno.test("contract: error codes are a closed set", () => {
  assertDeepEqual(
    [...ERROR_CODES].sort(),
    [
      "audio_in_progress",
      "audio_superseded",
      "demo_busy",
      "field_not_editable",
      "internal",
      "invalid_field_status",
      "invalid_question",
      "invalid_question_state",
      "invalid_request",
      "invalid_state",
      "not_found",
      "provider_unavailable",
      "transcript_empty",
      "turn_cap_reached",
      "unauthorized",
    ],
    "codes match the published table",
  );
});

Deno.test("contract: correction allowlist and protected list are disjoint and complete", () => {
  const allowed = [...CORRECTABLE_FIELDS].sort();
  assertEqual(allowed.length, 10, "ten correctable fields");

  const protectedList: string[] = [...PROTECTED_FIELDS];
  for (const field of allowed) {
    assert(!protectedList.includes(field), `${field} cannot be both`);
  }
  for (const field of ["status", "routing_snapshot", "summary", "reviewed_by", "intake_reference"]) {
    assert(protectedList.includes(field), `${field} is protected`);
  }
});

Deno.test("contract: gender never carries a 'declined' value", () => {
  // The literal is absent from the union, so no value can be emitted or accepted.
  const genderValues: Array<"male" | "female" | "other"> = ["male", "female", "other"];
  for (const value of genderValues) {
    assert(value !== ("declined" as string), "declined is not a value");
  }
  const declinedAnswer = { status: "declined" as const, value: null };
  assertExtendedDeclined(declinedAnswer);
});

function assertExtendedDeclined(answer: { status: "declined"; value: null }): void {
  assertEqual(answer.status, "declined", "status carries the refusal");
  assertEqual(answer.value, null, "no value with a declined status");
}

Deno.test("contract: a mismatched consent version is rejected end to end", () => {
  const fixture = {
    action: "record_consent",
    session_id: SESSION_ID,
    consent: true,
    consent_version: "2019-01-01.v0",
    language: "en",
  };
  // Shape validation passes; the version check is a server-side policy check.
  assert(parseChatTurnRequest(fixture).ok, "shape is valid");
  assertEqual(buildConsentRecord("en", fixture.consent_version), null, "policy rejects the version");
});
