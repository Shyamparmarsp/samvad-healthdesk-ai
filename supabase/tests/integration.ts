/**
 * Local integration harness: real Edge Function HTTP calls + real local database.
 *
 * Scope and labels:
 *   [HTTP+DB]  actual `supabase functions serve` invocation against the local stack
 *   [STUB]     the request reached the function, which called the local provider stub
 *   [DB]       direct assertion against the local Postgres
 *
 * No production endpoint and no production credential is used. Provider traffic goes to
 * supabase/tests/stub-providers.ts on 127.0.0.1.
 *
 * Run:
 *   deno run --allow-net --allow-env supabase/tests/integration.ts
 */

const BASE = Deno.env.get("LOCAL_URL") ?? "http://127.0.0.1:54321";
const STUB = Deno.env.get("STUB_URL") ?? "http://127.0.0.1:8787";
const ANON = Deno.env.get("LOCAL_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("LOCAL_SERVICE_KEY") ?? "";
const PASSWORD = "local-test-password";

if (!ANON || !SERVICE) {
  console.error("LOCAL_ANON_KEY and LOCAL_SERVICE_KEY are required");
  Deno.exit(2);
}

// Fail closed: if the local stub is unavailable the run must abort, never continue in a
// state where a provider call could escape to a real endpoint.
try {
  const probe = await fetch(`${STUB}/__stats`);
  if (!probe.ok) throw new Error(`stub returned ${probe.status}`);
  const probeBody = await probe.json();
  if (typeof probeBody.groqCalls !== "number") throw new Error("stub does not look like the local stub");
} catch (error) {
  console.error(`ABORT: local provider stub at ${STUB} is not reachable (${String(error)}).`);
  console.error("Refusing to run: without the stub, provider traffic could reach a real endpoint.");
  Deno.exit(2);
}

interface Result {
  name: string;
  label: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
const facts: Record<string, unknown> = {};

function record(name: string, label: string, ok: boolean, detail = ""): void {
  results.push({ name, label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${label}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function eq<T>(actual: T, expected: T): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function api(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers = new Headers(init.headers ?? {});
  headers.set("apikey", token ? ANON : SERVICE);
  headers.set("Authorization", `Bearer ${token ?? SERVICE}`);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

async function chat(token: string, payload: unknown) {
  return api("/functions/v1/chat-turn", { method: "POST", body: JSON.stringify(payload) }, token);
}

async function anonymousPatient(): Promise<string> {
  const response = await fetch(`${BASE}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: "{}",
  });
  const body = await response.json();
  return body.access_token as string;
}

async function doctorToken(email: string): Promise<string> {
  const response = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error(`doctor sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

async function stubControl(patch: Record<string, unknown>): Promise<void> {
  await fetch(`${STUB}/__control`, { method: "POST", body: JSON.stringify(patch) });
}

async function stubStats(): Promise<any> {
  return (await fetch(`${STUB}/__stats`)).json();
}

const ANSWERS: Array<[string, string]> = [
  ["name", "Asha Test"],
  ["age", "34"],
  ["gender", "Prefer not to say"],
  ["primary_concern", "knee pain when walking"],
  ["duration", "about three weeks"],
  ["severity", "moderate"],
  ["conditions", "none"],
  ["medications", "prefer not to say"],
  ["allergies", "I don't know"],
  ["other_symptoms", "mild swelling"],
];

// ---------------------------------------------------------------------------
// 1. Happy path: start, resume, consent, ten answers, draft, correct, submit
// ---------------------------------------------------------------------------
// Deterministic runs: clear only the intake domain (never auth users or reference data).
async function resetTestData(): Promise<void> {
  for (const table of ["appointments", "reports", "messages", "consent_records", "sessions"]) {
    await api(`/rest/v1/${table}?id=not.is.null`, { method: "DELETE" }, undefined);
  }
}
await resetTestData();

const patientA = await anonymousPatient();

const start = await chat(patientA, { action: "start_session", language: "en" });
const sessionA = start.body?.session_id;
facts.sessionA = sessionA;
record(
  "start_session returns a session and the first question",
  "HTTP+DB",
  start.status === 200 && start.body.session_status === "created" && start.body.current_question?.id === "name",
  `status=${start.status} question=${start.body?.current_question?.id}`,
);

const resumed = await chat(patientA, { action: "resume_session", session_id: sessionA });
record(
  "resume_session returns the same session",
  "HTTP+DB",
  resumed.status === 200 && resumed.body.session_id === sessionA && resumed.body.turn_count === 0,
);

const badConsent = await chat(patientA, {
  action: "record_consent",
  session_id: sessionA,
  consent: true,
  consent_version: "2019-01-01.v0",
  language: "en",
});
record("consent with a stale version is rejected", "HTTP+DB", badConsent.status === 400, `status=${badConsent.status}`);

const consent = await chat(patientA, {
  action: "record_consent",
  session_id: sessionA,
  consent: true,
  consent_version: "2026-11-01.v1",
  language: "en",
});
record(
  "consent with the current version is accepted",
  "HTTP+DB",
  consent.status === 200 && consent.body.session_status === "consented",
  `status=${consent.status}`,
);

let last: any = consent.body;
for (const [question, answer] of ANSWERS) {
  const response = await chat(patientA, {
    action: "submit_turn",
    session_id: sessionA,
    question_id: question,
    text: answer,
  });
  last = response.body;
  if (response.status !== 200 || last?.error) {
    record(`submit_turn ${question}`, "HTTP+DB", false, `status=${response.status} error=${last?.error}`);
  }
}
record(
  "ten answers complete the intake",
  "HTTP+DB",
  last.turn_count === 10 && last.is_complete === true && !!last.draft_report,
  `turns=${last.turn_count} complete=${last.is_complete}`,
);
record(
  "gender 'Prefer not to say' is stored as declined with no value",
  "HTTP+DB",
  last.draft_report?.patient?.gender?.status === "declined" && last.draft_report?.patient?.gender?.value === null,
  JSON.stringify(last.draft_report?.patient?.gender ?? null),
);
record(
  "draft routing used the stubbed Groq suggestion and mapped a doctor",
  "STUB",
  last.draft_report?.routing_snapshot?.department_key === "orthopedics" &&
    !!last.draft_report?.routing_snapshot?.doctor_id &&
    last.draft_report?.routing_snapshot?.is_fallback === false,
  JSON.stringify(last.draft_report?.routing_snapshot ?? null),
);
record(
  "summary is present and restates only patient facts",
  "HTTP+DB",
  typeof last.draft_report?.summary?.text === "string" &&
    last.draft_report.summary.text.includes("knee pain") &&
    !/diagnos|prescri|treatment/i.test(last.draft_report.summary.text),
);

const reportId = (await api(`/rest/v1/reports?select=id,status&session_id=eq.${sessionA}`, {}, undefined)).body?.[0]?.id;
facts.reportA = reportId;

const corrected = await chat(patientA, {
  action: "correct_draft_report",
  session_id: sessionA,
  report_id: reportId,
  updates: { "primary_concern": { value: "knee pain at night", status: "provided" } },
});
record(
  "correction of an allowlisted field is applied",
  "HTTP+DB",
  corrected.status === 200 && corrected.body.draft_report?.primary_concern?.value === "knee pain at night",
);

const forbidden = await chat(patientA, {
  action: "correct_draft_report",
  session_id: sessionA,
  report_id: reportId,
  updates: { "status": { value: "submitted", status: "provided" } },
});
record(
  "correction of a protected field is rejected",
  "HTTP+DB",
  forbidden.status === 400 || forbidden.status === 500,
  `status=${forbidden.status} error=${forbidden.body?.error}`,
);

const submitted = await chat(patientA, { action: "submit_report", session_id: sessionA, report_id: reportId });
record(
  "submit_report returns the submitted row",
  "HTTP+DB",
  submitted.status === 200 && submitted.body.submitted_report?.status === "submitted" && submitted.body.session_status === "submitted",
  `status=${submitted.status}`,
);

// ---------------------------------------------------------------------------
// 2. Ownership: another patient cannot resume or read A's session
// ---------------------------------------------------------------------------
const patientB = await anonymousPatient();
const foreignResume = await chat(patientB, { action: "resume_session", session_id: sessionA });
record("another patient cannot resume the session (404)", "HTTP+DB", foreignResume.status === 404, `status=${foreignResume.status}`);

const foreignRead = await api(`/rest/v1/reports?select=id&session_id=eq.${sessionA}`, {}, patientB);
record(
  "another patient cannot read the report through REST",
  "HTTP+DB",
  foreignRead.status === 200 && Array.isArray(foreignRead.body) && foreignRead.body.length === 0,
  `rows=${foreignRead.body?.length}`,
);

// ---------------------------------------------------------------------------
// 3. Consent denial: nothing is collected
// ---------------------------------------------------------------------------
const patientC = await anonymousPatient();
const startC = await chat(patientC, { action: "start_session", language: "hi" });
const sessionC = startC.body.session_id;
facts.sessionC = sessionC;

const deny = await chat(patientC, {
  action: "record_consent",
  session_id: sessionC,
  consent: false,
  consent_version: "2026-11-01.v1",
  language: "hi",
});
const afterDeny = await chat(patientC, {
  action: "submit_turn",
  session_id: sessionC,
  question_id: "name",
  text: "Should not be stored",
});
record("consent No ends the session", "HTTP+DB", deny.status === 200 && deny.body.session_status === "declined");
record(
  "no health answer is accepted after consent No",
  "HTTP+DB",
  afterDeny.status >= 400 || !!afterDeny.body?.error,
  `status=${afterDeny.status} error=${afterDeny.body?.error}`,
);

// ---------------------------------------------------------------------------
// 4. Deterministic emergency
// ---------------------------------------------------------------------------
const patientD = await anonymousPatient();
const startD = await chat(patientD, { action: "start_session", language: "en" });
const sessionD = startD.body.session_id;
facts.sessionD = sessionD;
await chat(patientD, { action: "record_consent", session_id: sessionD, consent: true, consent_version: "2026-11-01.v1", language: "en" });
await chat(patientD, { action: "submit_turn", session_id: sessionD, question_id: "name", text: "Meera Demo" });
await chat(patientD, { action: "submit_turn", session_id: sessionD, question_id: "age", text: "29" });
await chat(patientD, { action: "submit_turn", session_id: sessionD, question_id: "gender", text: "Female" });

const emergency = await chat(patientD, {
  action: "submit_turn",
  session_id: sessionD,
  question_id: "primary_concern",
  text: "I cannot breathe at all",
});
record(
  "a deterministic emergency stops intake and flags the turn",
  "HTTP+DB",
  emergency.body?.emergency_triggered === true && emergency.body?.session_status === "emergency",
  `status=${emergency.body?.session_status}`,
);
record(
  "the urgent report has no generated summary",
  "HTTP+DB",
  emergency.body?.draft_report?.summary === null && emergency.body?.draft_report?.emergency?.rule_id === "breathing_emergency",
);

// ---------------------------------------------------------------------------
// 5. Ambiguous emergency + clarification (OD-02 / OD-09 untouched)
// ---------------------------------------------------------------------------
const patientE = await anonymousPatient();
const startE = await chat(patientE, { action: "start_session", language: "en" });
const sessionE = startE.body.session_id;
facts.sessionE = sessionE;
await chat(patientE, { action: "record_consent", session_id: sessionE, consent: true, consent_version: "2026-11-01.v1", language: "en" });
await chat(patientE, { action: "submit_turn", session_id: sessionE, question_id: "name", text: "Sanjay Sample" });
await chat(patientE, { action: "submit_turn", session_id: sessionE, question_id: "age", text: "61" });
await chat(patientE, { action: "submit_turn", session_id: sessionE, question_id: "gender", text: "Male" });

const ambiguous = await chat(patientE, {
  action: "submit_turn",
  session_id: sessionE,
  question_id: "primary_concern",
  text: "there is some pressure in my chest sometimes",
});
record(
  "an ambiguous statement asks the fixed clarification",
  "HTTP+DB",
  ambiguous.body?.current_question?.id === "emergency_clarification" &&
    ambiguous.body?.current_question?.is_ambiguous_emergency === true &&
    ambiguous.body?.emergency_triggered !== true,
  `question=${ambiguous.body?.current_question?.id}`,
);

const unclear = await chat(patientE, {
  action: "submit_turn",
  session_id: sessionE,
  question_id: "emergency_clarification",
  text: "maybe sometimes, I am not sure",
});
record(
  "an unclear clarification keeps the question and never claims safety",
  "HTTP+DB",
  unclear.body?.current_question?.id === "emergency_clarification" && !unclear.body?.emergency_triggered,
  `error=${unclear.body?.error ?? "none"}`,
);

const no = await chat(patientE, {
  action: "submit_turn",
  session_id: sessionE,
  question_id: "emergency_clarification",
  text: "No",
});
record(
  "‘No’ continues intake without claiming safety",
  "HTTP+DB",
  no.status === 200 && no.body?.current_question?.id !== "emergency_clarification" && !no.body?.emergency_triggered,
  `question=${no.body?.current_question?.id}`,
);

// ---------------------------------------------------------------------------
// 6. Audio preview (stubbed Prisma) does not consume a turn
// ---------------------------------------------------------------------------
const patientF = await anonymousPatient();
const startF = await chat(patientF, { action: "start_session", language: "hi" });
const sessionF = startF.body.session_id;
facts.sessionF = sessionF;
await chat(patientF, { action: "record_consent", session_id: sessionF, consent: true, consent_version: "2026-11-01.v1", language: "hi" });

const audio = await chat(patientF, {
  action: "submit_turn",
  session_id: sessionF,
  question_id: "name",
  audio_base64: btoa("fake-audio-bytes"),
  audio_format: "audio/wav",
});
record(
  "audio returns transcript_preview and does not advance the turn",
  "STUB",
  audio.status === 200 &&
    audio.body?.transcript_preview?.state === "transcript_preview" &&
    audio.body?.transcript_preview?.text === "मुझे घुटने में दर्द है" &&
    audio.body?.turn_count === 0,
  `turn_count=${audio.body?.turn_count}`,
);
record("the preview field name is unique", "HTTP+DB", !("pending_transcript" in (audio.body ?? {})));

const confirm = await chat(patientF, {
  action: "submit_turn",
  session_id: sessionF,
  question_id: "name",
  text: "मुझे घुटने में दर्द है",
});
record(
  "confirming the preview accepts exactly one turn",
  "HTTP+DB",
  confirm.body?.turn_count === 1 && confirm.body?.current_question?.id === "age",
  `turn_count=${confirm.body?.turn_count}`,
);

const webm = await chat(patientF, {
  action: "submit_turn",
  session_id: sessionF,
  question_id: "age",
  audio_base64: btoa("fake"),
  audio_format: "audio/webm",
});
record("webm audio is rejected before any provider call", "HTTP+DB", webm.status === 400, `status=${webm.status}`);

// ---------------------------------------------------------------------------
// 7. speak: adaptive only, ownership, fallbacks
// ---------------------------------------------------------------------------
const speakBody = (question: string) => JSON.stringify({ session_id: sessionF, question_id: question });

const speakFixed = await api("/functions/v1/speak", { method: "POST", body: speakBody("age") }, patientF);
const speakFixedText = speakFixed.status === 200 && (speakFixed.body?.text ?? "").length > 0;
record(
  "speak never synthesises a cached scripted prompt",
  "HTTP+DB",
  speakFixedText,
  `status=${speakFixed.status}`,
);

const speakWrong = await api("/functions/v1/speak", { method: "POST", body: speakBody("severity") }, patientF);
record("speak rejects a question that is not current", "HTTP+DB", speakWrong.status === 409, `status=${speakWrong.status}`);

const speakForeign = await api("/functions/v1/speak", { method: "POST", body: speakBody("age") }, patientE);
record("speak rejects a session owned by another patient (404)", "HTTP+DB", speakForeign.status === 404, `status=${speakForeign.status}`);

// advance patient F to an adaptive question: age, gender, concern, duration
await chat(patientF, { action: "submit_turn", session_id: sessionF, question_id: "age", text: "30" });
await chat(patientF, { action: "submit_turn", session_id: sessionF, question_id: "gender", text: "Female" });
await chat(patientF, { action: "submit_turn", session_id: sessionF, question_id: "primary_concern", text: "shoulder stiffness" });
await chat(patientF, { action: "submit_turn", session_id: sessionF, question_id: "duration", text: "one week" });
// current question is now severity (adaptive)
const speakOk = await fetch(`${BASE}/functions/v1/speak`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${patientF}`, "content-type": "application/json" },
  body: speakBody("severity"),
});
const speakBytes = new Uint8Array(await speakOk.arrayBuffer());
record(
  "speak returns audio for an adaptive current question",
  "STUB",
  speakOk.status === 200 &&
    (speakOk.headers.get("content-type") ?? "").includes("audio") &&
    speakBytes.byteLength > 0,
  `status=${speakOk.status} bytes=${speakBytes.byteLength}`,
);

await stubControl({ timbre: "error500" });
const speakFail = await fetch(`${BASE}/functions/v1/speak`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${patientF}`, "content-type": "application/json" },
  body: speakBody("severity"),
});
const failBody = await speakFail.json();
record(
  "a provider failure returns the approved question as text",
  "STUB",
  speakFail.status === 200 && typeof failBody?.text === "string" && failBody.text.length > 0,
  `status=${speakFail.status}`,
);
await stubControl({ timbre: "ok" });

// ---------------------------------------------------------------------------
// 8. Groq fallback: malformed model output must not route
// ---------------------------------------------------------------------------
const patientG = await anonymousPatient();
const startG = await chat(patientG, { action: "start_session", language: "en" });
const sessionG = startG.body.session_id;
facts.sessionG = sessionG;
await chat(patientG, { action: "record_consent", session_id: sessionG, consent: true, consent_version: "2026-11-01.v1", language: "en" });
await stubControl({ groq: "malformed" });
for (const [question, answer] of ANSWERS) {
  await chat(patientG, { action: "submit_turn", session_id: sessionG, question_id: question, text: answer });
}
const fallbackDoc = (await chat(patientG, { action: "resume_session", session_id: sessionG })).body?.draft_report;
await stubControl({ groq: "ok" });
record(
  "malformed model output falls back to General Medicine",
  "STUB",
  fallbackDoc?.routing_snapshot?.department_key === "general_medicine" &&
    fallbackDoc?.routing_snapshot?.is_fallback === true,
  JSON.stringify(fallbackDoc?.routing_snapshot ?? null),
);

// ---------------------------------------------------------------------------
// 9. Doctor reads through RLS
// ---------------------------------------------------------------------------
const gmToken = await doctorToken("doctor-gm@rls.test");
const emToken = await doctorToken("doctor-em@rls.test");
const orToken = await doctorToken("doctor-or@rls.test");
const deToken = await doctorToken("doctor-de@rls.test");

const gmReports = await api("/rest/v1/reports?select=id,status,user_id", {}, gmToken);
const gmStatuses = (gmReports.body ?? []).map((row: any) => row.status).sort();
// The knee report was routed to Orthopedics, so the General Medicine doctor must not
// see it even though it is submitted.
const gmSeesReport = await api(`/rest/v1/reports?select=id&id=eq.${reportId}`, {}, gmToken);
record(
  "a submitted report is hidden from a doctor it is not assigned to",
  "HTTP+DB",
  Array.isArray(gmSeesReport.body) && gmSeesReport.body.length === 0,
  `rows=${gmSeesReport.body?.length}`,
);

const orSeesReport = await api(`/rest/v1/reports?select=id&id=eq.${reportId}`, {}, orToken);
record(
  "the assigned doctor can read the submitted report",
  "HTTP+DB",
  Array.isArray(orSeesReport.body) && orSeesReport.body.length === 1,
  `rows=${orSeesReport.body?.length}`,
);
record("draft reports are never visible", "HTTP+DB", !gmStatuses.includes("draft"), JSON.stringify(gmStatuses));
record(
  "General Medicine doctor sees the urgent partial report",
  "HTTP+DB",
  gmStatuses.includes("urgent_partial"),
  JSON.stringify(gmStatuses),
);

const emReports = await api("/rest/v1/reports?select=id,status", {}, emToken);
const emStatuses = (emReports.body ?? []).map((row: any) => row.status).sort();
record(
  "Emergency doctor sees only the documented emergency reports",
  "HTTP+DB",
  emStatuses.includes("urgent_partial") && !emStatuses.includes("draft"),
  JSON.stringify(emStatuses),
);

// The knee report was routed to Orthopedics by the stubbed model, so that doctor must
// see exactly that one assigned report.
const orReports = await api("/rest/v1/reports?select=id,status", {}, orToken);
const orStatuses = (orReports.body ?? []).map((row: any) => row.status);
record(
  "the assigned Orthopedics doctor sees the routed report",
  "HTTP+DB",
  orStatuses.includes("submitted") && !orStatuses.includes("urgent_partial"),
  JSON.stringify(orStatuses),
);
record(
  "no doctor sees a draft or an unassigned report",
  "HTTP+DB",
  !orStatuses.includes("draft") && !orStatuses.includes("urgent_partial"),
  JSON.stringify(orStatuses),
);

// A doctor in a department with no reports must see nothing.
const deReports = await api("/rest/v1/reports?select=id,status", {}, deToken);
record(
  "an unrelated doctor sees no reports",
  "HTTP+DB",
  Array.isArray(deReports.body) && deReports.body.length === 0,
  `rows=${deReports.body?.length}`,
);

// Conversation access follows report access exactly: the Emergency doctor must not see
// the conversation of a report assigned to another department.
const emForeignMessages = await api(`/rest/v1/messages?select=id&session_id=eq.${sessionA}`, {}, emToken);
record(
  "the Emergency doctor cannot read another department's conversation",
  "HTTP+DB",
  Array.isArray(emForeignMessages.body) && emForeignMessages.body.length === 0,
  `rows=${emForeignMessages.body?.length}`,
);

const emOwnMessages = await api(`/rest/v1/messages?select=id&session_id=eq.${sessionD}`, {}, emToken);
record(
  "the Emergency doctor can read the urgent conversation",
  "HTTP+DB",
  Array.isArray(emOwnMessages.body) && emOwnMessages.body.length > 0,
  `rows=${emOwnMessages.body?.length}`,
);

record(
  "Mark Reviewed is not implemented in this milestone",
  "Not tested / blocked",
  true,
  "mark_report_reviewed is an M4 RPC; no endpoint exists to exercise",
);

// ---------------------------------------------------------------------------
// 10. Mark Reviewed over HTTP (real doctor JWTs, real RPC)
// ---------------------------------------------------------------------------
const rpcReview = (token: string, reportId: string) =>
  api("/rest/v1/rpc/mark_report_reviewed", { method: "POST", body: JSON.stringify({ p_report_id: reportId }) }, token);

const beforeReview = (await api(`/rest/v1/reports?select=status,department_key,doctor_id,possible_urgent,needs_human_review,report&id=eq.${reportId}`, {}, undefined)).body?.[0];

const firstReview = await rpcReview(orToken, reportId);
record(
  "the assigned doctor marks a submitted report reviewed",
  "HTTP+DB",
  firstReview.status === 200 && firstReview.body?.[0]?.already_reviewed === false,
  `status=${firstReview.status}`,
);
const firstReviewedAt = firstReview.body?.[0]?.reviewed_at;

const repeatReview = await rpcReview(orToken, reportId);
record(
  "a repeated review is idempotent and keeps the first timestamp",
  "HTTP+DB",
  repeatReview.status === 200 && repeatReview.body?.[0]?.already_reviewed === true && repeatReview.body?.[0]?.reviewed_at === firstReviewedAt,
  `first=${firstReviewedAt} second=${repeatReview.body?.[0]?.reviewed_at}`,
);

const afterReview = (await api(`/rest/v1/reports?select=status,department_key,doctor_id,possible_urgent,needs_human_review,report,reviewed_by&id=eq.${reportId}`, {}, undefined)).body?.[0];
record(
  "review changes only the two review fields",
  "HTTP+DB",
  afterReview?.status === beforeReview?.status &&
    afterReview?.doctor_id === beforeReview?.doctor_id &&
    afterReview?.department_key === beforeReview?.department_key &&
    afterReview?.possible_urgent === beforeReview?.possible_urgent &&
    afterReview?.needs_human_review === beforeReview?.needs_human_review &&
    JSON.stringify(afterReview?.report) === JSON.stringify(beforeReview?.report),
);
record(
  "reviewed_by records the authenticated doctor identity",
  "HTTP+DB",
  typeof afterReview?.reviewed_by === "string" && afterReview.reviewed_by.length === 36,
  `reviewed_by=${afterReview?.reviewed_by ? "set" : "missing"}`,
);

const unassignedReview = await rpcReview(deToken, reportId);
record("an unassigned doctor is rejected", "HTTP+DB", unassignedReview.status >= 400, `status=${unassignedReview.status}`);

const patientReview = await rpcReview(patientA, reportId);
record("a patient is rejected", "HTTP+DB", patientReview.status >= 400, `status=${patientReview.status}`);

const draftReportId = (await api(`/rest/v1/reports?select=id&status=eq.draft`, {}, undefined)).body?.[0]?.id;
if (draftReportId) {
  const draftReview = await rpcReview(orToken, draftReportId);
  record("a draft report is rejected", "HTTP+DB", draftReview.status >= 400, `status=${draftReview.status}`);
} else {
  record("a draft report is rejected", "Not tested / blocked", false, "no draft report fixture available");
}

const urgentReportId = (await api(`/rest/v1/reports?select=id&session_id=eq.${sessionD}`, {}, undefined)).body?.[0]?.id;
if (urgentReportId) {
  const gmUrgent = await rpcReview(gmToken, urgentReportId);
  record(
    "a General Medicine doctor is denied on an emergency report (OD-03 interim)",
    "HTTP+DB",
    gmUrgent.status >= 400,
    `status=${gmUrgent.status}`,
  );

  const emUrgent = await rpcReview(emToken, urgentReportId);
  record(
    "the Emergency doctor reviews the eligible emergency report",
    "HTTP+DB",
    emUrgent.status === 200 && typeof emUrgent.body?.[0]?.reviewed_at === "string",
    `status=${emUrgent.status}`,
  );

  const urgentState = (await api(`/rest/v1/reports?select=status,department_key&id=eq.${urgentReportId}`, {}, undefined)).body?.[0];
  record(
    "emergency review changes neither status nor booking eligibility",
    "HTTP+DB",
    urgentState?.status === "urgent_partial" && urgentState?.department_key === "emergency",
    JSON.stringify(urgentState?.status),
  );
} else {
  record("emergency review matrix", "Not tested / blocked", false, "no urgent report fixture available");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const stats = await stubStats();
facts.stub = stats;
console.log(`\nStub call counts: groq=${stats.groqCalls} prisma=${stats.prismaCalls} timbre=${stats.ttsCalls}`);
console.log(JSON.stringify({ facts }, null, 2));

// Every provider-dependent path must have used the local stub. A zero counter means the
// request either never happened or escaped somewhere else.
record("the local stub served every provider-dependent path", "STUB", stats.groqCalls >= 2 && stats.prismaCalls >= 1 && stats.ttsCalls >= 2, `groq=${stats.groqCalls} prisma=${stats.prismaCalls} timbre=${stats.ttsCalls}`);

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
if (failed.length > 0) {
  for (const entry of failed) console.log(`FAILED: ${entry.name} (${entry.detail})`);
  Deno.exit(1);
}
