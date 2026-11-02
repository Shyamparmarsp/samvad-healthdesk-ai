/**
 * Emergency-flow certification harness — Samvad HealthDesk AI.
 *
 * READ-ONLY with respect to application code. It proves the documented emergency
 * contract on a DISPOSABLE LOCAL stack, records a PASS/FAIL matrix and writes
 * `emergency-certification-result.json`.
 *
 *   LOCAL_URL=http://127.0.0.1:54321 \
 *   LOCAL_ANON_KEY=... LOCAL_SERVICE_KEY=... LOCAL_JWT_SECRET=... \
 *   deno run --allow-net --allow-env --allow-read --allow-write \
 *     supabase/tests/emergency-certification.ts
 *
 * The doctor-API section needs LOCAL_JWT_SECRET (the local stack's JWT secret) so it
 * can mint a short-lived token for the mapped demo/test doctors. Without it those cases
 * are reported as NOT TESTED, never as PASS. Authorization is also covered independently
 * by supabase/tests/emergency_authorization.sql.
 *
 * Safety:
 *   - refuses any non-local target;
 *   - creates only its own throwaway anonymous identities and deletes only those;
 *   - never resets a usage counter and never edits reference data or policies;
 *   - logs rule ids, booleans and counts, never a patient statement.
 *
 * Exits 1 when any case FAILs, so it is a release gate, not just a report.
 */

import {
  EMERGENCY_RULES,
  classifyAnswer,
  resolveClarification,
} from "../functions/_shared/safety.ts";
import { MAX_ANSWER_TURNS } from "../functions/_shared/conversation.ts";
import { MAX_ADAPTIVE_QUESTIONS } from "../functions/_shared/intake/select.ts";
import { REPORT_SCHEMA_VERSION } from "../functions/_shared/report.ts";

const BASE = Deno.env.get("LOCAL_URL") ?? "http://127.0.0.1:54321";
const ANON = Deno.env.get("LOCAL_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("LOCAL_SERVICE_KEY") ?? "";
const JWT_SECRET = Deno.env.get("LOCAL_JWT_SECRET") ?? "";
const CONSENT_VERSION = "2026-11-01.v1";

const host = (() => {
  try {
    return new URL(BASE).hostname;
  } catch {
    return "";
  }
})();
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`REFUSED: ${BASE} is not a local stack. This harness is local-only.`);
  Deno.exit(2);
}

type Verdict = "PASS" | "FAIL" | "NOT TESTED";
type Severity = "low" | "medium" | "high" | "critical";

interface CaseResult {
  id: string;
  category: string;
  requirement: string;
  expected: string;
  actual: string;
  verdict: Verdict;
  severity?: Severity;
  note?: string;
  input?: string;
}

const cases: CaseResult[] = [];
const notes: string[] = [];

function record(
  id: string,
  category: string,
  requirement: string,
  expected: string,
  actual: string,
  verdict: Verdict,
  options: { severity?: Severity; note?: string; input?: string } = {},
): void {
  cases.push({
    id,
    category,
    requirement,
    expected,
    actual,
    verdict,
    ...(options.severity ? { severity: options.severity } : {}),
    ...(options.note ? { note: options.note } : {}),
    ...(options.input ? { input: options.input } : {}),
  });
  const mark = verdict === "PASS" ? "PASS" : verdict === "FAIL" ? "FAIL" : "SKIP";
  console.log(`${mark} ${id} — ${requirement}`);
}

/* -------------------------------------------------------------------------- */
/* Matcher matrix (offline)                                                    */
/* -------------------------------------------------------------------------- */

