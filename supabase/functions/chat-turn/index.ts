/**
 * chat-turn — the single intake endpoint.
 *
 * Six actions only: start_session, resume_session, record_consent, submit_turn,
 * correct_draft_report, submit_report.
 *
 * Security: every action derives the user from the verified JWT, then proves ownership
 * on the elevated client before any read or write. Browser roles have no direct access
 * to sessions, consent_records, messages or reports.
 *
 * Owned by the backend. Response shape mirrors src/types/api.ts (see _shared/contract.ts).
 */

import { withSupabase } from "@supabase/server";
import type {
  ChatMessage,
  DepartmentKey,
  ChatTurnResponse,
  QuestionId,
  ReportDocumentV1,
  ReportRow,
  RoutingSnapshot,
} from "../_shared/contract.ts";
import { AppError, toErrorCode } from "../_shared/errors.ts";
import { consoleLogger } from "../_shared/logging.ts";
import { parseChatTurnRequest, type ChatTurnRequest } from "../_shared/validation.ts";
import { isUuid, requireOwnedRow } from "../_shared/auth.ts";
import { reserveUsage } from "../_shared/usage.ts";
import { getQuestion, isQuestionId } from "../_shared/questions.ts";
import {
  MAX_ANSWER_TURNS,
  applyAnswer,
  canAcceptAnswer,
  nextQuestion,
  parseAnswer,
  progress,
} from "../_shared/conversation.ts";
import {
  applyCorrections,
  buildReportDocument,
  emptyFieldMap,
  fieldsFromDocument,
  generateIntakeReference,
  isComplete,
  templateSummary,
  type FieldMap,
} from "../_shared/report.ts";
import { classifyAnswer, resolveClarification } from "../_shared/safety.ts";
import { buildConsentRecord } from "../_shared/consent.ts";
import { planResume } from "../_shared/reconciliation.ts";
import { resolveEmergencyRouting, resolveRouting, type DepartmentRecord, type DoctorRecord } from "../_shared/routing.ts";
import { suggestDepartment } from "../_shared/groq-routing.ts";
import { transcribe } from "../_shared/prisma.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

interface SessionRow {
  id: string;
  user_id: string;
  language: "en" | "hi";
  status: string;
  answer_turn_count: number;
  current_question_id: string | null;
  pending_clarification_rule_id: string | null;
  pending_transcript_text: string | null;
  pending_transcript_question_id: string | null;
  pending_transcript_expected_turn: number | null;
  pending_transcript_expires_at: string | null;
  clarification_answer: string | null;
  needs_human_review: boolean;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: "assistant" | "patient";
  question_id: string | null;
  final_text: string | null;
  turn_index: number | null;
  created_at: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: ChatTurnResponse | { error: string }, status = 200): Response {
  return Response.json(payload, { status, headers: CORS_HEADERS });
}

async function loadSession(admin: Admin, sessionId: string, userId: string): Promise<SessionRow> {
  const { data } = await admin
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return requireOwnedRow(data as SessionRow | null, userId);
}

