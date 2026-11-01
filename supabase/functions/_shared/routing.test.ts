import {
  resolveRouting,
  resolveEmergencyRouting,
  type DepartmentRecord,
  type DoctorRecord,
} from "./routing.ts";
import { suggestDepartment } from "./groq-routing.ts";
import { buildConsentRecord, CONSENT_TEXT, CONSENT_VERSION } from "./consent.ts";
import { assert, assertEqual } from "./testing.ts";

const DEPARTMENTS: DepartmentRecord[] = [
  { key: "general_medicine", name: "General Medicine", booking_enabled: true, is_emergency: false },
  { key: "orthopedics", name: "Orthopedics", booking_enabled: true, is_emergency: false },
  { key: "emergency", name: "Emergency", booking_enabled: false, is_emergency: true },
  { key: "dermatology", name: "Dermatology", booking_enabled: true, is_emergency: false },
];

const DOCTORS: DoctorRecord[] = [
  { id: "doc-gm", display_name: "Dr. Aditi Rao", department_key: "general_medicine" },
  { id: "doc-or", display_name: "Dr. Kabir Mehta", department_key: "orthopedics" },
  { id: "doc-em", display_name: "Dr. Neha Verma", department_key: "emergency" },
  { id: "doc-de", display_name: "Dr. Sara Khan", department_key: "dermatology" },
];

Deno.test("routing: a valid seeded department is accepted and mapped", () => {
  const result = resolveRouting("orthopedics", DEPARTMENTS, DOCTORS);
  assertEqual(result.source, "model", "model source");
  assertEqual(result.routing.department_key, "orthopedics", "key");
  assertEqual(result.routing.doctor_id, "doc-or", "doctor mapped");
  assertEqual(result.routing.is_fallback, false, "not a fallback");
  assertEqual(result.routing.preliminary, true, "always preliminary");
});

Deno.test("routing: an unknown department falls back to General Medicine", () => {
  const result = resolveRouting("neurology", DEPARTMENTS, DOCTORS);
  assertEqual(result.source, "fallback", "fallback");
  assertEqual(result.reason, "unknown_department", "reason");
  assertEqual(result.routing.department_key, "general_medicine", "key");
  assertEqual(result.routing.is_fallback, true, "marked fallback");
});

Deno.test("routing: emergency is never routable from a model suggestion", () => {
  const result = resolveRouting("emergency", DEPARTMENTS, DOCTORS);
  assertEqual(result.source, "fallback", "fallback");
  assertEqual(result.reason, "emergency_not_routable", "reason");
  assert(result.routing.department_key !== "emergency", "never emergency");
});

Deno.test("routing: a department without a seeded doctor falls back", () => {
  const result = resolveRouting("dermatology", DEPARTMENTS, [DOCTORS[0], DOCTORS[2]]);
  assertEqual(result.reason, "no_doctor", "reason");
  assertEqual(result.routing.department_key, "general_medicine", "fallback key");
});

Deno.test("routing: no candidate or empty seeded data never throws silently", () => {
  assertEqual(resolveRouting(null, DEPARTMENTS, DOCTORS).reason, "no_candidate", "null candidate");
  assertEqual(resolveRouting(42, DEPARTMENTS, DOCTORS).reason, "unknown_department", "wrong type");

  let threw = false;
  try {
    resolveRouting("orthopedics", [], []);
  } catch {
    threw = true;
  }
  assert(threw, "empty seed set raises rather than returning an invalid snapshot");
});

Deno.test("routing: emergency routing uses the seeded Emergency doctor only", () => {
  const routing = resolveEmergencyRouting(DEPARTMENTS, DOCTORS);
  assertEqual(routing.department_key, "emergency", "key");
  assertEqual(routing.doctor_id, "doc-em", "doctor");
  assertEqual(routing.is_fallback, false, "not a fallback");
});

function stubGroq(content: string | null, status = 200): typeof fetch {
  return ((_input: RequestInfo | URL) => {
    if (content === null) return Promise.resolve(new Response("{}", { status }));
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
}

const GROQ_OPTIONS = { apiKey: "test-key", timeoutMs: 50 };

Deno.test("groq routing: a valid suggestion is returned", async () => {
  const result = await suggestDepartment(
    { ...GROQ_OPTIONS, fetchImpl: stubGroq('{"department_key":"orthopedics"}') },
    "knee pain when walking",
  );
  assertEqual(result, "orthopedics", "candidate");
});

Deno.test("groq routing: an unknown enum value is rejected", async () => {
  const result = await suggestDepartment(
    { ...GROQ_OPTIONS, fetchImpl: stubGroq('{"department_key":"neurology"}') },
    "headache",
  );
  assertEqual(result, null, "rejected");
});

Deno.test("groq routing: emergency is rejected by the schema validator", async () => {
  const result = await suggestDepartment(
    { ...GROQ_OPTIONS, fetchImpl: stubGroq('{"department_key":"emergency"}') },
    "cannot breathe",
  );
  assertEqual(result, null, "rejected");
});

Deno.test("groq routing: malformed JSON and extra fields are rejected", async () => {
  assertEqual(await suggestDepartment({ ...GROQ_OPTIONS, fetchImpl: stubGroq("not json") }, "x"), null, "malformed");
  assertEqual(
    await suggestDepartment({ ...GROQ_OPTIONS, fetchImpl: stubGroq('{"department_key":"orthopedics","note":"x"}') }, "x"),
    null,
    "extra field",
  );
});

Deno.test("groq routing: HTTP failure, timeout and missing key all yield null", async () => {
  assertEqual(await suggestDepartment({ ...GROQ_OPTIONS, fetchImpl: stubGroq(null, 500) }, "x"), null, "500");
  assertEqual(await suggestDepartment({ ...GROQ_OPTIONS, fetchImpl: stubGroq(null, 429) }, "x"), null, "429");

  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  const hanging = (() => Promise.reject(aborted)) as unknown as typeof fetch;
  assertEqual(await suggestDepartment({ ...GROQ_OPTIONS, fetchImpl: hanging }, "x"), null, "timeout");

  assertEqual(await suggestDepartment({ apiKey: "" }, "x"), null, "no key never calls");
});

Deno.test("consent: the stored wording is the versioned copy, not a synthetic marker", () => {
  const record = buildConsentRecord("en", CONSENT_VERSION);
  assert(record !== null, "accepted");
  if (!record) return;
  assertEqual(record.consent_version, CONSENT_VERSION, "version");
  assertEqual(record.consent_text, CONSENT_TEXT.en, "exact wording");
  assert(record.consent_text.length > 100, "real copy, not a placeholder");
  assert(!record.consent_text.startsWith("consent_v"), "no synthetic string");
});

Deno.test("consent: a version mismatch is refused", () => {
  assertEqual(buildConsentRecord("en", "2019-01-01.v0"), null, "stale version");
  assertEqual(buildConsentRecord("hi", ""), null, "empty version");
});

Deno.test("consent: both languages carry distinct, non-empty wording", () => {
  const en = buildConsentRecord("en", CONSENT_VERSION);
  const hi = buildConsentRecord("hi", CONSENT_VERSION);
  assert(en !== null && hi !== null, "both built");
  if (!en || !hi) return;
  assert(en.consent_text !== hi.consent_text, "distinct copy");
  assert(/[\u0900-\u097F]/.test(hi.consent_text), "Hindi uses Devanagari");
});