function matcherMatrix(): void {
  const category = "1. Emergency detection";

  for (const rule of EMERGENCY_RULES) {
    rule.clear.forEach((phrase, index) => {
      const match = classifyAnswer(phrase);
      record(
        `M-CLEAR-EN-${rule.id}-${index + 1}`,
        category,
        `English clear phrase triggers ${rule.id}`,
        `clear / ${rule.id}`,
        `${match.kind}${match.kind === "clear" ? ` / ${match.ruleId}` : ""}`,
        match.kind === "clear" ? "PASS" : "FAIL",
        { input: phrase, severity: "high" },
      );
    });

    rule.clearHi.forEach((phrase, index) => {
      const match = classifyAnswer(phrase);
      record(
        `M-CLEAR-HI-${rule.id}-${index + 1}`,
        category,
        `Hindi clear phrase triggers ${rule.id}`,
        `clear / ${rule.id}`,
        `${match.kind}${match.kind === "clear" ? ` / ${match.ruleId}` : ""}`,
        match.kind === "clear" ? "PASS" : "FAIL",
        { input: phrase, severity: "high" },
      );
    });

    [...rule.ambiguous, ...rule.ambiguousHi].forEach((phrase, index) => {
      const match = classifyAnswer(phrase);
      const ok = match.kind === "ambiguous" && match.ruleIds.includes(rule.id);
      record(
        `M-AMB-${rule.id}-${index + 1}`,
        category,
        `Ambiguous phrase requests clarification for ${rule.id}`,
        `ambiguous including ${rule.id}`,
        `${match.kind}${match.kind === "ambiguous" ? ` / ${match.ruleIds.join(",")}` : ""}`,
        ok ? "PASS" : "FAIL",
        { input: phrase, severity: "high" },
      );
    });

    rule.romanized.forEach((phrase, index) => {
      const off = classifyAnswer(phrase);
      const on = classifyAnswer(phrase, { includeRomanized: true });
      const ok = off.kind === "none" && on.kind === "clear";
      record(
        `M-ROM-${rule.id}-${index + 1}`,
        category,
        `Romanised variant is opt-in (Tier C) for ${rule.id}`,
        "none when disabled; clear when enabled",
        `disabled=${off.kind}; enabled=${on.kind}${on.kind === "clear" ? `/${on.ruleId}` : ""}`,
        ok ? "PASS" : "FAIL",
        { input: phrase, severity: "medium" },
      );
    });
  }

  // Negative controls: ordinary statements must remain ordinary.
  const ordinary: Array<[string, string]> = [
    ["NEG-01", "my knee hurts when I walk"],
    ["NEG-02", "I have a mild cough"],
    ["NEG-03", "I feel tired and have a headache"],
    ["NEG-04", "routine check-up"],
    ["NEG-05", "मुझे घुटने में दर्द है"],
    ["NEG-06", "मुझे बुखार है"],
    ["NEG-07", "I need a blood pressure medicine refill"],
    ["NEG-08", "my skin is itchy"],
    ["NEG-09", "no fever, mild cough"],
    ["NEG-10", "I have had a rash since yesterday"],
  ];
  for (const [id, text] of ordinary) {
    const match = classifyAnswer(text);
    record(
      `M-${id}`,
      category,
      "Ordinary statement does not trigger the emergency path",
      "none",
      match.kind,
      match.kind === "none" ? "PASS" : "FAIL",
      { input: text, severity: "high" },
    );
  }

  // Negation of the trigger phrase must not trigger.
  const negated: Array<[string, string]> = [
    ["M-NEGP-01", "I do not have chest pain"],
    ["M-NEGP-02", "I don't have any chest pain"],
    ["M-NEGP-03", "no chest pain at all"],
    ["M-NEGP-04", "I never had severe chest pain"],
    ["M-NEGP-05", "I am not bleeding"],
    ["M-NEGP-06", "सीने में दर्द नहीं है"],
    ["M-NEGP-07", "मुझे सांस लेने में दिक्कत नहीं है"],
  ];
  for (const [id, text] of negated) {
    const match = classifyAnswer(text);
    record(
      id,
      category,
      "Negated mention of the trigger phrase does not trigger",
      "none",
      match.kind,
      match.kind === "none" ? "PASS" : "FAIL",
      { input: text, severity: "high" },
    );
  }

  // Case / whitespace / punctuation / orthography.
  const variants: Array<[string, string]> = [
    ["M-NORM-01", "CANNOT BREATHE"],
    ["M-NORM-02", "   I    cannot     breathe   "],
    ["M-NORM-03", "I cannot breathe!!!"],
    ["M-NORM-04", "cannot-breathe"],
    ["M-NORM-05", "I can't breathe"],
    ["M-NORM-06", "I can’t breathe"],
    ["M-NORM-07", "SEVERE   CHEST   PAIN?"],
    ["M-NORM-08", "साँस लेने में बहुत तकलीफ़"],
  ];
  for (const [id, text] of variants) {
    const match = classifyAnswer(text);
    record(
      id,
      category,
      "Case/whitespace/punctuation/orthography variant still matches",
      "clear",
      match.kind,
      match.kind === "clear" ? "PASS" : "FAIL",
      { input: text, severity: "medium" },
    );
  }

  // Quoted examples: documented as never triggering.
  const doubleQuoted = [
    ['M-QUOTE-01', 'My friend told me to say "I cannot breathe"'],
    ['M-QUOTE-02', 'The form says "having a seizure now"'],
  ];
  for (const [id, text] of doubleQuoted) {
    const match = classifyAnswer(text);
    record(
      id,
      category,
      "Double-quoted example does not trigger",
      "none",
      match.kind,
      match.kind === "none" ? "PASS" : "FAIL",
      { input: text, severity: "medium" },
    );
  }

  const singleQuoted = [
    ["M-QUOTE-03", "The form says 'having a seizure now'"],
    ["M-QUOTE-04", "My friend told me to say 'I cannot breathe'"],
  ];
  for (const [id, text] of singleQuoted) {
    const match = classifyAnswer(text);
    record(
      id,
      category,
      "Single-quoted example does not trigger (docs/demo-emergency-rules.md rule 1)",
      "none",
      `${match.kind}${match.kind === "clear" ? ` / ${match.ruleId}` : ""}`,
      match.kind === "none" ? "PASS" : "FAIL",
      {
        input: text,
        severity: "medium",
        note: "normalizeAnswer removes apostrophes before stripQuoted runs, so a single-quoted span is never removed (DEFECT D-1).",
      },
    );
  }

  // Negation scoping: a negation elsewhere in the clause must not cancel a present mention.
  const negationScoping: Array<[string, string, string]> = [
    [
      "M-NEGSCOPE-01",
      "I cannot breathe but I have no fever",
      "clear",
    ],
    [
      "M-NEGSCOPE-02",
      "I have chest pain but no fever",
      "ambiguous",
    ],
    [
      "M-NEGSCOPE-03",
      "no chest pain, but chest pain now",
      "ambiguous or clear",
    ],
    [
      "M-NEGSCOPE-04",
      "I have severe chest pain and no fever",
      "clear",
    ],
  ];
  for (const [id, text, expected] of negationScoping) {
    const match = classifyAnswer(text);
    const ok = expected === "clear"
      ? match.kind === "clear"
      : expected === "ambiguous"
      ? match.kind === "ambiguous" || match.kind === "clear"
      : match.kind !== "none";
    record(
      id,
      category,
      "A negation of an unrelated symptom does not cancel the trigger mention",
      expected,
      `${match.kind}${match.kind === "clear" ? ` / ${match.ruleId}` : ""}`,
      ok ? "PASS" : "FAIL",
      {
        input: text,
        severity: "high",
        note: "isNegated scans 25 characters after the phrase inside the same clause, so a later 'no <other symptom>' cancels the trigger (DEFECT D-2).",
      },
    );
  }

  // Empty input, determinism, priority.
  record(
    "M-EMPTY-01",
    category,
    "Empty/whitespace answer is not a match",
    "none",
    classifyAnswer("   \n\t ").kind,
    classifyAnswer("   \n\t ").kind === "none" ? "PASS" : "FAIL",
    { severity: "low" },
  );

  const priority = classifyAnswer("I cannot breathe and I have severe chest pain");
  record(
    "M-ORDER-01",
    category,
    "Declared rule order decides the rule id when two rules match",
    "clear / breathing_emergency",
    `${priority.kind}${priority.kind === "clear" ? ` / ${priority.ruleId}` : ""}`,
    priority.kind === "clear" && priority.ruleId === "breathing_emergency" ? "PASS" : "FAIL",
    { severity: "low" },
  );

  const repeated = new Set(
    Array.from({ length: 5 }, () => JSON.stringify(classifyAnswer("some chest pain"))),
  );
  record(
    "M-DET-01",
    category,
    "Classification is deterministic across repeated calls",
    "one distinct result",
    `${repeated.size} distinct result(s)`,
    repeated.size === 1 ? "PASS" : "FAIL",
    { severity: "high" },
  );

  record(
    "M-CLAR-01",
    category,
    "Fixed clarification resolution",
    "yes / no / unresolved",
    [
      resolveClarification("yes"),
      resolveClarification("नहीं"),
      resolveClarification("maybe"),
    ].join(" / "),
    resolveClarification("yes") === "yes" &&
        resolveClarification("नहीं") === "no" &&
        resolveClarification("maybe") === "unresolved"
      ? "PASS"
      : "FAIL",
    { severity: "high" },
  );
}

/* -------------------------------------------------------------------------- */
/* HTTP helpers                                                               */
/* -------------------------------------------------------------------------- */

interface HttpResult {
  status: number;
  text: string;
  json: unknown;
}