async function loadMessages(admin: Admin, sessionId: string): Promise<MessageRow[]> {
  const { data } = await admin
    .from("messages")
    .select("id, session_id, role, question_id, final_text, turn_index, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as MessageRow[];
}

/** Replays stored patient answers into a field map. Deterministic, no extra state. */
function rebuildFields(messages: MessageRow[]): FieldMap {
  let fields = emptyFieldMap();
  for (const message of messages) {
    if (message.role !== "patient" || !message.question_id || !message.final_text) continue;
    if (!isQuestionId(message.question_id)) continue;
    const parsed = parseAnswer(message.question_id, message.final_text);
    if (parsed) fields = applyAnswer(fields, parsed);
  }
  return fields;
}

interface ReferenceData {
  departments: DepartmentRecord[];
  doctors: DoctorRecord[];
}

async function loadReferenceData(admin: Admin): Promise<ReferenceData> {
  const { data: departments } = await admin
    .from("departments")
    .select("key, name, booking_enabled, is_emergency")
    .order("display_order", { ascending: true });
  const { data: doctors } = await admin
    .from("doctors")
    .select("id, display_name, department_key");
  return {
    departments: (departments ?? []) as DepartmentRecord[],
    doctors: (doctors ?? []) as DoctorRecord[],
  };
}

async function resolveDraftRouting(
  admin: Admin,
  session: SessionRow,
  fields: FieldMap,
): Promise<{ routing: RoutingSnapshot; source: "model" | "fallback" }> {
  const reference = await loadReferenceData(admin);

  let candidate: string | null = null;
  const apiKey = Deno.env.get("GROQ_API_KEY") ?? "";
  const concern = fields.primary_concern;
  if (apiKey && concern.status === "provided" && typeof concern.value === "string") {
    const reservation = await reserveUsage(admin, "groq");
    if (reservation.allowed) {
      candidate = await suggestDepartment(
        { apiKey, baseUrl: Deno.env.get("GROQ_BASE_URL") ?? undefined },
        concern.value,
      );
      consoleLogger.info("provider_attempt", { provider: "groq", ok: candidate !== null });
    } else {
      consoleLogger.info("usage_capped", { counter: "groq" });
    }
  }

  const resolved = resolveRouting(candidate, reference.departments, reference.doctors);
  consoleLogger.info("action_completed", {
    action: "route_department",
    source: resolved.source,
    reason: resolved.reason,
  });
  return { routing: resolved.routing, source: resolved.source };
}

async function emergencyRouting(admin: Admin): Promise<RoutingSnapshot> {
  const reference = await loadReferenceData(admin);
  return resolveEmergencyRouting(reference.departments, reference.doctors);
}

function mapMessages(rows: MessageRow[]): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    session_id: row.session_id,
    role: row.role,
    content: row.final_text ?? "",
    question_id: (row.question_id ?? undefined) as QuestionId | undefined,
    created_at: row.created_at,
    turn_index: row.turn_index ?? 0,
  }));
}

function currentQuestionFor(session: SessionRow): ChatTurnResponse["current_question"] | undefined {
  const id = session.current_question_id;
  if (!id || !isQuestionId(id)) return undefined;
  const question = getQuestion(id);
  return {
    id,
    text: question.en,
    text_hi: question.hi,
    options: question.options?.map((option) => option.label),
    is_ambiguous_emergency: id === "emergency_clarification",
  };
}

function baseResponse(session: SessionRow, messages: MessageRow[]): ChatTurnResponse {
  const fields = rebuildFields(messages);
  const state = progress({
    fields,
    answerTurnCount: session.answer_turn_count,
    status: session.status,
  });

  return {
    session_id: session.id,
    session_status: session.status as ChatTurnResponse["session_status"],
    current_question: currentQuestionFor(session),
    messages: mapMessages(messages),
    turn_count: session.answer_turn_count,
    max_turns: MAX_ANSWER_TURNS,
    is_complete: state.is_complete,
    is_cap_reached: state.is_cap_reached,
    can_submit: state.can_submit,
  };
}

async function ensureDraftReport(
  admin: Admin,
  session: SessionRow,
  fields: FieldMap,
): Promise<ReportDocumentV1 | null> {
  const { data: existing } = await admin
    .from("reports")
    .select("report")
    .eq("session_id", session.id)
    .maybeSingle();
  if (existing) return existing.report as ReportDocumentV1;

  if (!isComplete(fields)) return null;

  const { routing } = await resolveDraftRouting(admin, session, fields);
  const document = buildReportDocument({
    language: session.language,
    fields,
    routing,
    status: "draft",
    summary: templateSummary(fields),
  });

  const { data: inserted } = await admin
    .from("reports")
    .insert({
      session_id: session.id,
      user_id: session.user_id,
      status: "draft",
      schema_version: 1,
      department_key: routing.department_key,
      doctor_id: routing.doctor_id,
      intake_reference: generateIntakeReference(new Date()),
      needs_human_review: session.needs_human_review,
      report: document,
    })
    .select("report")
    .maybeSingle();

  return (inserted?.report as ReportDocumentV1) ?? document;
}

