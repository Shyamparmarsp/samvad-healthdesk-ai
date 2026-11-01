import { parseChatTurnRequest } from "./validation.ts";
import { reserveUsage } from "./usage.ts";
import { sanitizeFields } from "./logging.ts";
import { isUuid, requireOwnedRow, requireUserId, OwnershipError } from "./auth.ts";
import { assert, assertEqual, assertRejects } from "./testing.ts";

const SESSION_ID = "3f4b1c2d-1111-4222-8333-444455556666";
const REPORT_ID = "9a8b7c6d-2222-4333-8444-555566667777";

Deno.test("validation: all six actions parse", () => {
  assert(parseChatTurnRequest({ action: "start_session", language: "hi" }).ok, "start_session");
  assert(parseChatTurnRequest({ action: "resume_session", session_id: SESSION_ID }).ok, "resume_session");
  assert(
    parseChatTurnRequest({ action: "record_consent", session_id: SESSION_ID, consent: true, consent_version: "v1", language: "en" }).ok,
    "record_consent",
  );
  assert(
    parseChatTurnRequest({ action: "submit_turn", session_id: SESSION_ID, question_id: "name", text: "Asha" }).ok,
    "submit_turn text",
  );
  assert(
    parseChatTurnRequest({
      action: "correct_draft_report",
      session_id: SESSION_ID,
      report_id: REPORT_ID,
      updates: { "patient.name": { value: "Asha", status: "provided" } },
    }).ok,
    "correct_draft_report",
  );
  assert(
    parseChatTurnRequest({ action: "submit_report", session_id: SESSION_ID, report_id: REPORT_ID }).ok,
    "submit_report",
  );
});

Deno.test("validation: unknown actions and extra keys are rejected", () => {
  assert(!parseChatTurnRequest({ action: "delete_session", session_id: SESSION_ID }).ok, "unknown action");
  assert(!parseChatTurnRequest({ action: "submit_report", session_id: SESSION_ID, report_id: REPORT_ID, status: "submitted" }).ok, "smuggled field");
  assert(!parseChatTurnRequest({ action: "resume_session", session_id: "not-a-uuid" }).ok, "bad uuid");
  assert(!parseChatTurnRequest(null).ok, "null body");
});

Deno.test("validation: submit_turn requires exactly one input", () => {
  const base = { action: "submit_turn", session_id: SESSION_ID, question_id: "name" };
  assert(!parseChatTurnRequest(base).ok, "neither input");
  assert(!parseChatTurnRequest({ ...base, text: "a", audio_base64: "b", audio_format: "audio/wav" }).ok, "both inputs");
  assert(!parseChatTurnRequest({ ...base, text: "   " }).ok, "blank text");
});

Deno.test("validation: webm audio is rejected before any provider call", () => {
  const result = parseChatTurnRequest({
    action: "submit_turn",
    session_id: SESSION_ID,
    question_id: "name",
    audio_base64: "AAAA",
    audio_format: "audio/webm",
  });
  assert(!result.ok, "webm rejected");
  if (!result.ok) assertEqual(result.code, "invalid_request", "code");
});

Deno.test("validation: oversized audio is rejected", () => {
  const result = parseChatTurnRequest({
    action: "submit_turn",
    session_id: SESSION_ID,
    question_id: "name",
    audio_base64: "A".repeat(2_000_001),
    audio_format: "audio/wav",
  });
  assert(!result.ok, "too large");
});

Deno.test("validation: unknown question ids are rejected", () => {
  const result = parseChatTurnRequest({
    action: "submit_turn",
    session_id: SESSION_ID,
    question_id: "favourite_colour",
    text: "blue",
  });
  assert(!result.ok, "unknown question");
});

Deno.test("validation: correction updates must be an object with at least one entry", () => {
  assert(
    !parseChatTurnRequest({ action: "correct_draft_report", session_id: SESSION_ID, report_id: REPORT_ID, updates: {} }).ok,
    "empty updates",
  );
  assert(
    !parseChatTurnRequest({ action: "correct_draft_report", session_id: SESSION_ID, report_id: REPORT_ID, updates: "name" }).ok,
    "non-object updates",
  );
});

Deno.test("usage: an allowed reservation reports remaining capacity", async () => {
  const client = {
    rpc: () => Promise.resolve({ data: [{ allowed: true, used: 5, daily_limit: 100 }], error: null }),
  };
  const result = await reserveUsage(client, "groq");
  assert(result.allowed, "allowed");
  if (result.allowed) assertEqual(result.used, 5, "used");
});

Deno.test("usage: a capped reservation is reported as not allowed", async () => {
  const client = {
    rpc: () => Promise.resolve({ data: { allowed: false, used: 100, daily_limit: 100 }, error: null }),
  };
  const result = await reserveUsage(client, "sessions");
  assert(!result.allowed, "capped");
  if (!result.allowed && "limit" in result) assertEqual(result.limit, 100, "limit");
});

Deno.test("usage: RPC or transport failure is never treated as permission", async () => {
  const failing = await reserveUsage({ rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }) }, "prisma");
  assert(!failing.allowed, "error is not allowed");
  assert("failed" in failing && failing.failed, "marked failed");

  const throwing = await reserveUsage({ rpc: () => Promise.reject(new Error("network")) }, "timbre");
  assert(!throwing.allowed, "throw is not allowed");
  assert("failed" in throwing && throwing.failed, "marked failed");

  const empty = await reserveUsage({ rpc: () => Promise.resolve({ data: [], error: null }) }, "groq");
  assert(!empty.allowed, "empty result is not allowed");
});

Deno.test("logging: forbidden keys and long values never reach the log line", () => {
  const safe = sanitizeFields({
    session_id: SESSION_ID,
    counter: "prisma",
    allowed: true,
    transcript: "patient said something private",
    answer_text: "private",
    authorization: "Bearer secret",
    note: "x".repeat(200),
  });
  assertEqual(safe.transcript, undefined, "transcript removed");
  assertEqual(safe.answer_text, undefined, "answer removed");
  assertEqual(safe.authorization, undefined, "auth removed");
  assertEqual(safe.session_id, SESSION_ID, "safe id kept");
  assertEqual(safe.allowed, true, "boolean kept");
  assert(typeof safe.note === "string" && (safe.note as string).length === 64, "truncated");
});

Deno.test("auth: ownership checks reject foreign and missing rows", () => {
  const row = { user_id: SESSION_ID };
  assertEqual(requireOwnedRow(row, SESSION_ID).user_id, SESSION_ID, "owner passes");
  assert(!isUuid("nope"), "uuid rejected");
  assert(isUuid(SESSION_ID), "uuid accepted");
  assertEqual(requireUserId(SESSION_ID), SESSION_ID, "user id accepted");
});

Deno.test("auth: foreign rows and bad identities throw not_found", async () => {
  await assertRejects(() => Promise.resolve().then(() => requireOwnedRow({ user_id: REPORT_ID }, SESSION_ID)), "foreign row");
  await assertRejects(() => Promise.resolve().then(() => requireOwnedRow(null, SESSION_ID)), "missing row");
  await assertRejects(() => Promise.resolve().then(() => requireUserId("")), "empty uid");
  try {
    requireOwnedRow(null, SESSION_ID);
  } catch (error) {
    assert(error instanceof OwnershipError, "typed error");
  }
});