async function http(
  path: string,
  init: { method?: string; token?: string; service?: boolean; body?: unknown } = {},
): Promise<HttpResult> {
  const key = init.service ? SERVICE : ANON;
  const bearer = init.service ? SERVICE : init.token;
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: key,
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text.length ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

async function adminUsers(): Promise<Array<{ id: string; email: string | null }>> {
  const result = await http("/auth/v1/admin/users?per_page=500", { service: true });
  const body = result.json as { users?: Array<{ id: string; email: string | null }> } | null;
  return body?.users ?? [];
}

async function createPatient(): Promise<{ id: string; token: string }> {
  const result = await http("/auth/v1/signup", { method: "POST", body: {} });
  const body = result.json as { user?: { id: string }; access_token?: string } | null;
  if (!body?.user?.id || !body.access_token) {
    throw new Error(`anonymous signup failed: ${result.status}`);
  }
  return { id: body.user.id, token: body.access_token };
}

async function deletePatient(id: string): Promise<void> {
  await http(`/auth/v1/admin/users/${id}`, { method: "DELETE", service: true });
}

async function chatTurn(token: string, body: Record<string, unknown>): Promise<HttpResult> {
  return await http("/functions/v1/chat-turn", { method: "POST", token, body });
}

interface ChatBody {
  session_id?: string;
  session_status?: string;
  current_question?: { id?: string; options?: string[]; is_ambiguous_emergency?: boolean } | null;
  messages?: Array<{ role: string; question_id?: string | null; content: string }>;
  turn_count?: number;
  max_turns?: number;
  is_complete?: boolean;
  is_cap_reached?: boolean;
  can_submit?: boolean;
  draft_report?: Record<string, unknown> | null;
  submitted_report?: Record<string, unknown> | null;
  emergency_triggered?: boolean;
  demo_busy?: boolean;
  error?: string;
}

function body(result: HttpResult): ChatBody {
  return (result.json ?? {}) as ChatBody;
}

async function startConsented(language: "en" | "hi"): Promise<{
  id: string;
  token: string;
  sessionId: string;
}> {
  const patient = await createPatient();
  const start = await chatTurn(patient.token, { action: "start_session", language });
  const sessionId = body(start).session_id ?? "";
  if (!sessionId) throw new Error("start_session did not return a session");
  const consent = await chatTurn(patient.token, {
    action: "record_consent",
    session_id: sessionId,
    consent: true,
    consent_version: CONSENT_VERSION,
    language,
  });
  if (consent.status !== 200) throw new Error(`consent failed: ${consent.status}`);
  return { id: patient.id, token: patient.token, sessionId };
}

async function answer(
  token: string,
  sessionId: string,
  questionId: string,
  text: string,
): Promise<HttpResult> {
  return await chatTurn(token, {
    action: "submit_turn",
    session_id: sessionId,
    question_id: questionId,
    text,
  });
}

async function reportRow(sessionId: string): Promise<Record<string, unknown> | null> {
  const result = await http(
    `/rest/v1/reports?session_id=eq.${sessionId}&select=*`,
    { service: true },
  );
  const rows = (result.json ?? []) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

async function sessionRow(sessionId: string): Promise<Record<string, unknown> | null> {
  const result = await http(
    `/rest/v1/sessions?id=eq.${sessionId}&select=*`,
    { service: true },
  );
  const rows = (result.json ?? []) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

async function messageRows(sessionId: string): Promise<Array<Record<string, unknown>>> {
  const result = await http(
    `/rest/v1/messages?session_id=eq.${sessionId}&select=role,question_id,turn_index,final_text&order=turn_index`,
    { service: true },
  );
  return (result.json ?? []) as Array<Record<string, unknown>>;
}

async function appointmentCount(reportId: string): Promise<number> {
  const result = await http(
    `/rest/v1/appointments?report_id=eq.${reportId}&select=id`,
    { service: true },
  );
  return ((result.json ?? []) as unknown[]).length;
}

async function groqUsed(): Promise<number> {
  const result = await http(
    "/rest/v1/daily_usage_counters?counter_name=eq.groq&select=used,counter_date&order=counter_date.desc&limit=1",
    { service: true },
  );
  const rows = (result.json ?? []) as Array<{ used: number }>;
  return rows[0]?.used ?? 0;
}

async function timbreUsed(): Promise<number> {
  const result = await http(
    "/rest/v1/daily_usage_counters?counter_name=eq.timbre&select=used,counter_date&order=counter_date.desc&limit=1",
    { service: true },
  );
  const rows = (result.json ?? []) as Array<{ used: number }>;
  return rows[0]?.used ?? 0;
}

async function rpc(
  token: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<HttpResult> {
  return await http(`/rest/v1/rpc/${name}`, { method: "POST", token, body: payload });
}

function errorCode(result: HttpResult): string {
  const json = (result.json ?? {}) as { code?: string };
  return json.code ?? "";
}

async function signJwt(sub: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub,
    role: "authenticated",
    aud: "authenticated",
    iss: "http://127.0.0.1:54321/auth/v1",
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  const base64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const head = base64url(enc.encode(JSON.stringify(header)));
  const bodyPart = base64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${head}.${bodyPart}`)),
  );
  return `${head}.${bodyPart}.${base64url(signature)}`;
}

/* -------------------------------------------------------------------------- */
/* Live scenarios                                                             */
/* -------------------------------------------------------------------------- */

async function liveMatrix(): Promise<void> {
  if (!ANON || !SERVICE) {
    record(
      "L-PREREQ",
      "2. Execution precedence",
      "Live local-stack scenarios run",
      "LOCAL_ANON_KEY and LOCAL_SERVICE_KEY provided",
      "missing credentials",
      "NOT TESTED",
      { severity: "high", note: "Set LOCAL_ANON_KEY and LOCAL_SERVICE_KEY." },
    );
    return;
  }

  const created: string[] = [];
  try {
    /* S1 — normal non-emergency intake (regression). */
    const normal = await startConsented("en");
    created.push(normal.id);
    const n1 = await answer(normal.token, normal.sessionId, "name", "Certification Patient");
    const n2 = await answer(normal.token, normal.sessionId, "age", "34");
    const n3 = await answer(normal.token, normal.sessionId, "gender", "Female");
    const normalOk = body(n1).current_question?.id === "age" &&
      body(n2).current_question?.id === "gender" &&
      body(n3).current_question?.id === "primary_concern" &&
      body(n3).turn_count === 3 &&
      body(n3).session_status === "in_progress" &&
      !body(n3).emergency_triggered;
    record(
      "L-NORMAL-01",
      "5. Regression testing",
      "Normal non-emergency intake still advances the fixed question order",
      "name→age→gender→primary_concern, 3 turns, no emergency",
      `next=${body(n1).current_question?.id}/${body(n2).current_question?.id}/${body(n3).current_question?.id}, turns=${body(n3).turn_count}, status=${body(n3).session_status}`,
      normalOk ? "PASS" : "FAIL",
      { severity: "critical" },
    );

    const control = await answer(
      normal.token,
      normal.sessionId,
      "primary_concern",
      "my knee hurts when I walk",
    );
    const controlOk = !body(control).emergency_triggered &&
      body(control).session_status === "in_progress" &&
      body(control).current_question?.id === "duration" &&
      body(control).turn_count === 4;
    record(
      "L-NORMAL-02",
      "5. Regression testing",
      "Normal concern answer advances to the scripted adaptive block",
      "in_progress, 4 turns, next question duration, no emergency",
      `status=${body(control).session_status}, turns=${body(control).turn_count}, next=${body(control).current_question?.id ?? "none"}, emergency=${body(control).emergency_triggered === true}`,
      controlOk ? "PASS" : "FAIL",
      { severity: "high" },
    );

    // Finish the normal report. Non-emergency intake must still complete, produce a
    // normal draft, and reach the provider stage exactly where the emergency path stops.
    const adaptiveAnswers = [
      ["duration", "two weeks"],
      ["severity", "mild"],
      ["conditions", "none"],
      ["medications", "none"],
      ["allergies", "none"],
      ["other_symptoms", "none"],
    ] as const;
    let last = control;
    let groqBeforeFinal = 0;
    for (let index = 0; index < adaptiveAnswers.length; index += 1) {
      if (index === adaptiveAnswers.length - 1) groqBeforeFinal = await groqUsed();
      const [questionId, text] = adaptiveAnswers[index];
      last = await answer(normal.token, normal.sessionId, questionId, text);
    }
    const groqAfterFinal = await groqUsed();
    const normalFinalDelta = groqAfterFinal - groqBeforeFinal;
    const normalDraft = (body(last).draft_report ?? null) as {
      schema_version?: number;
      summary?: { text?: string } | null;
      emergency?: unknown;
    } | null;
    record(
      "L-NORMAL-03",
      "5. Regression testing",
      "Normal non-emergency intake completes and produces a normal draft",
      "is_complete=true, can_submit=true, draft present with a summary, no emergency, 10 turns",
      `complete=${body(last).is_complete}, can_submit=${body(last).can_submit}, draft=${normalDraft !== null}, summary=${normalDraft?.summary != null}, emergency=${normalDraft?.emergency != null}, turns=${body(last).turn_count}`,
      body(last).is_complete === true &&
          body(last).can_submit === true &&
          normalDraft !== null &&
          normalDraft.summary != null &&
          normalDraft.emergency === null &&
          body(last).turn_count === 10
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );
    record(
      "L-NORMAL-04",
      "2. Execution precedence",
      "The ordinary final adaptive answer reaches the provider stage (same-turn control)",
      "at least one Groq reservation on the ordinary final turn",
      `delta=${normalFinalDelta}`,
      normalFinalDelta >= 1 ? "PASS" : "FAIL",
      {
        severity: "medium",
        note: "The provider endpoint on this local stack is the local stub (GROQ_BASE_URL host.docker.internal:8787); no live provider was contacted.",
      },
    );

    /* S1b — same-turn A/B: emergency on the final scripted turn. */
    const late = await startConsented("en");
    created.push(late.id);
    for (const [questionId, text] of [
      ["name", "Certification Patient"],
      ["age", "34"],
      ["gender", "Female"],
      ["primary_concern", "my knee hurts when I walk"],
      ["duration", "two weeks"],
      ["severity", "mild"],
      ["conditions", "none"],
      ["medications", "none"],
      ["allergies", "none"],
    ] as const) {
      await answer(late.token, late.sessionId, questionId, text);
    }
    const groqBeforeLate = await groqUsed();
    const lateTurn = await answer(
      late.token,
      late.sessionId,
      "other_symptoms",
      "I cannot breathe",
    );
    const groqAfterLate = await groqUsed();
    const lateRow = await reportRow(late.sessionId);
    record(
      "L-PREC-03",
      "2. Execution precedence",
      "A trigger on the final scripted turn preempts adaptive selection and the provider call",
      "emergency_triggered=true, session_status=emergency, no new question, Groq delta 0",
      `triggered=${body(lateTurn).emergency_triggered === true}, status=${body(lateTurn).session_status}, question=${body(lateTurn).current_question?.id ?? "none"}, delta=${groqAfterLate - groqBeforeLate}`,
      body(lateTurn).emergency_triggered === true &&
          body(lateTurn).session_status === "emergency" &&
          body(lateTurn).current_question?.id === "other_symptoms" &&
          groqAfterLate === groqBeforeLate
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );
    record(
      "L-PREC-04",
      "3. Urgent report behaviour",
      "The same-turn trigger still preserves the statement and the partial report",
      "urgent_partial with the verbatim statement",
      `status=${String(lateRow?.status)}, statement_match=${
        (lateRow?.report as { emergency?: { patient_statement?: string } } | undefined)?.emergency
          ?.patient_statement === "I cannot breathe"
      }`,
      lateRow?.status === "urgent_partial" &&
          (lateRow?.report as { emergency?: { patient_statement?: string } } | undefined)?.emergency
            ?.patient_statement === "I cannot breathe"
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    /* S2 — clear English emergency at the adaptive boundary. */
    const emergency = await startConsented("en");
    created.push(emergency.id);
    await answer(emergency.token, emergency.sessionId, "name", "Certification Patient");
    await answer(emergency.token, emergency.sessionId, "age", "34");
    await answer(emergency.token, emergency.sessionId, "gender", "Female");

    const groqBeforeTrigger = await groqUsed();
    const turnBefore = (await sessionRow(emergency.sessionId))?.answer_turn_count;
    const trigger = await answer(
      emergency.token,
      emergency.sessionId,
      "primary_concern",
      "I cannot breathe",
    );
    const groqAfterTrigger = await groqUsed();
    const triggerBody = body(trigger);
    const draft = (triggerBody.draft_report ?? {}) as {
      schema_version?: number;
      summary?: unknown;
      emergency?: { rule_id?: string; patient_statement?: string; triggered_at?: string };
      routing_snapshot?: { department_key?: string; preliminary?: boolean; is_fallback?: boolean; doctor_name?: string };
      primary_concern?: { status?: string };
      missing_information?: string[];
    };

    record(
      "L-EMERG-01",
      "2. Execution precedence",
      "Clear trigger returns the emergency state and no submit path",
      "emergency_triggered=true, session_status=emergency, can_submit=false",
      `triggered=${triggerBody.emergency_triggered === true}, status=${triggerBody.session_status}, can_submit=${triggerBody.can_submit}`,
      triggerBody.emergency_triggered === true &&
          triggerBody.session_status === "emergency" &&
          triggerBody.can_submit === false
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    record(
      "L-EMERG-02",
      "3. Urgent report behaviour",
      "Urgent report status is urgent_partial with no generated summary",
      "status=urgent_partial, summary=null",
      `status=${draft ? "present" : "absent"}, summary=${String(draft.summary)}`,
      triggerBody.draft_report && draft.summary === null ? "PASS" : "FAIL",
      { severity: "critical" },
    );

    const row = await reportRow(emergency.sessionId);
    const rowReport = (row?.report ?? {}) as typeof draft;
    record(
      "L-EMERG-03",
      "3. Urgent report behaviour",
      "Persisted report row is urgent_partial, emergency department, not submitted",
      "status=urgent_partial, department=emergency, submitted_at=null, possible_urgent=false",
      `status=${String(row?.status)}, department=${String(row?.department_key)}, submitted_at=${String(row?.submitted_at)}, possible_urgent=${String(row?.possible_urgent)}, rule=${String(row?.emergency_rule_id)}`,
      row?.status === "urgent_partial" &&
          row?.department_key === "emergency" &&
          row?.submitted_at === null &&
          row?.possible_urgent === false &&
          row?.emergency_rule_id === "breathing_emergency"
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    record(
      "L-EMERG-04",
      "3. Urgent report behaviour",
      "The triggering patient statement is preserved verbatim",
      "emergency.patient_statement equals the submitted answer",
      `match=${rowReport.emergency?.patient_statement === "I cannot breathe"}`,
      rowReport.emergency?.patient_statement === "I cannot breathe" ? "PASS" : "FAIL",
      { severity: "critical" },
    );

    record(
      "L-EMERG-05",
      "3. Urgent report behaviour",
      "Emergency routing uses the seeded Emergency doctor and stays preliminary",
      "department=emergency, preliminary=true, is_fallback=false, doctor name = seeded Emergency doctor",
      `department=${String(rowReport.routing_snapshot?.department_key)}, preliminary=${String(rowReport.routing_snapshot?.preliminary)}, fallback=${String(rowReport.routing_snapshot?.is_fallback)}, doctor=${String(rowReport.routing_snapshot?.doctor_name)}`,
      rowReport.routing_snapshot?.department_key === "emergency" &&
          rowReport.routing_snapshot?.preliminary === true &&
          rowReport.routing_snapshot?.is_fallback === false &&
          typeof rowReport.routing_snapshot?.doctor_name === "string"
        ? "PASS"
        : "FAIL",
      { severity: "high" },
    );

    record(
      "L-EMERG-06",
      "3. Urgent report behaviour",
      "Only reported information is present; unreached fields stay explicit",
      "primary_concern=not_asked and no invented clinical values",
      `primary_concern=${String(rowReport.primary_concern?.status)}, missing=${(rowReport.missing_information ?? []).length}`,
      rowReport.primary_concern?.status === "not_asked" &&
          Array.isArray(rowReport.missing_information)
        ? "PASS"
        : "FAIL",
      { severity: "high" },
    );

    record(
      "L-EMERG-07",
      "2. Execution precedence",
      "No provider call is made on the trigger turn",
      "Groq counter unchanged across the trigger answer",
      `delta=${groqAfterTrigger - groqBeforeTrigger}`,
      groqAfterTrigger === groqBeforeTrigger ? "PASS" : "FAIL",
      { severity: "critical" },
    );

    record(
      "L-EMERG-08",
      "2. Execution precedence",
      "The trigger turn is not accepted as a normal answer and no further question is selected",
      "turn_count unchanged; no new adaptive question id",
      `turn_before=${String(turnBefore)}, turn_after=${String(triggerBody.turn_count)}, current_question=${triggerBody.current_question?.id ?? "none"}`,
      turnBefore === triggerBody.turn_count &&
          triggerBody.current_question?.id !== "duration" &&
          triggerBody.current_question?.id !== "severity"
        ? "PASS"
        : "FAIL",
      { severity: "high" },
    );

    record(
      "L-EMERG-09",
      "2. Execution precedence",
      "After an emergency, the response advertises no further question",
      "current_question is absent",
      `current_question=${triggerBody.current_question?.id ?? "none"}`,
      triggerBody.current_question === undefined ? "PASS" : "FAIL",
      {
        severity: "low",
        note: "createEmergencyReport does not clear sessions.current_question_id, so the answered question is still returned (DEFECT D-3).",
      },
    );

    const further = await answer(
      emergency.token,
      emergency.sessionId,
      "primary_concern",
      "I still cannot breathe",
    );
    record(
      "L-EMERG-10",
      "2. Execution precedence",
      "A further answer after the emergency is refused",
      "non-2xx or an error field; no new turn or report",
      `status=${further.status}, error=${body(further).error ?? "none"}, turns=${body(further).turn_count}`,
      (further.status >= 400 || body(further).error !== undefined) &&
          body(further).turn_count === turnBefore
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    record(
      "L-EMERG-11",
      "2. Execution precedence",
      "The refusal uses a state error, not a turn-cap error",
      "error indicates the emergency/ended state",
      `error=${body(further).error ?? "none"}`,
      body(further).error !== "turn_cap_reached" ? "PASS" : "FAIL",
      {
        severity: "low",
        note: "canAcceptAnswer() collapses 'not in progress' and 'cap reached' into one refusal, so an emergency session reports turn_cap_reached (DEFECT D-4).",
      },
    );

    const submit = await chatTurn(emergency.token, {
      action: "submit_report",
      session_id: emergency.sessionId,
    });
    record(
      "L-EMERG-12",
      "3. Urgent report behaviour",
      "submit_report rejects an emergency session",
      "409 invalid_state",
      `status=${submit.status}, error=${body(submit).error ?? "none"}`,
      submit.status === 409 && body(submit).error === "invalid_state" ? "PASS" : "FAIL",
      { severity: "critical" },
    );

    const reportId = String(row?.id ?? "");
    const slots = await rpc(emergency.token, "get_available_slots", { p_report_id: reportId });
    const booking = await rpc(emergency.token, "book_appointment", {
      p_report_id: reportId,
      p_slot_start: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const appointmentTotal = await appointmentCount(reportId);
    record(
      "L-EMERG-13",
      "3. Urgent report behaviour",
      "Routine slots and booking are suppressed for an urgent report",
      "get_available_slots and book_appointment refuse; no appointment row",
      `slots=${slots.status}/${errorCode(slots)}, book=${booking.status}/${errorCode(booking)}, appointments=${appointmentTotal}`,
      slots.status >= 400 &&
          errorCode(slots) === "22023" &&
          booking.status >= 400 &&
          errorCode(booking) === "22023" &&
          appointmentTotal === 0
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    const resume = await chatTurn(emergency.token, {
      action: "resume_session",
      session_id: emergency.sessionId,
    });
    const resumedDraft = (body(resume).draft_report ?? null) as {
      schema_version?: number;
      summary?: unknown;
      emergency?: { rule_id?: string; patient_statement?: string };
    } | null;
    const resumedRow = await reportRow(emergency.sessionId);
    record(
      "L-EMERG-14",
      "3. Urgent report behaviour",
      "Resume restores the emergency state and report without re-offering Submit",
      "emergency_triggered=true, urgent_partial row, emergency block present, summary null, can_submit=false",
      `triggered=${body(resume).emergency_triggered === true}, row_status=${String(resumedRow?.status)}, rule=${String(resumedDraft?.emergency?.rule_id)}, summary=${String(resumedDraft?.summary)}, can_submit=${body(resume).can_submit}`,
      body(resume).emergency_triggered === true &&
          resumedRow?.status === "urgent_partial" &&
          resumedDraft?.emergency?.rule_id === "breathing_emergency" &&
          resumedDraft.summary === null &&
          body(resume).can_submit === false
        ? "PASS"
        : "FAIL",
      { severity: "high" },
    );

    /* S3 — Hindi trigger. */
    const hindi = await startConsented("hi");
    created.push(hindi.id);
    const hindiTrigger = await answer(
      hindi.token,
      hindi.sessionId,
      "name",
      "सांस नहीं आ रही",
    );
    const hindiRow = await reportRow(hindi.sessionId);
    const hindiReport = (hindiRow?.report ?? {}) as {
      emergency?: { patient_statement?: string; rule_id?: string };
      patient?: { name?: { status?: string } };
    };
    record(
      "L-HI-01",
      "1. Emergency detection",
      "Hindi Devanagari clear trigger enters the urgent path at any question",
      "emergency_triggered=true, rule=breathing_emergency, statement preserved",
      `triggered=${body(hindiTrigger).emergency_triggered === true}, rule=${String(hindiRow?.emergency_rule_id)}, statement_match=${hindiReport.emergency?.patient_statement === "सांस नहीं आ रही"}`,
      body(hindiTrigger).emergency_triggered === true &&
          hindiRow?.emergency_rule_id === "breathing_emergency" &&
          hindiReport.emergency?.patient_statement === "सांस नहीं आ रही"
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    record(
      "L-HI-02",
      "3. Urgent report behaviour",
      "The unanswered name field stays explicit in a Hindi urgent report",
      "patient.name.status = not_asked",
      `name=${String(hindiReport.patient?.name?.status)}`,
      hindiReport.patient?.name?.status === "not_asked" ? "PASS" : "FAIL",
      { severity: "medium" },
    );

    /* S4 — ambiguous workflow. */
    const ambiguous = await startConsented("en");
    created.push(ambiguous.id);
    await answer(ambiguous.token, ambiguous.sessionId, "name", "Certification Patient");
    await answer(ambiguous.token, ambiguous.sessionId, "age", "34");
    await answer(ambiguous.token, ambiguous.sessionId, "gender", "Female");
    const weak = await answer(
      ambiguous.token,
      ambiguous.sessionId,
      "primary_concern",
      "I have some chest pain",
    );
    record(
      "L-AMB-01",
      "1. Emergency detection",
      "Ambiguous mention asks the fixed Yes/No clarification",
      "current_question=emergency_clarification with Yes/No",
      `question=${body(weak).current_question?.id ?? "none"}, options=${(body(weak).current_question?.options ?? []).join("|")}, flag=${body(weak).current_question?.is_ambiguous_emergency === true}`,
      body(weak).current_question?.id === "emergency_clarification" &&
          body(weak).current_question?.is_ambiguous_emergency === true &&
          (body(weak).current_question?.options ?? []).length === 2
        ? "PASS"
        : "FAIL",
      { severity: "high" },
    );

    const ambiguousMessages = await messageRows(ambiguous.sessionId);
    record(
      "L-AMB-02",
      "3. Urgent report behaviour",
      "The ambiguous statement is preserved in the conversation log",
      "a patient message with the ambiguous answer",
      `stored=${ambiguousMessages.some((message) => message.final_text === "I have some chest pain")}`,
      ambiguousMessages.some((message) => message.final_text === "I have some chest pain")
        ? "PASS"
        : "FAIL",
      { severity: "high" },
    );

    record(
      "L-AMB-03",
      "3. Urgent report behaviour",
      "No report is created while the clarification is unresolved",
      "no report row",
      `report=${(await reportRow(ambiguous.sessionId)) === null ? "none" : "present"}`,
      (await reportRow(ambiguous.sessionId)) === null ? "PASS" : "FAIL",
      { severity: "high" },
    );

    const unclear = await answer(
      ambiguous.token,
      ambiguous.sessionId,
      "emergency_clarification",
      "maybe sometimes",
    );
    const unclearSession = await sessionRow(ambiguous.sessionId);
    record(
      "L-AMB-04",
      "1. Emergency detection",
      "An unclear clarification is never treated as safe",
      "needs_human_review=true, question stays, no report, no emergency",
      `review=${String(unclearSession?.needs_human_review)}, question=${body(unclear).current_question?.id ?? "none"}, report=${(await reportRow(ambiguous.sessionId)) === null ? "none" : "present"}`,
      unclearSession?.needs_human_review === true &&
          body(unclear).current_question?.id === "emergency_clarification" &&
          (await reportRow(ambiguous.sessionId)) === null
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    const noAnswer = await answer(
      ambiguous.token,
      ambiguous.sessionId,
      "emergency_clarification",
      "No",
    );
    const afterNo = await sessionRow(ambiguous.sessionId);
    record(
      "L-AMB-05",
      "1. Emergency detection",
      "'No' negates only that candidate and never clears the review flag",
      "pending cleared, intake continues, needs_human_review stays true",
      `pending=${String(afterNo?.pending_clarification_rule_id)}, question=${body(noAnswer).current_question?.id ?? "none"}, review=${String(afterNo?.needs_human_review)}`,
      afterNo?.pending_clarification_rule_id === null &&
          body(noAnswer).current_question?.id !== "emergency_clarification" &&
          afterNo?.needs_human_review === true
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    /* S5 — clarification Yes confirms. */
    const confirmed = await startConsented("en");
    created.push(confirmed.id);
    await answer(confirmed.token, confirmed.sessionId, "name", "Certification Patient");
    await answer(confirmed.token, confirmed.sessionId, "age", "34");
    await answer(confirmed.token, confirmed.sessionId, "gender", "Female");
    await answer(confirmed.token, confirmed.sessionId, "primary_concern", "I have some chest pain");
    const yes = await answer(
      confirmed.token,
      confirmed.sessionId,
      "emergency_clarification",
      "Yes",
    );
    const yesRow = await reportRow(confirmed.sessionId);
    record(
      "L-AMB-06",
      "3. Urgent report behaviour",
      "'Yes' confirms the candidate and creates the urgent report",
      "emergency_triggered=true, rule=severe_chest_pain, statement = the ambiguous answer",
      `triggered=${body(yes).emergency_triggered === true}, rule=${String(yesRow?.emergency_rule_id)}, statement_match=${
        (yesRow?.report as { emergency?: { patient_statement?: string } } | undefined)?.emergency
          ?.patient_statement === "I have some chest pain"
      }`,
      body(yes).emergency_triggered === true && yesRow?.emergency_rule_id === "severe_chest_pain"
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    /* S6 — DEFECT probe: a clear trigger sent as the clarification answer. */
    const clarifyGap = await startConsented("en");
    created.push(clarifyGap.id);
    await answer(clarifyGap.token, clarifyGap.sessionId, "name", "Certification Patient");
    await answer(clarifyGap.token, clarifyGap.sessionId, "age", "34");
    await answer(clarifyGap.token, clarifyGap.sessionId, "gender", "Female");
    await answer(clarifyGap.token, clarifyGap.sessionId, "primary_concern", "I have some chest pain");
    const clarifyClear = await answer(
      clarifyGap.token,
      clarifyGap.sessionId,
      "emergency_clarification",
      "I cannot breathe",
    );
    const clarifyGapSession = await sessionRow(clarifyGap.sessionId);
    record(
      "L-PREC-01",
      "2. Execution precedence",
      "A clear trigger in a clarification answer still enters the urgent path",
      "emergency_triggered=true",
      `triggered=${body(clarifyClear).emergency_triggered === true}, review=${String(clarifyGapSession?.needs_human_review)}, question=${body(clarifyClear).current_question?.id ?? "none"}`,
      body(clarifyClear).emergency_triggered === true ? "PASS" : "FAIL",
      {
        severity: "medium",
        note: "The clarification branch runs before classifyAnswer, so a clear emergency phrase typed as the answer is only marked needs_human_review (DEFECT D-5). It is never presented as safe and booking stays held.",
      },
    );

    /* S7 — DEFECT probe: negation scoping at HTTP level. */
    const negScope = await startConsented("en");
    created.push(negScope.id);
    await answer(negScope.token, negScope.sessionId, "name", "Certification Patient");
    await answer(negScope.token, negScope.sessionId, "age", "34");
    await answer(negScope.token, negScope.sessionId, "gender", "Female");
    const negTurn = await answer(
      negScope.token,
      negScope.sessionId,
      "primary_concern",
      "I cannot breathe but I have no fever",
    );
    record(
      "L-PREC-02",
      "2. Execution precedence",
      "A present clear trigger is not cancelled by an unrelated negation",
      "emergency_triggered=true",
      `triggered=${body(negTurn).emergency_triggered === true}, status=${body(negTurn).session_status}`,
      body(negTurn).emergency_triggered === true ? "PASS" : "FAIL",
      {
        severity: "high",
        note: "Live confirmation of DEFECT D-2 at the API boundary: the emergency path is not entered.",
      },
    );

    /* S8 — ownership isolation. */
    const other = await createPatient();
    created.push(other.id);
    const foreignResume = await chatTurn(other.token, {
      action: "resume_session",
      session_id: emergency.sessionId,
    });
    const otherReports = await http("/rest/v1/reports?select=id", { token: other.token });
    record(
      "L-OWN-01",
      "4. Doctor access and RLS",
      "Another patient cannot resume or read the urgent session",
      "resume rejected; direct report read returns 0 rows",
      `resume=${foreignResume.status}/${body(foreignResume).error ?? "none"}, reports=${((otherReports.json ?? []) as unknown[]).length}`,
      foreignResume.status === 404 && ((otherReports.json ?? []) as unknown[]).length === 0
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    const ownReports = await http("/rest/v1/reports?select=id", { token: emergency.token });
    const ownMessages = await http("/rest/v1/messages?select=id", { token: emergency.token });
    record(
      "L-OWN-02",
      "4. Doctor access and RLS",
      "The patient cannot read server-owned reports or messages directly",
      "0 rows for the owning patient",
      `reports=${((ownReports.json ?? []) as unknown[]).length}, messages=${((ownMessages.json ?? []) as unknown[]).length}`,
      ((ownReports.json ?? []) as unknown[]).length === 0 &&
          ((ownMessages.json ?? []) as unknown[]).length === 0
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );

    /* S9 — no false claim of contact/notification. */
    const claimPattern = /notified|dispatched|ambulance|called 112|contacted/i;
    const responseText = trigger.text;
    record(
      "L-CLAIM-01",
      "3. Urgent report behaviour",
      "The response does not claim any emergency service was contacted or dispatched",
      "no notification/dispatch claim in the response",
      `claim=${claimPattern.test(responseText)}`,
      claimPattern.test(responseText) ? "FAIL" : "PASS",
      { severity: "critical" },
    );

    const guidanceSource = await Deno.readTextFile("docs/demo-emergency-rules.md");
    const englishGuidance = "Please call **112** now or go to the nearest emergency department.";
    const hindiGuidance = "कृपया अभी **112** पर कॉल करें या नज़दीकी अस्पताल के इमरजेंसी विभाग में जाएँ।";
    record(
      "L-CLAIM-02",
      "3. Urgent report behaviour",
      "Approved plain-text 112 guidance is present in both languages",
      "English and Hindi guidance strings present; no tap-to-call link in the docs",
      `en=${guidanceSource.includes(englishGuidance)}, hi=${guidanceSource.includes(hindiGuidance)}, tel=${/tel:/.test(guidanceSource)}`,
      guidanceSource.includes(englishGuidance) &&
          guidanceSource.includes(hindiGuidance) &&
          !/tel:/.test(guidanceSource)
        ? "PASS"
        : "FAIL",
      { severity: "high", note: "UI rendering is frontend-owned; see docs/emergency-certification/audit-report.md §6." },
    );

    /* S10 — speak makes no paid call after the emergency. */
    const timbreBefore = await timbreUsed();
    const speak = await http("/functions/v1/speak", {
      method: "POST",
      token: emergency.token,
      body: { session_id: emergency.sessionId, question_id: "primary_concern" },
    });
    const timbreAfter = await timbreUsed();
    record(
      "L-SPEAK-01",
      "2. Execution precedence",
      "No paid TTS call is made for an emergency session",
      "text response, Timbre counter unchanged",
      `status=${speak.status}, audio=${(speak.json as { text?: string } | null)?.text === undefined}, timbre_delta=${timbreAfter - timbreBefore}`,
      speak.status === 200 &&
          (speak.json as { text?: string } | null)?.text !== undefined &&
          timbreAfter === timbreBefore
        ? "PASS"
        : "FAIL",
      { severity: "high" },
    );

    /* S11 — constants and report schema unchanged. */
    record(
      "L-LIMIT-01",
      "5. Regression testing",
      "Answer-turn and adaptive-question limits are unchanged",
      `MAX_ANSWER_TURNS=15, MAX_ADAPTIVE_QUESTIONS=3`,
      `turns=${MAX_ANSWER_TURNS}, adaptive=${MAX_ADAPTIVE_QUESTIONS}`,
      MAX_ANSWER_TURNS === 15 && MAX_ADAPTIVE_QUESTIONS === 3 ? "PASS" : "FAIL",
      { severity: "critical" },
    );
    record(
      "L-SCHEMA-01",
      "5. Regression testing",
      "Report schema version is unchanged",
      "REPORT_SCHEMA_VERSION=1 and response schema_version=1",
      `constant=${REPORT_SCHEMA_VERSION}, document=${String(draft.schema_version)}, row=${String(row?.schema_version)}`,
      REPORT_SCHEMA_VERSION === 1 && draft.schema_version === 1 && row?.schema_version === 1
        ? "PASS"
        : "FAIL",
      { severity: "critical" },
    );
  } finally {
    /* Self-only cleanup: deleting the created identities cascades their rows. */
    for (const id of created) {
      await deletePatient(id);
    }
    let residue = 0;
    for (const id of created) {
      const result = await http(
        `/rest/v1/sessions?user_id=eq.${id}&select=id`,
        { service: true },
      );
      residue += ((result.json ?? []) as unknown[]).length;
    }
    record(
      "L-CLEANUP-01",
      "6. Hygiene",
      "The harness deletes only the identities it created",
      "0 residual sessions for created users",
      `residual=${residue}, users=${created.length}`,
      residue === 0 ? "PASS" : "FAIL",
      { severity: "high" },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Doctor access over the caller-scoped API                                   */
/* -------------------------------------------------------------------------- */

async function doctorMatrix(
  patientToken: string,
  urgentSessionId: string,
  urgentReportId: string,
): Promise<void> {
  const category = "4. Doctor access and RLS";
  if (!JWT_SECRET) {
    for (const id of ["L-DOC-01", "L-DOC-02", "L-DOC-03", "L-DOC-04"]) {
      record(
        id,
        category,
        "Caller-scoped doctor API checks",
        "LOCAL_JWT_SECRET provided",
        "missing LOCAL_JWT_SECRET",
        "NOT TESTED",
        {
          severity: "high",
          note: "Authorization is covered independently by supabase/tests/emergency_authorization.sql.",
        },
      );
    }
    return;
  }

  const users = await adminUsers();
  const byEmail = new Map(users.map((user) => [user.email ?? "", user.id]));
  const gmId = byEmail.get("doctor-gm@rls.test");
  const emId = byEmail.get("doctor-em@rls.test");
  const orId = byEmail.get("doctor-or@rls.test");

  if (!gmId || !emId || !orId) {
    record(
      "L-DOC-00",
      category,
      "Local doctor test identities exist",
      "doctor-gm@rls.test, doctor-em@rls.test, doctor-or@rls.test present",
      `gm=${!!gmId}, em=${!!emId}, or=${!!orId}`,
      "NOT TESTED",
      { severity: "high", note: "Create the local test identities per supabase/tests/README.md." },
    );
    return;
  }

  const gm = await signJwt(gmId);
  const em = await signJwt(emId);
  const or = await signJwt(orId);

  const visibleUrgent = async (token: string): Promise<boolean> => {
    const result = await http(
      `/rest/v1/reports?id=eq.${urgentReportId}&select=id,status`,
      { token },
    );
    return ((result.json ?? []) as unknown[]).length === 1;
  };

  const gmSees = await visibleUrgent(gm);
  const emSees = await visibleUrgent(em);
  const orSees = await visibleUrgent(or);
  record(
    "L-DOC-01",
    category,
    "General Medicine and Emergency doctors can read the urgent report; another department cannot",
    "gm=true, em=true, orthopedics=false",
    `gm=${gmSees}, em=${emSees}, orthopedics=${orSees}`,
    gmSees && emSees && !orSees ? "PASS" : "FAIL",
    { severity: "critical" },
  );

  const messagesFor = async (token: string): Promise<number> => {
    const result = await http(
      `/rest/v1/messages?session_id=eq.${urgentSessionId}&select=id`,
      { token },
    );
    return ((result.json ?? []) as unknown[]).length;
  };
  const gmMessages = await messagesFor(gm);
  const emMessages = await messagesFor(em);
  const orMessages = await messagesFor(or);
  record(
    "L-DOC-02",
    category,
    "Conversation access follows report access",
    "gm>0, em>0, orthopedics=0",
    `gm=${gmMessages}, em=${emMessages}, orthopedics=${orMessages}`,
    gmMessages > 0 && emMessages > 0 && orMessages === 0 ? "PASS" : "FAIL",
    { severity: "high" },
  );

  const writeAttempt = await http(`/rest/v1/reports?id=eq.${urgentReportId}`, {
    method: "PATCH",
    token: em,
    body: { status: "submitted" },
  });
  const deleteAttempt = await http(`/rest/v1/reports?id=eq.${urgentReportId}`, {
    method: "DELETE",
    token: em,
  });
  const appointmentWrite = await http("/rest/v1/appointments", {
    method: "POST",
    token: em,
    body: {
      report_id: urgentReportId,
      user_id: emId,
      doctor_id: "00000000-0000-4000-8000-000000000000",
      slot_start: new Date(Date.now() + 86_400_000).toISOString(),
      slot_end: new Date(Date.now() + 90_000_000).toISOString(),
      reference_code: "APT-CERT-0001",
    },
  });
  record(
    "L-DOC-03",
    category,
    "Unauthorized writes are rejected",
    "no doctor write path to reports/appointments",
    `patch=${writeAttempt.status}, delete=${deleteAttempt.status}, appointment_insert=${appointmentWrite.status}`,
    writeAttempt.status >= 400 && deleteAttempt.status >= 400 && appointmentWrite.status >= 400
      ? "PASS"
      : "FAIL",
    { severity: "critical" },
  );

  const gmReview = await rpc(gm, "mark_report_reviewed", { p_report_id: urgentReportId });
  const orReview = await rpc(or, "mark_report_reviewed", { p_report_id: urgentReportId });
  const emReview = await rpc(em, "mark_report_reviewed", { p_report_id: urgentReportId });
  const emReviewAgain = await rpc(em, "mark_report_reviewed", { p_report_id: urgentReportId });
  record(
    "L-DOC-04",
    category,
    "Mark Reviewed authorisation (OD-03 interim)",
    "gm denied, orthopedics denied, emergency doctor allowed and idempotent",
    `gm=${gmReview.status}/${errorCode(gmReview)}, orthopedics=${orReview.status}/${errorCode(orReview)}, em=${emReview.status}, repeat_already=${String((emReviewAgain.json as Array<{ already_reviewed?: boolean }> | null)?.[0]?.already_reviewed)}`,
    gmReview.status >= 400 &&
        errorCode(gmReview) === "42501" &&
        orReview.status >= 400 &&
        emReview.status === 200 &&
        (emReviewAgain.json as Array<{ already_reviewed?: boolean }> | null)?.[0]?.already_reviewed === true
      ? "PASS"
      : "FAIL",
    { severity: "critical" },
  );

  const slotsAfterReview = await rpc(patientToken, "get_available_slots", {
    p_report_id: urgentReportId,
  });
  const bookingAfterReview = await rpc(patientToken, "book_appointment", {
    p_report_id: urgentReportId,
    p_slot_start: new Date(Date.now() + 86_400_000).toISOString(),
  });
  record(
    "L-DOC-05",
    category,
    "Review never unlocks an emergency report",
    "urgent_partial still refuses slots and booking after Mark Reviewed",
    `slots=${slotsAfterReview.status}/${errorCode(slotsAfterReview)}, book=${bookingAfterReview.status}/${errorCode(bookingAfterReview)}`,
    slotsAfterReview.status >= 400 &&
        bookingAfterReview.status >= 400 &&
        errorCode(bookingAfterReview) === "22023"
      ? "PASS"
      : "FAIL",
    { severity: "critical" },
  );
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

console.log(`Emergency certification — local stack ${BASE}`);
console.log(`Commit under test: ${Deno.env.get("CERT_COMMIT") ?? "(unset)"}\n`);

matcherMatrix();
await liveMatrix();

// Recreate one short-lived emergency session for the doctor checks.
if (ANON && SERVICE && JWT_SECRET) {
  const harness = await startConsented("en");
  try {
    await answer(harness.token, harness.sessionId, "name", "Certification Patient");
    await answer(harness.token, harness.sessionId, "age", "34");
    await answer(harness.token, harness.sessionId, "gender", "Female");
    await answer(harness.token, harness.sessionId, "primary_concern", "I cannot breathe");
    const row = await reportRow(harness.sessionId);
    if (row?.id) {
      await doctorMatrix(harness.token, harness.sessionId, String(row.id));
    } else {
      record(
        "L-DOC-00",
        "4. Doctor access and RLS",
        "Doctor checks can run against an app-created urgent report",
        "urgent report present",
        "missing",
        "FAIL",
        { severity: "critical" },
      );
    }
  } finally {
    await deletePatient(harness.id);
  }
} else {
  record(
    "L-DOC-00",
    "4. Doctor access and RLS",
    "Caller-scoped doctor API checks run",
    "credentials provided",
    "missing LOCAL_ANON_KEY / LOCAL_SERVICE_KEY / LOCAL_JWT_SECRET",
    "NOT TESTED",
    { severity: "high" },
  );
}

/* -------------------------------------------------------------------------- */
/* Summary and evidence                                                       */
/* -------------------------------------------------------------------------- */

const summary = {
  total: cases.length,
  pass: cases.filter((entry) => entry.verdict === "PASS").length,
  fail: cases.filter((entry) => entry.verdict === "FAIL").length,
  notTested: cases.filter((entry) => entry.verdict === "NOT TESTED").length,
};
const blocking = cases.filter(
  (entry) => entry.verdict === "FAIL" && (entry.severity === "critical" || entry.severity === "high"),
);
const verdict: Verdict = summary.fail > 0 ? "FAIL" : summary.notTested > 0 ? "NOT TESTED" : "PASS";

console.log("\nSummary:", JSON.stringify(summary));
console.log("Verdict:", verdict);
if (blocking.length > 0) {
  console.log(`Blocking findings: ${blocking.map((entry) => entry.id).join(", ")}`);
}
notes.push(`Base URL: ${BASE} (local only).`);
notes.push(`Commit under test: ${Deno.env.get("CERT_COMMIT") ?? "(unset)"}.`);
notes.push("Usage counters were read and left unchanged; only ordinary app usage moved them.");

const evidence = {
  generated_at: new Date().toISOString(),
  commit: Deno.env.get("CERT_COMMIT") ?? null,
  target: BASE,
  local_only: true,
  summary,
  verdict,
  blocking_findings: blocking.map((entry) => entry.id),
  notes,
  cases,
};

await Deno.writeTextFile(
  "emergency-certification-result.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log("Evidence written to emergency-certification-result.json");

if (summary.fail > 0) Deno.exit(1);
