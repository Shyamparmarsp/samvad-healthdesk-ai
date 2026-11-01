/** Adaptive bank integration scenarios against local HTTP + stubbed providers. */
const BASE = Deno.env.get("LOCAL_URL") ?? "http://127.0.0.1:54321";
const ANON = Deno.env.get("LOCAL_ANON_KEY") ?? "";
const results: Array<[string, boolean, string]> = [];
const ok = (name: string, pass: boolean, detail = "") => { results.push([name, pass, detail]); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

async function call(path: string, body: unknown, token: string) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const turn = (t: string, sid: string, q: string, text: string) => call("/functions/v1/chat-turn", { action: "submit_turn", session_id: sid, question_id: q, text }, t);

async function session(language: "en" | "hi", concern: string) {
  const r = await fetch(`${BASE}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: "{}" });
  const token = (await r.json()).access_token as string;
  const start = await call("/functions/v1/chat-turn", { action: "start_session", language }, token);
  const sid = start.body.session_id as string;
  await call("/functions/v1/chat-turn", { action: "record_consent", session_id: sid, consent: true, consent_version: "2026-11-01.v1", language }, token);
  const script: Array<[string, string]> = [
    ["name", "Asha Test"], ["age", "34"], ["gender", "banana"],
    ["primary_concern", concern], ["duration", "3 weeks"], ["severity", "moderate"],
    ["conditions", "none"], ["medications", "none"], ["allergies", "none"], ["other_symptoms", "none"],
  ];
  let last: any = null;
  for (const [q, a] of script) last = (await turn(token, sid, q, a)).body;
  return { token, sid, last };
}

const knee = await session("en", "knee pain when walking");
ok("knee concern routes to an Orthopedics question", String(knee.last?.current_question?.id).startsWith("ORTH-"), knee.last?.current_question?.id);
ok("scripted questions ran before the bank question", knee.last?.turn_count === 10, `turns=${knee.last?.turn_count}`);
ok("English session receives English text", knee.last?.current_question?.text?.length > 0 && !/[\u0900-\u097F]/.test(knee.last.current_question.text), knee.last?.current_question?.text);

const resumed = (await call("/functions/v1/chat-turn", { action: "resume_session", session_id: knee.sid }, knee.token)).body;
ok("unanswered adaptive question survives resume", resumed?.current_question?.id === knee.last?.current_question?.id, resumed?.current_question?.id);

const answered = (await turn(knee.token, knee.sid, knee.last.current_question.id, "No")).body;
ok("asked adaptive id is not repeated", answered?.current_question?.id !== knee.last?.current_question?.id, answered?.current_question?.id ?? "none");
ok("adaptive answer counts toward the turn limit", answered?.turn_count === 11, `turns=${answered?.turn_count}`);

const rash = await session("hi", "itchy skin rash on the arm");
ok("rash concern routes to a Dermatology question", String(rash.last?.current_question?.id).startsWith("DERM-"), rash.last?.current_question?.id);
ok("Hindi session receives stored Devanagari text", /[\u0900-\u097F]/.test(String(rash.last?.current_question?.text_hi)), rash.last?.current_question?.text_hi);

const emerg = await session("en", "I cannot breathe at all");
ok("emergency bypasses adaptive selection", emerg.last?.session_status === "emergency" && !String(emerg.last?.current_question?.id ?? "").match(/^(GM|ORTH|SURG|DERM|CARD)-/), String(emerg.last?.session_status));

// --- all five departments ---
for (const [concern, prefix, label] of [
  ["fever and tiredness for a week", "GM-", "General Medicine"],
  ["abdominal pain after meals", "GM-|SURG-", "Abdominal pain (Medicine or Surgery)"],
  ["chest discomfort when walking", "CARD-", "Cardiology"],
] as const) {
  const s5 = await session("en", concern);
  const id = String(s5.last?.current_question?.id ?? "");
  ok(`${label}: concern routes to an appropriate bank`, prefix.split("|").some((p) => id.startsWith(p)), id);
  const again = (await call("/functions/v1/chat-turn", { action: "resume_session", session_id: s5.sid }, s5.token)).body;
  ok(`${label}: department survives resume`, again?.current_question?.id === s5.last?.current_question?.id, String(again?.current_question?.id));
}

// --- browser cannot supply a department ---
const injected = await call("/functions/v1/chat-turn", { action: "start_session", language: "en", department: "cardiology" }, knee.token);
ok("browser cannot inject a department", injected.status === 400, `status=${injected.status}`);

// --- three adaptive answers maximum ---
const capped = await session("en", "knee pain when walking");
let current = capped.last?.current_question?.id as string | undefined;
let attempts = 0;
while (current && String(current).match(/^ORTH-/) && attempts < 6) {
  const r = (await turn(capped.token, capped.sid, current, "No")).body;
  current = r?.current_question?.id;
  attempts += 1;
}
ok("at most three adaptive answers are accepted", attempts === 3, `adaptive_answered=${attempts}`);
ok("a fourth adaptive question is never selected", !String(current ?? "").match(/^ORTH-/), String(current ?? "none"));

const failed = results.filter(([, pass]) => !pass);
console.log(`\n${results.length - failed.length}/${results.length} adaptive scenarios passed`);
if (failed.length) Deno.exit(1);