async function createEmergencyReport(
  admin: Admin,
  session: SessionRow,
  fields: FieldMap,
  ruleId: string,
  statement: string,
): Promise<void> {
  const routing = await emergencyRouting(admin);
  const document = buildReportDocument({
    language: session.language,
    fields,
    routing,
    status: "urgent_partial",
    emergency: {
      rule_id: ruleId,
      patient_statement: statement.slice(0, 500),
      triggered_at: new Date().toISOString(),
    },
  });

  await admin
    .from("reports")
    .upsert(
      {
        session_id: session.id,
        user_id: session.user_id,
        status: "urgent_partial",
        schema_version: 1,
        department_key: "emergency",
        doctor_id: routing.doctor_id,
        intake_reference: generateIntakeReference(new Date()),
        emergency_rule_id: ruleId,
        possible_urgent: false,
        // OD-09: never clear an existing review flag. Conservative until the owner rules.
        needs_human_review: session.needs_human_review === true,
        report: document,
      },
      { onConflict: "session_id", ignoreDuplicates: true },
    );

  await admin
    .from("sessions")
    .update({ status: "emergency", ended_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("user_id", session.user_id);
}

async function handleStartSession(admin: Admin, userId: string, language: "en" | "hi"): Promise<Response> {
  const reservation = await reserveUsage(admin, "sessions");
  if (!reservation.allowed) {
    consoleLogger.info("usage_capped", { counter: "sessions" });
    return json({
      session_id: "",
      session_status: "created",
      messages: [],
      turn_count: 0,
      max_turns: MAX_ANSWER_TURNS,
      is_complete: false,
      is_cap_reached: false,
      can_submit: false,
      demo_busy: true,
      error: "demo_busy",
    });
  }

  const { data, error } = await admin
    .from("sessions")
    .insert({ user_id: userId, language, status: "created", current_question_id: "name" })
    .select("*")
    .maybeSingle();

  if (error || !data) throw new AppError("internal");
  return json(baseResponse(data as SessionRow, []));
}

async function handleResume(admin: Admin, userId: string, sessionId: string): Promise<Response> {
  let session = await loadSession(admin, sessionId, userId);
  let messages = await loadMessages(admin, sessionId);

  // Repair a message-first acceptance whose session advance was interrupted, and drop
  // transient audio state. The repair uses scripted selection only, so no provider call
  // can happen during a resume.
  const fieldsForPlan = rebuildFields(messages);
  const plan = planResume(session, messages, fieldsForPlan);

  if (plan.needsAdvance) {
    const { data: advanced } = await admin
      .from("sessions")
      .update({
        answer_turn_count: plan.orphanTurn,
        current_question_id: plan.nextQuestionId,
      pending_transcript_text: null,
      pending_transcript_language: null,
      pending_transcript_question_id: null,
      pending_transcript_expected_turn: null,
      pending_transcript_created_at: null,
      pending_transcript_expires_at: null,
      })
      .eq("id", session.id)
      .eq("user_id", userId)
      .eq("answer_turn_count", session.answer_turn_count)
      .select("*")
      .maybeSingle();
    if (advanced) {
      session = advanced as SessionRow;
      messages = await loadMessages(admin, sessionId);
      consoleLogger.info("action_completed", { action: "resume_reconciled" });
    }
  } else if (plan.clearPendingTranscript) {
    await admin
      .from("sessions")
      .update({
      pending_transcript_text: null,
      pending_transcript_language: null,
      pending_transcript_question_id: null,
      pending_transcript_expected_turn: null,
      pending_transcript_created_at: null,
      pending_transcript_expires_at: null,
      })
      .eq("id", session.id)
      .eq("user_id", userId);
    session = await loadSession(admin, sessionId, userId);
  }

  const response = baseResponse(session, messages);

  const { data: report } = await admin
    .from("reports")
    .select("report, status")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (report?.status === "draft" || report?.status === "urgent_partial" || report?.status === "submitted") {
    response.draft_report = report.report as ReportDocumentV1;
    response.can_submit = report.status === "draft";
  }
  if (report?.status === "urgent_partial") response.emergency_triggered = true;

  return json(response);
}

async function handleConsent(
  admin: Admin,
  userId: string,
  request: { session_id: string; consent: boolean; consent_version: string; language: "en" | "hi" },
): Promise<Response> {
  const session = await loadSession(admin, request.session_id, userId);
  if (session.status !== "created") throw new AppError("invalid_state");

  const decision = request.consent ? "yes" : "no";
  const consentCopy = buildConsentRecord(request.language, request.consent_version);
  if (!consentCopy) {
    // The patient saw a different wording than the server can attest to.
    throw new AppError("invalid_request");
  }

  await admin.from("consent_records").insert({
    session_id: session.id,
    user_id: userId,
    decision,
    consent_text: consentCopy.consent_text,
    consent_version: consentCopy.consent_version,
    language: consentCopy.language,
  });

  const nextStatus = request.consent ? "consented" : "declined";
  const { data: updated } = await admin
    .from("sessions")
    .update({
      status: nextStatus,
      current_question_id: request.consent ? "name" : null,
      ended_at: request.consent ? null : new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (!updated) throw new AppError("invalid_state");
  const messages = await loadMessages(admin, session.id);
  return json(baseResponse(updated as SessionRow, messages));
}

async function handleSubmitTurn(
  admin: Admin,
  userId: string,
  request: {
    session_id: string;
    question_id: QuestionId;
    text?: string;
    audio_base64?: string;
    audio_format?: string;
  },
): Promise<Response> {
  const session = await loadSession(admin, request.session_id, userId);
  if (!canAcceptAnswer(session.answer_turn_count, session.status)) {
    return json({ ...baseResponse(session, await loadMessages(admin, session.id)), error: "turn_cap_reached" });
  }

  // ---- Audio phase: transcribe only. No turn is accepted until the patient confirms. ----
  if (request.audio_base64) {
    const apiKey = Deno.env.get("GNANI_API_KEY") ?? "";
    const reservation = await reserveUsage(admin, "prisma");
    if (!reservation.allowed || !apiKey) {
      const response = baseResponse(session, await loadMessages(admin, session.id));
      response.error = "provider_unavailable";
      return json(response);
    }

    const bytes = Uint8Array.from(atob(request.audio_base64), (char) => char.charCodeAt(0));
    const result = await transcribe(
      { apiKey, baseUrl: Deno.env.get("PRISMA_BASE_URL") ?? undefined },
      {
        audio: bytes,
        mimeType: request.audio_format ?? "audio/wav",
        language: session.language === "hi" ? "hi-IN" : "en-IN",
      },
    );
    consoleLogger.info("provider_attempt", { provider: "prisma", ok: result.ok });

    if (!result.ok) {
      const response = baseResponse(session, await loadMessages(admin, session.id));
      response.error = result.kind === "unsupported_format" ? "invalid_request" : "provider_unavailable";
      return json(response);
    }
    if (result.transcript.trim().length === 0) {
      const response = baseResponse(session, await loadMessages(admin, session.id));
      response.error = "transcript_empty";
      return json(response);
    }

    await admin
      .from("sessions")
      .update({
        pending_transcript_text: result.transcript.slice(0, 2000),
        pending_transcript_language: session.language,
        pending_transcript_question_id: request.question_id,
        pending_transcript_expected_turn: session.answer_turn_count + 1,
        pending_transcript_created_at: new Date().toISOString(),
        pending_transcript_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .eq("id", session.id)
      .eq("user_id", userId);

    const response = baseResponse(session, await loadMessages(admin, session.id));
    response.transcript_preview = {
      state: "transcript_preview",
      text: result.transcript,
      question_id: request.question_id,
    };
    return json(response);
  }

  // ---- Text phase ----
  const text = (request.text ?? "").trim();
  if (!text || !canAcceptAnswer(session.answer_turn_count, session.status)) {
    throw new AppError("invalid_request");
  }
  if (session.current_question_id !== request.question_id) {
    const response = baseResponse(session, await loadMessages(admin, session.id));
    response.error = "invalid_question_state";
    return json(response, 409);
  }

  const messages = await loadMessages(admin, session.id);
  let fields = rebuildFields(messages);

  // Clarification answer for an ambiguous emergency statement.
  if (request.question_id === "emergency_clarification" && session.pending_clarification_rule_id) {
    const resolution = resolveClarification(text);
    const lastPatientText = [...messages].reverse().find((message) => message.role === "patient")?.final_text ?? text;
    if (resolution === "yes") {
      await createEmergencyReport(admin, session, fields, session.pending_clarification_rule_id, lastPatientText);
      const updated = await loadSession(admin, session.id, userId);
      const response = baseResponse(updated, await loadMessages(admin, session.id));
      response.emergency_triggered = true;
      return json(response);
    }
    if (resolution === "unresolved") {
      // Neither confirmed nor negated. Keep the evidence, keep asking, and never
      // describe the patient as safe. OD-02 (does a clarification consume a turn) is
      // unresolved, so no turn is counted and the question stays current.
      await admin
        .from("sessions")
        .update({
          needs_human_review: true,
          clarification_answer: text.slice(0, 1000),
          clarification_answered_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .eq("user_id", userId);
      const updated = await loadSession(admin, session.id, userId);
      return json(baseResponse(updated, messages));
    }
    // "No" negates only that candidate. Intake continues; the flag is not a clearance.
    await admin
      .from("sessions")
      .update({
        pending_clarification_rule_id: null,
        clarification_answer: text.slice(0, 1000),
        clarification_answered_at: new Date().toISOString(),
        current_question_id: nextQuestion(fields) ?? null,
      })
      .eq("id", session.id)
      .eq("user_id", userId);
    const updated = await loadSession(admin, session.id, userId);
    return json(baseResponse(updated, messages));
  }

  // Deterministic emergency evaluation on the patient-confirmed text only.
  const match = classifyAnswer(text);
  if (match.kind === "clear") {
    await createEmergencyReport(admin, session, fields, match.ruleId, text);
    const updated = await loadSession(admin, session.id, userId);
    const response = baseResponse(updated, await loadMessages(admin, session.id));
    const { data: urgentReport } = await admin
      .from("reports")
      .select("report")
      .eq("session_id", session.id)
      .maybeSingle();
    if (urgentReport?.report) response.draft_report = urgentReport.report as ReportDocumentV1;
    response.emergency_triggered = true;
    response.can_submit = false;
    return json(response);
  }
  if (match.kind === "ambiguous") {
    // The patient's statement is stored first: it is evidence for the doctor and must
    // never be discarded when intake pauses for the clarification.
    const nextTurn = session.answer_turn_count + 1;
    const { error: insertError } = await admin.from("messages").insert({
      session_id: session.id,
      role: "patient",
      question_id: request.question_id,
      turn_index: nextTurn,
      original_text: null,
      final_text: text,
      input_mode: "text",
    });

    if (insertError) {
      const current = await loadSession(admin, session.id, userId);
      return json(baseResponse(current, await loadMessages(admin, session.id)));
    }

    await admin
      .from("sessions")
      .update({
        answer_turn_count: nextTurn,
        pending_clarification_rule_id: match.ruleIds[0],
        current_question_id: "emergency_clarification",
      pending_transcript_text: null,
      pending_transcript_language: null,
      pending_transcript_question_id: null,
      pending_transcript_expected_turn: null,
      pending_transcript_created_at: null,
      pending_transcript_expires_at: null,
      })
      .eq("id", session.id)
      .eq("user_id", userId)
      .eq("answer_turn_count", session.answer_turn_count);

    const updated = await loadSession(admin, session.id, userId);
    return json(baseResponse(updated, await loadMessages(admin, session.id)));
  }

  // Normal answer.
  const parsed = parseAnswer(request.question_id, text);
  if (parsed) fields = applyAnswer(fields, parsed);

  const nextTurn = session.answer_turn_count + 1;
  const originalText =
    session.pending_transcript_question_id === request.question_id &&
      session.pending_transcript_expected_turn === nextTurn
      ? session.pending_transcript_text
      : null;

  const { error: insertError } = await admin.from("messages").insert({
    session_id: session.id,
    role: "patient",
    question_id: request.question_id,
    turn_index: nextTurn,
    original_text: originalText,
    final_text: text,
    input_mode: originalText ? "voice" : "text",
  });

  if (insertError) {
    // Unique (session_id, turn_index): a duplicate submission.
    const current = await loadSession(admin, session.id, userId);
    const response = baseResponse(current, await loadMessages(admin, session.id));
    return json(response);
  }

  const nextId = nextQuestion(fields, { afterFixed: request.question_id });
  const { data: advanced } = await admin
    .from("sessions")
    .update({
      answer_turn_count: nextTurn,
      current_question_id: nextId,
      pending_transcript_text: null,
      pending_transcript_language: null,
      pending_transcript_question_id: null,
      pending_transcript_expected_turn: null,
      pending_transcript_created_at: null,
      pending_transcript_expires_at: null,
      status: "in_progress",
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .eq("answer_turn_count", session.answer_turn_count)
    .select("*")
    .maybeSingle();

  const updated = (advanced as SessionRow | null) ?? (await loadSession(admin, session.id, userId));
  const response = baseResponse(updated, await loadMessages(admin, session.id));

  if (isComplete(fields)) {
    const document = await ensureDraftReport(admin, updated, fields);
    if (document) {
      response.draft_report = document;
      response.can_submit = true;
    }
  }
  return json(response);
}

async function handleCorrectDraft(
  admin: Admin,
  userId: string,
  request: { session_id: string; report_id: string; updates: Record<string, { value: unknown; status: string }> },
): Promise<Response> {
  const session = await loadSession(admin, request.session_id, userId);
  const { data: report } = await admin
    .from("reports")
    .select("id, user_id, status, report")
    .eq("id", request.report_id)
    .eq("session_id", session.id)
    .maybeSingle();

  const owned = requireOwnedRow(report as { user_id: string } | null, userId);
  const row = owned as unknown as { status: string; report: ReportDocumentV1 };
  if (row.status !== "draft") throw new AppError("invalid_state");

  const current = fieldsFromDocument(row.report);
  const result = applyCorrections(current, request.updates as never);
  if (!result.ok || !result.fields) throw new AppError(result.code ?? "invalid_request");

  const routing = row.report.routing_snapshot;
  const document = buildReportDocument({
    language: session.language,
    fields: result.fields,
    routing,
    status: "draft",
    summary: templateSummary(result.fields),
  });

  await admin
    .from("reports")
    .update({ report: document })
    .eq("id", request.report_id)
    .eq("user_id", userId)
    .eq("status", "draft");

  const response = baseResponse(session, await loadMessages(admin, session.id));
  response.draft_report = document;
  response.can_submit = isComplete(result.fields);
  return json(response);
}

async function handleSubmitReport(
  admin: Admin,
  userId: string,
  request: { session_id: string; report_id: string },
): Promise<Response> {
  const session = await loadSession(admin, request.session_id, userId);
  const messages = await loadMessages(admin, session.id);
  const fields = rebuildFields(messages);
  if (!isComplete(fields)) throw new AppError("invalid_state");
  if (session.status === "emergency") throw new AppError("invalid_state");

  const { data: submitted } = await admin
    .from("reports")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", request.report_id)
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();

  if (!submitted) throw new AppError("invalid_state");

  await admin
    .from("sessions")
    .update({ status: "submitted", ended_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("user_id", userId);

  const response = baseResponse(await loadSession(admin, session.id, userId), messages);
  response.submitted_report = submitted as ReportRow;
  response.can_submit = false;
  return json(response);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS_HEADERS });

    const userId = ctx.userClaims?.id;
    if (!isUuid(userId)) return json({ error: "unauthorized" }, 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const parsed = parseChatTurnRequest(body);
    if (!parsed.ok) return json({ error: parsed.code }, 400);

    const admin = ctx.supabaseAdmin as Admin;
    const request = parsed.value as ChatTurnRequest;

    try {
      switch (request.action) {
        case "start_session":
          return await handleStartSession(admin, userId, request.language ?? "en");
        case "resume_session":
          return await handleResume(admin, userId, request.session_id);
        case "record_consent":
          return await handleConsent(admin, userId, request);
        case "submit_turn":
          return await handleSubmitTurn(admin, userId, request);
        case "correct_draft_report":
          return await handleCorrectDraft(admin, userId, request);
        case "submit_report":
          return await handleSubmitReport(admin, userId, request);
      }
    } catch (error) {
      const code = toErrorCode(error);
      consoleLogger.error("action_rejected", { action: request.action, code });
      const status = code === "not_found"
        ? 404
        : code === "invalid_state" || code === "invalid_question_state"
        ? 409
        : code === "invalid_request" || code === "field_not_editable" || code === "invalid_field_status"
        ? 400
        : 500;
      return json({ error: code }, status);
    }
  }),
};
