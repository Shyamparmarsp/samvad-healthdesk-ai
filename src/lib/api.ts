/**
 * API Client Layer — The ONLY module allowed to make Supabase / API requests.
 * In M2, this provides a typed mock backend for full client simulation.
 * Source: AGENTS.md, MILESTONES.md M1-S9, docs/report-design.md, backend contract.ts
 */

import {
  ChatTurnResponse,
  ChatMessage,
  QuestionId,
  SubmitTurnAction,
  CorrectDraftReportAction,
  SubmitReportAction,
  BookAppointmentRequest,
  BookAppointmentResponse,
  MarkReportReviewedResponse,
  DoctorLoginResponse,
  DoctorConversationMessage,
} from '../types/api';

import {
  ReportDocumentV1,
  ReportRow,
  SessionStatus,
  DepartmentKey,
  CORRECTABLE_FIELDS,
  CorrectableField,
} from '../types/report';

import {
  DoctorProfile,
  AppointmentSlot,
  Appointment,
  DoctorDashboardStats,
} from '../types/doctor';
import { formatIstTime, istDateKey, parseInstant, addMinutes } from './booking-time';

import { CONSENT_VERSION } from '../types/consent';
import {
  getSupabaseClient,
  isSupabaseConfigured,
  SUPABASE_KEY,
  SUPABASE_URL,
} from './supabase';
import {
  getMockAdaptiveQuestion,
  getMockCandidates,
} from './mock-adaptive-bank';

export type AppMode = 'mock' | 'supabase';

/**
 * A failed backend call.
 *
 * `error` on the wire is a stable code (`invalid_state`, `not_found`, `demo_busy`, …),
 * never prose and never patient data (docs/integration-contract.md §5). The frontend
 * owns the copy, so the code is preserved instead of being flattened into
 * "Edge Function returned a non-2xx status code".
 *
 * `turn_cap_reached`, `provider_unavailable`, `transcript_empty`, `audio_in_progress`,
 * `audio_superseded` and `demo_busy` are expected domain states that the backend
 * returns with HTTP 200 and a normal envelope, so they are NOT thrown: callers read
 * `response.error` from the returned `ChatTurnResponse`.
 */
export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the value can be a Postgres uuid (report ids, session ids). */
function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Reads the stable error code out of a FunctionsHttpError without losing the body. */
async function codeFromInvokeError(error: unknown): Promise<{ code?: string; status?: number }> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    const status = context.status;
    try {
      const body = (await context.clone().json()) as unknown;
      if (body && typeof body === 'object') {
        const code = (body as { error?: unknown }).error;
        if (typeof code === 'string') return { code, status };
      }
    } catch {
      // Body was already consumed or is not JSON; fall back to the SDK message.
    }
    return { status };
  }
  return {};
}

/**
 * Single invocation path for both Edge Functions so error mapping cannot drift.
 * A non-2xx response becomes an `ApiError` carrying the backend's code.
 */
async function invokeFunction<T>(name: 'chat-turn' | 'speak', body: unknown): Promise<T> {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<T>(name, { body: body as Record<string, unknown> });
  if (error) {
    const { code, status } = await codeFromInvokeError(error);
    throw new ApiError(code ?? (error instanceof Error ? error.message : 'Request failed'), code, status);
  }
  if (data === null || data === undefined) {
    throw new ApiError('Empty response from backend');
  }
  return data;
}

let currentAppMode: AppMode = isSupabaseConfigured ? 'supabase' : 'mock';

export function getAppMode(): AppMode {
  return currentAppMode;
}

export function setAppMode(mode: AppMode): void {
  currentAppMode = mode;
}

// -------------------------------------------------------------
// Fictional Doctors (docs/demo-seed-data.md)
// -------------------------------------------------------------
export const FICTIONAL_DOCTORS: Record<DepartmentKey, DoctorProfile> = {
  general_medicine: {
    id: 'doc-gen-med-01',
    name: 'Dr. Aditi Rao',
    department_key: 'general_medicine',
    department_name: 'General Medicine',
    title: 'Senior Consultant Physician',
    initials: 'AR',
    email: 'aditi.rao@hospital.demo',
    routine_slots_enabled: true,
  },
  orthopedics: {
    id: 'doc-ortho-02',
    name: 'Dr. Kabir Mehta',
    department_key: 'orthopedics',
    department_name: 'Orthopedics',
    title: 'Consultant Orthopedic Surgeon',
    initials: 'KM',
    email: 'kabir.mehta@hospital.demo',
    routine_slots_enabled: true,
  },
  emergency: {
    id: 'doc-emg-03',
    name: 'Dr. Neha Verma',
    department_key: 'emergency',
    department_name: 'Emergency Medicine',
    title: 'Emergency Medicine Lead',
    initials: 'NV',
    email: 'neha.verma@hospital.demo',
    routine_slots_enabled: false, // Urgent only; no slots
  },
  general_surgery: {
    id: 'doc-surg-04',
    name: 'Dr. Ishaan Patel',
    department_key: 'general_surgery',
    department_name: 'General Surgery',
    title: 'Consultant General Surgeon',
    initials: 'IP',
    email: 'ishaan.patel@hospital.demo',
    routine_slots_enabled: true,
  },
  dermatology: {
    id: 'doc-derm-05',
    name: 'Dr. Sara Khan',
    department_key: 'dermatology',
    department_name: 'Dermatology',
    title: 'Consultant Dermatologist',
    initials: 'SK',
    email: 'sara.khan@hospital.demo',
    routine_slots_enabled: true,
  },
  cardiology: {
    id: 'doc-cardio-06',
    name: 'Dr. Arjun Nair',
    department_key: 'cardiology',
    department_name: 'Cardiology',
    title: 'Consultant Cardiologist',
    initials: 'AN',
    email: 'arjun.nair@hospital.demo',
    routine_slots_enabled: true,
  },
};

/**
 * Reference-data lookups.
 *
 * `doctors` and `departments` are readable by any signed-in caller for booking UI
 * display; `doctor_profiles` is readable only for the caller's own row. Nothing here is
 * authority — the server derives routing and ownership independently.
 */
interface DoctorReference {
  id: string;
  display_name: string;
  department_key: DepartmentKey;
}

async function lookupDoctor(doctorId: string): Promise<DoctorReference | null> {
  if (!doctorId) return null;
  const client = getSupabaseClient();
  // A test double may expose only `rpc`. Display enrichment must never be the reason a
  // booking or a login fails, so an absent REST surface degrades to "no display name".
  if (typeof client.from !== 'function') return null;
  try {
    const { data, error } = await client
      .from('doctors')
      .select('id, display_name, department_key')
      .eq('id', doctorId)
      .maybeSingle();
    if (error || !data) return null;
    return data as DoctorReference;
  } catch {
    return null;
  }
}

async function lookupDepartment(
  departmentKey: string,
): Promise<{ key: string; name: string; booking_enabled: boolean; is_emergency: boolean } | null> {
  const client = getSupabaseClient();
  if (typeof client.from !== 'function') return null;
  try {
    const { data, error } = await client
      .from('departments')
      .select('key, name, booking_enabled, is_emergency')
      .eq('key', departmentKey)
      .maybeSingle();
    if (error || !data) return null;
    return data as { key: string; name: string; booking_enabled: boolean; is_emergency: boolean };
  } catch {
    return null;
  }
}

function departmentNameFor(departmentKey?: DepartmentKey | null): string {
  if (departmentKey && FICTIONAL_DOCTORS[departmentKey]) {
    return FICTIONAL_DOCTORS[departmentKey].department_name;
  }
  return FICTIONAL_DOCTORS.general_medicine.department_name;
}

/** "Dr. Aditi Rao" → "AR" for the avatar badge. */
function initialsOf(displayName: string): string {
  const words = displayName
    .replace(/^Dr\.?\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'DR';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// -------------------------------------------------------------
// Approved Questions Flow
// -------------------------------------------------------------
interface QuestionSpec {
  id: QuestionId;
  textEn: string;
  textHi: string;
  optionsEn?: string[];
  optionsHi?: string[];
}

const QUESTION_SPECS: QuestionSpec[] = [
  {
    id: 'name',
    textEn: 'What is your full name?',
    textHi: 'आपका पूरा नाम क्या है?',
  },
  {
    id: 'age',
    textEn: 'What is your age in completed years?',
    textHi: 'आपकी उम्र कितने वर्ष है?',
  },
  {
    id: 'gender',
    textEn: 'What is your gender?',
    textHi: 'आपका लिंग क्या है?',
    optionsEn: ['Male', 'Female', 'Other', 'Prefer not to say'],
    optionsHi: ['पुरुष (Male)', 'महिला (Female)', 'अन्य (Other)', 'बताना नहीं चाहते'],
  },
  {
    id: 'primary_concern',
    textEn: 'What is your primary symptom or health concern today?',
    textHi: 'आज आपकी मुख्य समस्या या लक्षण क्या हैं?',
  },
  {
    id: 'duration',
    textEn: 'How long have you been experiencing this symptom?',
    textHi: 'यह लक्षण आपको कितने समय से महसूस हो रहा है?',
  },
  {
    id: 'severity',
    textEn: 'How would you describe the severity of your symptom?',
    textHi: 'आप अपने लक्षण की तीव्रता का वर्णन कैसे करेंगे?',
    optionsEn: ['Mild', 'Moderate', 'Severe'],
    optionsHi: ['हल्का (Mild)', 'मध्यम (Moderate)', 'गंभीर (Severe)'],
  },
  {
    id: 'conditions',
    textEn: 'Do you have any existing chronic medical conditions (e.g. diabetes, hypertension)?',
    textHi: 'क्या आपको पहले से कोई बीमारी है (जैसे शुगर, बीपी)?',
    optionsEn: ['None known', 'High blood pressure', 'Diabetes'],
    optionsHi: ['कोई नहीं / पता नहीं', 'हाई ब्लड प्रेशर', 'डायबिटीज'],
  },
  {
    id: 'medications',
    textEn: 'Are you currently taking any prescription medicines or regular treatments?',
    textHi: 'क्या आप वर्तमान में कोई नियमित दवाइयाँ ले रहे हैं?',
    optionsEn: ['None', 'Yes, taking regular medicines'],
    optionsHi: ['कोई नहीं', 'हाँ, नियमित दवा ले रहे हैं'],
  },
  {
    id: 'allergies',
    textEn: 'Do you have any known drug or substance allergies?',
    textHi: 'क्या आपको किसी दवा या चीज़ से एलर्जी है?',
    optionsEn: ['None known', 'Penicillin', 'Sulfa drugs'],
    optionsHi: ['कोई नहीं / पता नहीं', 'पेनिसिलिन', 'सल्फा दवाएं'],
  },
  {
    id: 'other_symptoms',
    textEn: 'Are you having any other symptoms you would like to mention?',
    textHi: 'क्या आप कोई अन्य लक्षण बताना चाहते हैं?',
    optionsEn: ['No other symptoms', 'Mild fever', 'Headache'],
    optionsHi: ['कोई अन्य लक्षण नहीं', 'हल्का बुखार', 'सिरदर्द'],
  },
];

// Non-declinable fields per docs/report-design.md
const NON_DECLINABLE_FIELDS: readonly CorrectableField[] = [
  'patient.name',
  'patient.age',
  'primary_concern',
  'clinical_details.duration',
  'clinical_details.severity',
];

// Helper to generate reference codes
function generateReferenceCode(prefix: string): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${yyyymmdd}-${rand}`;
}

// -------------------------------------------------------------
// In-Memory Mock Database
// -------------------------------------------------------------
interface SessionState {
  sessionId: string;
  userId: string;
  language: 'en' | 'hi';
  sessionStatus: SessionStatus;
  consentGranted: boolean;
  consentVersion?: string;
  turnCount: number;
  currentQuestionIndex: number;
  preliminaryDepartment?: DepartmentKey;
  currentAdaptiveQuestionId?: string;
  adaptiveAskedIds: string[];
  adaptiveAnswersCount: number;
  messages: ChatMessage[];
  pendingAmbiguousEmergency: boolean;
  collectedData: {
    name?: string;
    age?: number;
    gender?: string;
    primary_concern?: string;
    duration?: string;
    severity?: string;
    conditions?: string[];
    medications?: string[];
    allergies?: string[];
    other_symptoms?: string[];
  };
  draftReport?: ReportDocumentV1;
  submittedReport?: ReportRow;
}

const mockSessions = new Map<string, SessionState>();
const mockReports = new Map<string, ReportRow>();
const mockAppointments = new Map<string, Appointment>();
/**
 * Conversation fixtures for the pre-seeded demo reports. Their sessions are synthetic and
 * are not present in `mockSessions`; real mock-mode intakes use the session messages below.
 */
const mockSeededMessages = new Map<string, DoctorConversationMessage[]>();

// Pre-seed some synthetic doctor reports so dashboard has rich initial state
function initSeedReports() {
  const now = new Date();
  const pastIso = new Date(now.getTime() - 3600000 * 4).toISOString();
  const pastIso2 = new Date(now.getTime() - 3600000 * 24).toISOString();

  // 1. Submitted Booked Report (Orthopedics)
  const rep1Id = 'rep-ortho-seeded-01';
  const rep1: ReportRow = {
    id: rep1Id,
    session_id: 'sess-seeded-01',
    user_id: 'user-anon-01',
    status: 'submitted',
    schema_version: 1,
    department_key: 'orthopedics',
    doctor_id: FICTIONAL_DOCTORS.orthopedics.id,
    intake_reference: 'SHD-20261101-7KM4P2',
    possible_urgent: false,
    needs_human_review: false,
    emergency_rule_id: null,
    submitted_at: pastIso2,
    reviewed_at: null,
    reviewed_by: null,
    created_at: pastIso2,
    updated_at: pastIso2,
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Asha Sharma' },
        age: { status: 'provided', value: 38 },
        gender: { status: 'provided', value: 'female' },
        language: 'en',
      },
      primary_concern: { status: 'provided', value: 'Persistent sharp pain in right knee when climbing stairs' },
      clinical_details: {
        duration: { status: 'provided', value: '3 weeks' },
        severity: { status: 'provided', value: 'Moderate, worse in the evening' },
        conditions: { status: 'provided', value: ['High blood pressure'] },
        medications: { status: 'declined', value: null },
        allergies: { status: 'unknown', value: null },
        other_symptoms: { status: 'provided', value: ['Mild local swelling around knee cap'] },
      },
      missing_information: ['clinical_details.medications', 'clinical_details.allergies'],
      summary: {
        text: 'Patient reports persistent sharp pain in the right knee for 3 weeks, described as moderate and worse in the evening. Reports mild local swelling and known hypertension.',
        source: 'template',
        generated_from: ['primary_concern', 'clinical_details.duration', 'clinical_details.severity', 'clinical_details.conditions', 'clinical_details.other_symptoms'],
      },
      routing_snapshot: {
        department_key: 'orthopedics',
        department_name: 'Orthopedics',
        doctor_id: FICTIONAL_DOCTORS.orthopedics.id,
        doctor_name: 'Dr. Kabir Mehta',
        is_fallback: false,
        preliminary: true,
      },
      emergency: null,
    },
  };
  mockReports.set(rep1Id, rep1);

  // Appointment for rep1
  const apt1: Appointment = {
    id: 'apt-seeded-01',
    report_id: rep1Id,
    doctor_id: FICTIONAL_DOCTORS.orthopedics.id,
    doctor_name: FICTIONAL_DOCTORS.orthopedics.name,
    department_name: 'Orthopedics',
    slot_id: 'slot-seeded-01',
    slot_start: new Date(now.getTime() + 86400000).toISOString(),
    slot_end: new Date(now.getTime() + 86400000 + 1800000).toISOString(),
    reference_code: 'APT-20261102-K9X2',
    patient_name: 'Asha Sharma',
    created_at: pastIso2,
    status: 'confirmed',
  };
  mockAppointments.set(apt1.id, apt1);

  // 2. Submitted Not Booked Report (General Medicine)
  const rep2Id = 'rep-gen-seeded-02';
  const rep2: ReportRow = {
    id: rep2Id,
    session_id: 'sess-seeded-02',
    user_id: 'user-anon-02',
    status: 'submitted',
    schema_version: 1,
    department_key: 'general_medicine',
    doctor_id: FICTIONAL_DOCTORS.general_medicine.id,
    intake_reference: 'SHD-20261101-9QW3L1',
    possible_urgent: false,
    needs_human_review: false,
    emergency_rule_id: null,
    submitted_at: pastIso,
    reviewed_at: null,
    reviewed_by: null,
    created_at: pastIso,
    updated_at: pastIso,
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Rohan Deshmukh' },
        age: { status: 'provided', value: 45 },
        gender: { status: 'provided', value: 'male' },
        language: 'en',
      },
      primary_concern: { status: 'provided', value: 'Low grade recurring evening fever and body ache' },
      clinical_details: {
        duration: { status: 'provided', value: '5 days' },
        severity: { status: 'provided', value: 'Mild' },
        conditions: { status: 'provided', value: [] },
        medications: { status: 'provided', value: ['Paracetamol as needed'] },
        allergies: { status: 'unknown', value: null },
        other_symptoms: { status: 'provided', value: ['Fatigue and mild headache'] },
      },
      missing_information: ['clinical_details.allergies'],
      summary: {
        text: 'Patient reports recurring evening fever and fatigue for 5 days. Taking paracetamol with temporary relief. No reported drug allergies.',
        source: 'template',
        generated_from: ['primary_concern', 'clinical_details.duration', 'clinical_details.severity', 'clinical_details.medications', 'clinical_details.other_symptoms'],
      },
      routing_snapshot: {
        department_key: 'general_medicine',
        department_name: 'General Medicine',
        doctor_id: FICTIONAL_DOCTORS.general_medicine.id,
        doctor_name: 'Dr. Aditi Rao',
        is_fallback: true,
        preliminary: true,
      },
      emergency: null,
    },
  };
  mockReports.set(rep2Id, rep2);

  // 3. Urgent Partial Report (Emergency)
  const rep3Id = 'rep-emg-seeded-03';
  const rep3: ReportRow = {
    id: rep3Id,
    session_id: 'sess-seeded-03',
    user_id: 'user-anon-03',
    status: 'urgent_partial',
    schema_version: 1,
    department_key: 'emergency',
    doctor_id: FICTIONAL_DOCTORS.emergency.id,
    intake_reference: 'SHD-20261101-EMG881',
    possible_urgent: true,
    needs_human_review: false,
    emergency_rule_id: 'severe_chest_pain',
    submitted_at: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: pastIso,
    updated_at: pastIso,
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Vikas Malhotra' },
        age: { status: 'provided', value: 52 },
        gender: { status: 'provided', value: 'male' },
        language: 'en',
      },
      primary_concern: { status: 'provided', value: 'Heavy crushing pressure in center of chest' },
      clinical_details: {
        duration: { status: 'not_asked', value: null },
        severity: { status: 'not_asked', value: null },
        conditions: { status: 'not_asked', value: null },
        medications: { status: 'not_asked', value: null },
        allergies: { status: 'not_asked', value: null },
        other_symptoms: { status: 'not_asked', value: null },
      },
      missing_information: [
        'clinical_details.duration',
        'clinical_details.severity',
        'clinical_details.conditions',
        'clinical_details.medications',
        'clinical_details.allergies',
        'clinical_details.other_symptoms',
      ],
      summary: null, // per RD-10, urgent_partial summary is null
      routing_snapshot: {
        department_key: 'emergency',
        department_name: 'Emergency',
        doctor_id: FICTIONAL_DOCTORS.emergency.id,
        doctor_name: 'Dr. Neha Verma',
        is_fallback: false,
        preliminary: true,
      },
      emergency: {
        rule_id: 'severe_chest_pain',
        patient_statement: 'Heavy crushing pressure in center of chest with cold sweat',
        triggered_at: pastIso,
      },
    },
  };
  mockReports.set(rep3Id, rep3);

  // Stored patient answers for the demo fixtures. These are conversation-level rows,
  // not generated from the report fields at render time.
  const seededAt = pastIso2;
  mockSeededMessages.set(rep1Id, [
    { id: 'msg-seeded-01-1', role: 'patient', question_id: 'name', original_text: 'Asha Sharma', final_text: 'Asha Sharma', input_mode: 'voice', turn_index: 1, created_at: seededAt },
    { id: 'msg-seeded-01-2', role: 'patient', question_id: 'age', original_text: null, final_text: '38', input_mode: 'text', turn_index: 2, created_at: seededAt },
    { id: 'msg-seeded-01-3', role: 'patient', question_id: 'gender', original_text: null, final_text: 'Female', input_mode: 'text', turn_index: 3, created_at: seededAt },
    { id: 'msg-seeded-01-4', role: 'patient', question_id: 'primary_concern', original_text: 'sharp pain in right knee when climbing stairs', final_text: 'Persistent sharp pain in right knee when climbing stairs', input_mode: 'voice', turn_index: 4, created_at: seededAt },
    { id: 'msg-seeded-01-5', role: 'patient', question_id: 'duration', original_text: null, final_text: '3 weeks', input_mode: 'text', turn_index: 5, created_at: seededAt },
    { id: 'msg-seeded-01-6', role: 'patient', question_id: 'severity', original_text: null, final_text: 'Moderate, worse in the evening', input_mode: 'text', turn_index: 6, created_at: seededAt },
    { id: 'msg-seeded-01-7', role: 'patient', question_id: 'conditions', original_text: null, final_text: 'High blood pressure', input_mode: 'text', turn_index: 7, created_at: seededAt },
    { id: 'msg-seeded-01-8', role: 'patient', question_id: 'other_symptoms', original_text: null, final_text: 'Mild local swelling around knee cap', input_mode: 'text', turn_index: 8, created_at: seededAt },
  ]);
  mockSeededMessages.set(rep2Id, [
    { id: 'msg-seeded-02-1', role: 'patient', question_id: 'name', original_text: null, final_text: 'Rohan Deshmukh', input_mode: 'text', turn_index: 1, created_at: seededAt },
    { id: 'msg-seeded-02-2', role: 'patient', question_id: 'age', original_text: null, final_text: '45', input_mode: 'text', turn_index: 2, created_at: seededAt },
    { id: 'msg-seeded-02-3', role: 'patient', question_id: 'gender', original_text: null, final_text: 'Male', input_mode: 'text', turn_index: 3, created_at: seededAt },
    { id: 'msg-seeded-02-4', role: 'patient', question_id: 'primary_concern', original_text: 'evening fever and body ache for five days', final_text: 'Low grade recurring evening fever and body ache', input_mode: 'voice', turn_index: 4, created_at: seededAt },
    { id: 'msg-seeded-02-5', role: 'patient', question_id: 'duration', original_text: null, final_text: '5 days', input_mode: 'text', turn_index: 5, created_at: seededAt },
    { id: 'msg-seeded-02-6', role: 'patient', question_id: 'severity', original_text: null, final_text: 'Mild', input_mode: 'text', turn_index: 6, created_at: seededAt },
    { id: 'msg-seeded-02-7', role: 'patient', question_id: 'GM-002', original_text: null, final_text: 'It comes and goes, mostly in the evening', input_mode: 'text', turn_index: 7, created_at: seededAt },
    { id: 'msg-seeded-02-8', role: 'patient', question_id: 'medications', original_text: null, final_text: 'Paracetamol as needed', input_mode: 'text', turn_index: 8, created_at: seededAt },
    { id: 'msg-seeded-02-9', role: 'patient', question_id: 'other_symptoms', original_text: null, final_text: 'Fatigue and mild headache', input_mode: 'text', turn_index: 9, created_at: seededAt },
  ]);
  mockSeededMessages.set(rep3Id, [
    { id: 'msg-seeded-03-1', role: 'patient', question_id: 'name', original_text: null, final_text: 'Vikas Malhotra', input_mode: 'text', turn_index: 1, created_at: seededAt },
    { id: 'msg-seeded-03-2', role: 'patient', question_id: 'age', original_text: null, final_text: '52', input_mode: 'text', turn_index: 2, created_at: seededAt },
    { id: 'msg-seeded-03-3', role: 'patient', question_id: 'gender', original_text: null, final_text: 'Male', input_mode: 'text', turn_index: 3, created_at: seededAt },
  ]);
}

initSeedReports();

// -------------------------------------------------------------
// Emergency Matching (docs/demo-emergency-rules.md)
// -------------------------------------------------------------
const EMERGENCY_RULES = [
  {
    id: 'severe_chest_pain',
    patterns: [
      /chest pain/i,
      /pressure in (my )?chest/i,
      /crushing chest/i,
      /heavy chest/i,
      /सीने में (बहुत )?तेज दर्द/i,
      /छाती में तेज दबाव/i,
      /सीने में भारीपन/i,
    ],
  },
  {
    id: 'breathing_emergency',
    patterns: [
      /cannot breathe/i,
      /can't breathe/i,
      /difficulty breathing/i,
      /struggling to breathe/i,
      /सांस नहीं आ रही/i,
      /साँस लेने में बहुत तकलीफ़/i,
      /सांस लेने में दिक्कत/i,
    ],
  },
  {
    id: 'stroke_signs',
    patterns: [
      /face (is )?drooping/i,
      /one side (of my body )?feels weak/i,
      /cannot speak clearly/i,
      /slurred speech/i,
      /चेहरा टेढ़ा/i,
      /शरीर के एक तरफ कमजोर/i,
      /बोलने में दिक्कत/i,
    ],
  },
  {
    id: 'unresponsive_or_unconscious',
    patterns: [
      /unconscious/i,
      /cannot wake (them|him|her)/i,
      /not responding/i,
      /बेहोश/i,
      /होश नहीं है/i,
    ],
  },
  {
    id: 'uncontrolled_bleeding',
    patterns: [
      /bleeding will not stop/i,
      /losing a lot of blood/i,
      /severe bleeding/i,
      /खून बंद नहीं हो रहा/i,
      /बहुत ज्यादा खून बह रहा/i,
    ],
  },
  {
    id: 'seizure_or_convulsion',
    patterns: [
      /seizure/i,
      /convulsion/i,
      /uncontrollable shaking/i,
      /दौरा पड़ रहा/i,
      /झटके आ रहे/i,
    ],
  },
  {
    id: 'severe_allergic_reaction',
    patterns: [
      /throat swelling/i,
      /tongue swelling/i,
      /anaphylaxis/i,
      /गले में सूजन/i,
      /जीभ में सूजन/i,
    ],
  },
  {
    id: 'poisoning_or_overdose',
    patterns: [
      /poison/i,
      /overdose/i,
      /too much medicine/i,
      /ज़हर/i,
      /दवा की बहुत ज्यादा मात्रा/i,
    ],
  },
];

function isNegated(text: string): boolean {
  return (
    /\b(no|not|neither|nor|without|never|don't|do not)\b/i.test(text) ||
    /नहीं/i.test(text) ||
    /दर्द नहीं/i.test(text)
  );
}

function checkEmergencyPhrase(text: string): { matched: boolean; ruleId?: string } {
  if (isNegated(text)) {
    return { matched: false };
  }
  for (const rule of EMERGENCY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return { matched: true, ruleId: rule.id };
      }
    }
  }
  return { matched: false };
}

function suggestDepartment(concern: string): DepartmentKey {
  const lower = concern.toLowerCase();
  if (lower.includes('knee') || lower.includes('bone') || lower.includes('fracture') || lower.includes('joint') || lower.includes('back pain') || lower.includes('shoulder')) {
    return 'orthopedics';
  }
  if (lower.includes('skin') || lower.includes('rash') || lower.includes('itching') || lower.includes('acne') || lower.includes('eczema')) {
    return 'dermatology';
  }
  if (lower.includes('heart') || lower.includes('palpitation') || lower.includes('blood pressure')) {
    return 'cardiology';
  }
  if (lower.includes('hernia') || lower.includes('appendix') || lower.includes('gallbladder') || lower.includes('lump')) {
    return 'general_surgery';
  }
  return 'general_medicine';
}

function buildDraftReport(session: SessionState): ReportDocumentV1 {
  const data = session.collectedData;
  const deptKey = session.preliminaryDepartment || suggestDepartment(data.primary_concern || '');
  const doctor = FICTIONAL_DOCTORS[deptKey];

  const missing: string[] = [];
  if (!data.conditions || data.conditions.length === 0) missing.push('clinical_details.conditions');
  if (!data.medications || data.medications.length === 0) missing.push('clinical_details.medications');
  if (!data.allergies || data.allergies.length === 0) missing.push('clinical_details.allergies');
  if (!data.other_symptoms || data.other_symptoms.length === 0) missing.push('clinical_details.other_symptoms');

  const summaryText = `Patient ${data.name || 'Anonymous'} (${data.age || 'Unknown'} yrs, ${data.gender || 'Not specified'}) reports "${data.primary_concern || 'symptom'}". Duration: ${data.duration || 'Not specified'}. Severity: ${data.severity || 'Not specified'}.${data.conditions?.length ? ` Known conditions: ${data.conditions.join(', ')}.` : ''}${data.medications?.length ? ` Medications: ${data.medications.join(', ')}.` : ''}`;

  return {
    schema_version: 1,
    patient: {
      name: { status: data.name ? 'provided' : 'not_provided', value: data.name || null },
      age: { status: data.age ? 'provided' : 'not_provided', value: data.age || null },
      gender: {
        status:
          data.gender === 'Prefer not to say' || data.gender === 'declined'
            ? 'declined'
            : data.gender
            ? 'provided'
            : 'not_provided',
        value:
          data.gender === 'Prefer not to say' || data.gender === 'declined' || !data.gender
            ? null
            : (['male', 'female', 'other'].includes(data.gender.toLowerCase())
                ? (data.gender.toLowerCase() as any)
                : 'other'),
      },
      language: session.language,
    },
    primary_concern: { status: data.primary_concern ? 'provided' : 'not_provided', value: data.primary_concern || null },
    clinical_details: {
      duration: { status: data.duration ? 'provided' : 'not_provided', value: data.duration || null },
      severity: { status: data.severity ? 'provided' : 'not_provided', value: data.severity || null },
      conditions: { status: data.conditions?.length ? 'provided' : 'declined', value: data.conditions || null },
      medications: { status: data.medications?.length ? 'provided' : 'declined', value: data.medications || null },
      allergies: { status: data.allergies?.length ? 'provided' : 'declined', value: data.allergies || null },
      other_symptoms: { status: data.other_symptoms?.length ? 'provided' : 'declined', value: data.other_symptoms || null },
    },
    missing_information: missing,
    summary: {
      text: summaryText,
      source: 'template',
      generated_from: ['primary_concern', 'clinical_details.duration', 'clinical_details.severity'],
    },
    routing_snapshot: {
      department_key: deptKey,
      department_name: doctor.department_name,
      doctor_id: doctor.id,
      doctor_name: doctor.name,
      is_fallback: deptKey === 'general_medicine',
      preliminary: true,
    },
    emergency: null,
  };
}

function isSessionComplete(session: SessionState): boolean {
  const d = session.collectedData;
  if (!d.name || !d.age || !d.gender || !d.primary_concern || !d.duration || !d.severity) {
    return false;
  }
  if (d.conditions === undefined || d.medications === undefined || d.allergies === undefined || d.other_symptoms === undefined) {
    return false;
  }
  return true;
}

// -------------------------------------------------------------
// Exported API Functions (AGENTS.md Contract)
// -------------------------------------------------------------

export async function startAnonymousSession(language: 'en' | 'hi' = 'en'): Promise<{ sessionId: string; userId: string }> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const { data: authData, error: authErr } = await client.auth.signInAnonymously();
    if (authErr || !authData.user) {
      throw new ApiError(
        `Anonymous authentication failed: ${authErr?.message || 'Unknown error'}`,
        'auth_failed',
      );
    }
    const data = await invokeFunction<ChatTurnResponse>('chat-turn', {
      action: 'start_session',
      language,
    });
    if (data.demo_busy) {
      throw new ApiError('demo_busy', 'demo_busy');
    }
    return { sessionId: data.session_id, userId: authData.user.id };
  }

  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const userId = `usr-anon-${Math.random().toString(36).substring(2, 9)}`;

  const session: SessionState = {
    sessionId,
    userId,
    language,
    sessionStatus: 'created',
    consentGranted: false,
    turnCount: 0,
    currentQuestionIndex: 0,
    preliminaryDepartment: undefined,
    currentAdaptiveQuestionId: undefined,
    adaptiveAskedIds: [],
    adaptiveAnswersCount: 0,
    messages: [],
    pendingAmbiguousEmergency: false,
    collectedData: {},
  };

  mockSessions.set(sessionId, session);
  return { sessionId, userId };
}

let mockDailyCapExceeded = false;
export function setMockDailyCapExceeded(exceeded: boolean) {
  mockDailyCapExceeded = exceeded;
}

export async function startSession(language: 'en' | 'hi' = 'en'): Promise<ChatTurnResponse> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session?.user) {
      const { error: authErr } = await client.auth.signInAnonymously();
      if (authErr) throw new ApiError(`Anonymous authentication failed: ${authErr.message}`, 'auth_failed');
    }
    return invokeFunction<ChatTurnResponse>('chat-turn', { action: 'start_session', language });
  }

  if (mockDailyCapExceeded) {
    return {
      session_id: '',
      session_status: 'created',
      messages: [],
      turn_count: 0,
      max_turns: 15,
      is_complete: false,
      is_cap_reached: false,
      can_submit: false,
      demo_busy: true,
      error: 'demo_busy',
    };
  }

  const { sessionId } = await startAnonymousSession(language);
  const session = mockSessions.get(sessionId)!;

  return {
    session_id: sessionId,
    session_status: session.sessionStatus,
    messages: session.messages,
    turn_count: 0,
    max_turns: 15,
    is_complete: false,
    is_cap_reached: false,
    can_submit: false,
  };
}

export async function resumeSession(sessionId: string): Promise<ChatTurnResponse> {
  if (currentAppMode === 'supabase') {
    return invokeFunction<ChatTurnResponse>('chat-turn', {
      action: 'resume_session',
      session_id: sessionId,
    });
  }

  const session = mockSessions.get(sessionId);
  if (!session) {
    // The backend returns 404 not_found for an unknown or foreign session. Never
    // silently start a new session here: that would hide a lost identity behind a
    // fresh empty intake and consume another session-cap slot.
    throw new ApiError('not_found', 'not_found', 404);
  }

  let currentQ: ChatTurnResponse['current_question'] = undefined;

  if (session.currentAdaptiveQuestionId) {
    const mockQ = getMockAdaptiveQuestion(session.currentAdaptiveQuestionId);
    if (mockQ) {
      currentQ = {
        id: mockQ.id,
        text: session.language === 'hi' ? mockQ.hi : mockQ.en,
        text_hi: mockQ.hi,
        options: session.language === 'hi' ? mockQ.optionsHi : mockQ.optionsEn,
        is_ambiguous_emergency: false,
        answer_type: mockQ.answerType,
      };
    }
  } else if (session.currentQuestionIndex < QUESTION_SPECS.length) {
    const spec = QUESTION_SPECS[session.currentQuestionIndex];
    currentQ = {
      id: spec.id,
      text: session.language === 'hi' ? spec.textHi : spec.textEn,
      text_hi: spec.textHi,
      options: session.language === 'hi' ? spec.optionsHi : spec.optionsEn,
      is_ambiguous_emergency: spec.id === 'emergency_clarification',
    };
  }

  const isSatisfied = isSessionComplete(session);
  const isCompleteState = isSatisfied && !session.currentAdaptiveQuestionId;

  return {
    session_id: sessionId,
    session_status: session.sessionStatus,
    current_question: currentQ,
    messages: session.messages,
    turn_count: session.turnCount,
    max_turns: 15,
    is_complete: isCompleteState,
    is_cap_reached: session.turnCount >= 15,
    can_submit: isCompleteState && session.turnCount <= 15,
    draft_report: session.draftReport,
    submitted_report: session.submittedReport,
  };
}

export async function recordConsent(
  sessionId: string,
  consent: boolean,
  language: 'en' | 'hi',
  consentVersion: string = CONSENT_VERSION,
): Promise<ChatTurnResponse> {
  if (currentAppMode === 'supabase') {
    return invokeFunction<ChatTurnResponse>('chat-turn', {
      action: 'record_consent',
      session_id: sessionId,
      consent,
      consent_version: consentVersion,
      language,
    });
  }

  const session = mockSessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // D-11: consent is idempotent. Re-agreeing after Back must never reset the question
  // pointer or duplicate the first assistant message.
  if (consent && (session.sessionStatus === 'in_progress' || session.sessionStatus === 'consented')) {
    return resumeSession(sessionId);
  }

  session.language = language;
  session.consentGranted = consent;
  session.consentVersion = consentVersion;
  session.sessionStatus = consent ? 'consented' : 'declined';

  if (!consent) {
    return {
      session_id: sessionId,
      session_status: 'declined',
      messages: session.messages,
      turn_count: session.turnCount,
      max_turns: 15,
      is_complete: false,
      is_cap_reached: false,
      can_submit: false,
    };
  }

  // If consented, advance to first question (name)
  session.sessionStatus = 'in_progress';
  session.currentQuestionIndex = 0;
  const firstQ = QUESTION_SPECS[0];

  const firstMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    session_id: sessionId,
    role: 'assistant',
    content: session.language === 'hi' ? firstQ.textHi : firstQ.textEn,
    question_id: firstQ.id,
    created_at: new Date().toISOString(),
    turn_index: 0,
  };
  session.messages.push(firstMsg);

  return {
    session_id: sessionId,
    session_status: session.sessionStatus,
    current_question: {
      id: firstQ.id,
      text: session.language === 'hi' ? firstQ.textHi : firstQ.textEn,
      text_hi: firstQ.textHi,
      options: session.language === 'hi' ? firstQ.optionsHi : firstQ.optionsEn,
      is_ambiguous_emergency: false,
    },
    messages: session.messages,
    turn_count: 0,
    max_turns: 15,
    is_complete: false,
    is_cap_reached: false,
    can_submit: false,
  };
}

export async function chatTurn(action: SubmitTurnAction): Promise<ChatTurnResponse> {
  if (currentAppMode === 'supabase') {
    return invokeFunction<ChatTurnResponse>('chat-turn', {
      action: 'submit_turn',
      session_id: action.session_id,
      question_id: action.question_id,
      ...(action.text !== undefined ? { text: action.text } : {}),
      ...(action.audio_base64 !== undefined ? { audio_base64: action.audio_base64 } : {}),
      ...(action.audio_format !== undefined ? { audio_format: action.audio_format } : {}),
    });
  }

  const session = mockSessions.get(action.session_id);
  if (!session) {
    throw new Error('Session not found');
  }

  // Handle audio preview request per agreed backend contract (transcript_preview)
  if (action.audio_base64) {
    let simulatedVoiceAnswer = 'I have mild pain since yesterday';
    const qId = action.question_id;
    if (qId === 'name') simulatedVoiceAnswer = 'Pooja Verma';
    else if (qId === 'age') simulatedVoiceAnswer = '29';
    else if (qId === 'gender') simulatedVoiceAnswer = 'Female';
    else if (qId === 'primary_concern') simulatedVoiceAnswer = 'Sharp knee pain while walking';
    else if (qId === 'duration') simulatedVoiceAnswer = 'About 2 weeks';
    else if (qId === 'severity') simulatedVoiceAnswer = 'Moderate';
    else if (qId === 'conditions') simulatedVoiceAnswer = 'None known';
    else if (qId === 'medications') simulatedVoiceAnswer = 'None';
    else if (qId === 'allergies') simulatedVoiceAnswer = 'None known';
    else if (qId === 'other_symptoms') simulatedVoiceAnswer = 'Mild swelling around the knee';
    else {
      const mockQ = getMockAdaptiveQuestion(qId as string);
      if (mockQ) {
        const opts = session.language === 'hi' ? mockQ.optionsHi : mockQ.optionsEn;
        simulatedVoiceAnswer = opts && opts.length > 0 ? opts[0] : (session.language === 'hi' ? 'नहीं' : 'No');
      }
    }

    let currentQ: ChatTurnResponse['current_question'] = undefined;
    if (session.currentAdaptiveQuestionId) {
      const mockQ = getMockAdaptiveQuestion(session.currentAdaptiveQuestionId);
      if (mockQ) {
        currentQ = {
          id: mockQ.id,
          text: session.language === 'hi' ? mockQ.hi : mockQ.en,
          text_hi: mockQ.hi,
          options: session.language === 'hi' ? mockQ.optionsHi : mockQ.optionsEn,
          is_ambiguous_emergency: false,
          answer_type: mockQ.answerType,
        };
      }
    } else if (session.currentQuestionIndex < QUESTION_SPECS.length) {
      const spec = QUESTION_SPECS[session.currentQuestionIndex];
      currentQ = {
        id: spec.id,
        text: session.language === 'hi' ? spec.textHi : spec.textEn,
        text_hi: spec.textHi,
        options: session.language === 'hi' ? spec.optionsHi : spec.optionsEn,
        is_ambiguous_emergency: spec.id === 'emergency_clarification',
      };
    }

    return {
      session_id: session.sessionId,
      session_status: session.sessionStatus,
      current_question: currentQ,
      messages: session.messages,
      turn_count: session.turnCount, // unchanged while in transcript_preview state
      max_turns: 15,
      is_complete: false,
      is_cap_reached: session.turnCount >= 15,
      can_submit: false,
      transcript_preview: {
        state: 'transcript_preview',
        text: simulatedVoiceAnswer,
        question_id: action.question_id,
      },
    };
  }

  // Text phase
  const patientText = (action.text || '').trim();

  // Add patient message to log
  session.turnCount += 1;
  const pMsg: ChatMessage = {
    id: `msg-${Date.now()}-p`,
    session_id: session.sessionId,
    role: 'patient',
    content: patientText,
    question_id: action.question_id,
    created_at: new Date().toISOString(),
    turn_index: session.turnCount,
  };
  session.messages.push(pMsg);

  // Check 1: Did we ask the ambiguous emergency clarification question?
  if (action.question_id === 'emergency_clarification') {
    if (patientText.toLowerCase() === 'yes' || patientText === 'हाँ') {
      // Confirmed emergency
      session.sessionStatus = 'emergency';
      const emgReport: ReportRow = {
        id: `rep-${Date.now()}-emg`,
        session_id: session.sessionId,
        user_id: session.userId,
        status: 'urgent_partial',
        schema_version: 1,
        department_key: 'emergency',
        doctor_id: FICTIONAL_DOCTORS.emergency.id,
        intake_reference: generateReferenceCode('SHD-EMG'),
        possible_urgent: true,
        needs_human_review: false,
        emergency_rule_id: 'clarified_emergency',
        submitted_at: null,
        reviewed_at: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        report: {
          schema_version: 1,
          patient: {
            name: { status: session.collectedData.name ? 'provided' : 'not_asked', value: session.collectedData.name || null },
            age: { status: session.collectedData.age ? 'provided' : 'not_asked', value: session.collectedData.age || null },
            gender: { status: 'not_asked', value: null },
            language: session.language,
          },
          primary_concern: { status: 'provided', value: session.collectedData.primary_concern || patientText },
          clinical_details: {
            duration: { status: 'not_asked', value: null },
            severity: { status: 'not_asked', value: null },
            conditions: { status: 'not_asked', value: null },
            medications: { status: 'not_asked', value: null },
            allergies: { status: 'not_asked', value: null },
            other_symptoms: { status: 'not_asked', value: null },
          },
          missing_information: [
            'clinical_details.duration',
            'clinical_details.severity',
            'clinical_details.conditions',
            'clinical_details.medications',
            'clinical_details.allergies',
            'clinical_details.other_symptoms',
          ],
          summary: null,
          routing_snapshot: {
            department_key: 'emergency',
            department_name: 'Emergency',
            doctor_id: FICTIONAL_DOCTORS.emergency.id,
            doctor_name: 'Dr. Neha Verma',
            is_fallback: false,
            preliminary: true,
          },
          emergency: {
            rule_id: 'clarified_emergency',
            patient_statement: patientText,
            triggered_at: new Date().toISOString(),
          },
        },
      };
      mockReports.set(emgReport.id, emgReport);
      session.submittedReport = emgReport;

      return {
        session_id: session.sessionId,
        session_status: 'emergency',
        messages: session.messages,
        turn_count: session.turnCount,
        max_turns: 15,
        is_complete: false,
        is_cap_reached: false,
        can_submit: false,
        emergency_triggered: true,
      };
    } else {
      // Negated emergency -> continue routine intake
      session.pendingAmbiguousEmergency = false;
    }
  }

  // Check 2: Check deterministic emergency starter rules on current text
  const emgCheck = checkEmergencyPhrase(patientText);
  if (emgCheck.matched) {
    session.sessionStatus = 'emergency';
    const emgReport: ReportRow = {
      id: `rep-${Date.now()}-emg`,
      session_id: session.sessionId,
      user_id: session.userId,
      status: 'urgent_partial',
      schema_version: 1,
      department_key: 'emergency',
      doctor_id: FICTIONAL_DOCTORS.emergency.id,
      intake_reference: generateReferenceCode('SHD-EMG'),
      possible_urgent: true,
      needs_human_review: false,
      emergency_rule_id: emgCheck.ruleId || 'urgent_rule',
      submitted_at: null,
      reviewed_at: null,
      reviewed_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      report: {
        schema_version: 1,
        patient: {
          name: { status: session.collectedData.name ? 'provided' : 'not_asked', value: session.collectedData.name || null },
          age: { status: session.collectedData.age ? 'provided' : 'not_asked', value: session.collectedData.age || null },
          gender: { status: 'not_asked', value: null },
          language: session.language,
        },
        primary_concern: { status: 'provided', value: patientText },
        clinical_details: {
          duration: { status: 'not_asked', value: null },
          severity: { status: 'not_asked', value: null },
          conditions: { status: 'not_asked', value: null },
          medications: { status: 'not_asked', value: null },
          allergies: { status: 'not_asked', value: null },
          other_symptoms: { status: 'not_asked', value: null },
        },
        missing_information: [
          'clinical_details.duration',
          'clinical_details.severity',
          'clinical_details.conditions',
          'clinical_details.medications',
          'clinical_details.allergies',
          'clinical_details.other_symptoms',
        ],
        summary: null,
        routing_snapshot: {
          department_key: 'emergency',
          department_name: 'Emergency',
          doctor_id: FICTIONAL_DOCTORS.emergency.id,
          doctor_name: 'Dr. Neha Verma',
          is_fallback: false,
          preliminary: true,
        },
        emergency: {
          rule_id: emgCheck.ruleId || 'urgent_rule',
          patient_statement: patientText,
          triggered_at: new Date().toISOString(),
        },
      },
    };
    mockReports.set(emgReport.id, emgReport);
    session.submittedReport = emgReport;

    return {
      session_id: session.sessionId,
      session_status: 'emergency',
      messages: session.messages,
      turn_count: session.turnCount,
      max_turns: 15,
      is_complete: false,
      is_cap_reached: false,
      can_submit: false,
      emergency_triggered: true,
    };
  }

  // Save answer to collectedData
  const qId = action.question_id || QUESTION_SPECS[session.currentQuestionIndex]?.id;
  if (qId === 'name') session.collectedData.name = patientText;
  else if (qId === 'age') {
    const parsed = parseInt(patientText.replace(/\D/g, ''), 10);
    session.collectedData.age = isNaN(parsed) ? 35 : parsed;
  } else if (qId === 'gender') {
    const gLower = patientText.toLowerCase();
    if (gLower.includes('female') || gLower.includes('महिला') || gLower === 'f') {
      session.collectedData.gender = 'Female';
    } else if (gLower.includes('male') || gLower.includes('पुरुष') || gLower === 'm') {
      session.collectedData.gender = 'Male';
    } else if (gLower.includes('other') || gLower.includes('अन्य')) {
      session.collectedData.gender = 'Other';
    } else if (gLower.includes('prefer not to say') || gLower.includes('बताना नहीं चाहते')) {
      session.collectedData.gender = 'Prefer not to say';
    } else {
      // Invalid gender value leaves field undefined so report remains incomplete
      session.collectedData.gender = undefined;
    }
  } else if (qId === 'primary_concern') {
    session.collectedData.primary_concern = patientText;
    session.preliminaryDepartment = suggestDepartment(patientText);
  } else if (qId === 'duration') session.collectedData.duration = patientText;
  else if (qId === 'severity') session.collectedData.severity = patientText;
  else if (qId === 'conditions') {
    session.collectedData.conditions = patientText.toLowerCase().includes('none') ? [] : [patientText];
  } else if (qId === 'medications') {
    session.collectedData.medications = patientText.toLowerCase().includes('none') ? [] : [patientText];
  } else if (qId === 'allergies') {
    session.collectedData.allergies = patientText.toLowerCase().includes('none') ? [] : [patientText];
  } else if (qId === 'other_symptoms') {
    session.collectedData.other_symptoms = patientText.toLowerCase().includes('none') || patientText.toLowerCase().includes('no') ? [] : [patientText];
  } else {
    // Check if answering a mock adaptive question
    const mockQ = getMockAdaptiveQuestion(qId as string);
    if (mockQ) {
      session.adaptiveAnswersCount += 1;
      if (mockQ.field.includes('duration')) session.collectedData.duration = patientText;
      else if (mockQ.field.includes('severity')) session.collectedData.severity = patientText;
      else if (mockQ.field.includes('conditions')) {
        session.collectedData.conditions = [...(session.collectedData.conditions || []), patientText];
      } else if (mockQ.field.includes('medications')) {
        session.collectedData.medications = [...(session.collectedData.medications || []), patientText];
      } else if (mockQ.field.includes('allergies')) {
        session.collectedData.allergies = [...(session.collectedData.allergies || []), patientText];
      } else if (mockQ.field.includes('other_symptoms')) {
        session.collectedData.other_symptoms = [...(session.collectedData.other_symptoms || []), patientText];
      }
      session.currentAdaptiveQuestionId = undefined;
    }
  }

  // Advance question pointer if answering the currently asked question
  if (QUESTION_SPECS[session.currentQuestionIndex]?.id === qId) {
    session.currentQuestionIndex += 1;
  }

  const isSatisfied = isSessionComplete(session);

  // Check 15-turn boundary
  if (session.turnCount >= 15) {
    session.draftReport = buildDraftReport(session);

    return {
      session_id: session.sessionId,
      session_status: session.sessionStatus,
      messages: session.messages,
      turn_count: session.turnCount,
      max_turns: 15,
      is_complete: isSatisfied,
      is_cap_reached: true,
      can_submit: isSatisfied,
      draft_report: session.draftReport,
    };
  }

  // If scripted questions remain, ask next scripted question
  if (session.currentQuestionIndex < QUESTION_SPECS.length) {
    const nextQ = QUESTION_SPECS[session.currentQuestionIndex];
    const nextMsg: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      session_id: session.sessionId,
      role: 'assistant',
      content: session.language === 'hi' ? nextQ.textHi : nextQ.textEn,
      question_id: nextQ.id,
      created_at: new Date().toISOString(),
      turn_index: session.turnCount,
    };
    session.messages.push(nextMsg);

    return {
      session_id: session.sessionId,
      session_status: session.sessionStatus,
      current_question: {
        id: nextQ.id,
        text: session.language === 'hi' ? nextQ.textHi : nextQ.textEn,
        text_hi: nextQ.textHi,
        options: session.language === 'hi' ? nextQ.optionsHi : nextQ.optionsEn,
        is_ambiguous_emergency: false,
      },
      messages: session.messages,
      turn_count: session.turnCount,
      max_turns: 15,
      is_complete: false,
      is_cap_reached: false,
      can_submit: false,
    };
  }

  // Scripted questions finished. Check if adaptive question should run:
  const deptKey = session.preliminaryDepartment || suggestDepartment(session.collectedData.primary_concern || '');
  session.preliminaryDepartment = deptKey;

  if (!isSatisfied && session.adaptiveAnswersCount < 3 && session.turnCount < 15) {
    const candidates = getMockCandidates(deptKey, session.adaptiveAskedIds);
    const nextMockQ = candidates[0];

    if (nextMockQ) {
      session.currentAdaptiveQuestionId = nextMockQ.id;
      session.adaptiveAskedIds.push(nextMockQ.id);

      const nextMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        session_id: session.sessionId,
        role: 'assistant',
        content: session.language === 'hi' ? nextMockQ.hi : nextMockQ.en,
        question_id: nextMockQ.id,
        created_at: new Date().toISOString(),
        turn_index: session.turnCount,
      };
      session.messages.push(nextMsg);

      return {
        session_id: session.sessionId,
        session_status: session.sessionStatus,
        current_question: {
          id: nextMockQ.id,
          text: nextMockQ.en,
          text_hi: nextMockQ.hi,
          options: session.language === 'hi' ? nextMockQ.optionsHi : nextMockQ.optionsEn,
          is_ambiguous_emergency: false,
          answer_type: nextMockQ.answerType,
        },
        messages: session.messages,
        turn_count: session.turnCount,
        max_turns: 15,
        is_complete: false,
        is_cap_reached: false,
        can_submit: false,
      };
    }
  }

  // Intake complete
  session.draftReport = buildDraftReport(session);
  return {
    session_id: session.sessionId,
    session_status: session.sessionStatus,
    messages: session.messages,
    turn_count: session.turnCount,
    max_turns: 15,
    is_complete: isSatisfied,
    is_cap_reached: false,
    can_submit: isSatisfied,
    draft_report: session.draftReport,
  };
}

export async function correctDraftReport(action: CorrectDraftReportAction): Promise<ChatTurnResponse> {
  if (currentAppMode === 'supabase') {
    const reportId = isUuid(action.report_id) ? action.report_id : undefined;
    return invokeFunction<ChatTurnResponse>('chat-turn', {
      action: 'correct_draft_report',
      session_id: action.session_id,
      // Omitted when the caller only knows the session: neither start_session,
      // resume_session nor submit_turn returns a report row id, and the backend
      // resolves the single report owned by the session.
      ...(reportId ? { report_id: reportId } : {}),
      updates: action.updates,
    });
  }

  const session = mockSessions.get(action.session_id);
  if (!session || !session.draftReport) {
    throw new Error('Draft report not found');
  }

  // Apply allowlisted field updates only (matching backend applyCorrections)
  for (const [key, val] of Object.entries(action.updates)) {
    const fKey = key as CorrectableField;
    if (!CORRECTABLE_FIELDS.includes(fKey)) {
      continue;
    }
    const status = val?.status;
    if (status !== 'provided' && status !== 'declined') {
      continue;
    }

    if (status === 'declined') {
      // Non-declinable check (gender is the only permitted exception)
      if (NON_DECLINABLE_FIELDS.includes(fKey)) {
        continue; // rejected
      }
      if (fKey === 'patient.gender') session.collectedData.gender = 'declined';
      if (fKey === 'clinical_details.conditions') session.collectedData.conditions = [];
      if (fKey === 'clinical_details.medications') session.collectedData.medications = [];
      if (fKey === 'clinical_details.allergies') session.collectedData.allergies = [];
      if (fKey === 'clinical_details.other_symptoms') session.collectedData.other_symptoms = [];
      continue;
    }

    // Status is 'provided'
    if (fKey === 'patient.name' && val?.value) session.collectedData.name = String(val.value);
    if (fKey === 'patient.age' && val?.value) {
      const num = typeof val.value === 'string' ? parseInt(val.value, 10) : Number(val.value);
      if (!isNaN(num) && num >= 0 && num <= 120) session.collectedData.age = num;
    }
    if (fKey === 'patient.gender' && val?.value) session.collectedData.gender = String(val.value);
    if (fKey === 'primary_concern' && val?.value) session.collectedData.primary_concern = String(val.value);
    if (fKey === 'clinical_details.duration' && val?.value) session.collectedData.duration = String(val.value);
    if (fKey === 'clinical_details.severity' && val?.value) session.collectedData.severity = String(val.value);
    if (fKey === 'clinical_details.conditions') session.collectedData.conditions = Array.isArray(val?.value) ? val.value : [String(val?.value)];
    if (fKey === 'clinical_details.medications') session.collectedData.medications = Array.isArray(val?.value) ? val.value : [String(val?.value)];
    if (fKey === 'clinical_details.allergies') session.collectedData.allergies = Array.isArray(val?.value) ? val.value : [String(val?.value)];
    if (fKey === 'clinical_details.other_symptoms') session.collectedData.other_symptoms = Array.isArray(val?.value) ? val.value : [String(val?.value)];
  }

  session.draftReport = buildDraftReport(session);

  // A correction can never make an incomplete intake submittable: the backend
  // recomputes can_submit from the rebuilt field map (chat-turn handleCorrectDraft).
  const stillComplete = isSessionComplete(session);

  return {
    session_id: session.sessionId,
    session_status: session.sessionStatus,
    messages: session.messages,
    turn_count: session.turnCount,
    max_turns: 15,
    is_complete: stillComplete,
    is_cap_reached: session.turnCount >= 15,
    can_submit: stillComplete,
    draft_report: session.draftReport,
  };
}

export async function submitReport(action: SubmitReportAction): Promise<ChatTurnResponse> {
  if (currentAppMode === 'supabase') {
    const reportId = isUuid(action.report_id) ? action.report_id : undefined;
    return invokeFunction<ChatTurnResponse>('chat-turn', {
      action: 'submit_report',
      session_id: action.session_id,
      ...(reportId ? { report_id: reportId } : {}),
    });
  }

  const session = mockSessions.get(action.session_id);
  if (!session || !session.draftReport) {
    throw new Error('No draft report to submit');
  }

  session.sessionStatus = 'submitted';
  const deptKey = session.draftReport.routing_snapshot.department_key;
  const doctor = FICTIONAL_DOCTORS[deptKey];
  const refCode = generateReferenceCode('SHD');

  const submitted: ReportRow = {
    id: `rep-${Date.now()}`,
    session_id: session.sessionId,
    user_id: session.userId,
    status: 'submitted',
    schema_version: 1,
    department_key: deptKey,
    doctor_id: doctor.id,
    intake_reference: refCode,
    possible_urgent: false,
    needs_human_review: false,
    emergency_rule_id: null,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    report: session.draftReport,
  };

  mockReports.set(submitted.id, submitted);
  session.submittedReport = submitted;

  return {
    session_id: session.sessionId,
    session_status: 'submitted',
    messages: session.messages,
    turn_count: session.turnCount,
    max_turns: 15,
    is_complete: true,
    is_cap_reached: false,
    can_submit: false,
    submitted_report: submitted,
  };
}

/**
 * Adaptive-question speech.
 *
 * `speak` does not answer with JSON audio: on success it streams audio bytes with the
 * provider content type (`audio/mpeg`, …), and on any cap/failure it answers
 * `{ "text": "..." }`. `functions.invoke` only decodes `application/octet-stream` and
 * `application/pdf` as Blob and falls back to `text()` for everything else, which
 * corrupts audio/mpeg — so the binary path uses a direct authenticated fetch and turns
 * the bytes into an object URL. Cached scripted prompts never reach this function.
 */
export async function speak(sessionId: string, questionId: string): Promise<{ audioUrl?: string; text?: string }> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { audioUrl: undefined };

    const response = await fetch(`${SUPABASE_URL}/functions/v1/speak`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId, question_id: questionId }),
    });

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok || contentType.includes('application/json')) {
      // `{ text }` fallback, or an error body. Never claim audio.
      try {
        const body = (await response.json()) as { text?: string };
        return { audioUrl: undefined, text: typeof body?.text === 'string' ? body.text : undefined };
      } catch {
        return { audioUrl: undefined };
      }
    }

    const blob = await response.blob();
    if (blob.size === 0) return { audioUrl: undefined };
    return { audioUrl: URL.createObjectURL(blob) };
  }

  return { audioUrl: undefined };
}

// -------------------------------------------------------------
// Booking & Doctor Functions (Postgres RPC equivalents in mock)
// -------------------------------------------------------------

export async function getAvailableSlots(
  reportIdOrDoctorId: string,
  dateStrOrDays?: string | number,
): Promise<AppointmentSlot[]> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const days = typeof dateStrOrDays === 'number' ? dateStrOrDays : 14;
    const { data, error } = await client.rpc('get_available_slots', {
      p_report_id: reportIdOrDoctorId,
      p_days: days,
    });
    if (error) {
      if (error.code === '42501') {
        throw new ApiError('Booking paused until a doctor reviews this report.', 'review_hold', 403);
      }
      if (error.code === '22023') {
        throw new ApiError('Not eligible for routine booking.', 'not_bookable', 422);
      }
      if (error.code === 'P0002') {
        throw new ApiError('Report not found or not owned.', 'not_found', 404);
      }
      if (error.code === '28000') {
        throw new ApiError('Not authenticated.', 'unauthorized', 401);
      }
      throw new ApiError(error.message || 'Failed to retrieve available slots', error.code, 400);
    }

    let rawSlots = (data || []) as { slot_start: string; slot_end: string }[];
    if (typeof dateStrOrDays === 'string') {
      // Compare Asia/Kolkata date keys, never the raw UTC string prefix (D-21).
      rawSlots = rawSlots.filter((row) => istDateKey(row.slot_start) === dateStrOrDays);
    }

    return rawSlots.map((row) => {
      // Format in Asia/Kolkata explicitly; the browser zone must not change the time.
      const dateStr = istDateKey(row.slot_start) ?? '';
      const displayStr = formatIstTime(row.slot_start) ?? '';

      return {
        id: row.slot_start,
        doctor_id: '',
        start_time: row.slot_start,
        end_time: row.slot_end,
        date: dateStr,
        time_display: displayStr,
        is_available: true,
      };
    });
  }

  const doctorId = mockReports.get(reportIdOrDoctorId)?.doctor_id || reportIdOrDoctorId;
  if (doctorId === FICTIONAL_DOCTORS.emergency.id) {
    return []; // Emergency has no routine slots
  }

  const slots: AppointmentSlot[] = [];
  const dateStr = typeof dateStrOrDays === 'string' ? dateStrOrDays : istDateKey(new Date()) ?? '';
  const targetDate = new Date(`${dateStr}T12:00:00+05:30`);
  const dayOfWeek = Number.isNaN(targetDate.getTime()) ? 1 : targetDate.getUTCDay();

  // Weekdays only
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return [];
  }

  // Clinic hours: 09:00 - 17:00, 30 min slots, lunch 13:00 - 14:00
  const hours = [9, 10, 11, 12, 14, 15, 16];
  for (const h of hours) {
    for (const m of [0, 30]) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const startTime = `${dateStr}T${timeStr}:00+05:30`;
      const endTime = addMinutes(startTime, 30) ?? startTime;

      const slotId = `slot-${doctorId}-${dateStr}-${timeStr}`;

      const isBooked = Array.from(mockAppointments.values()).some(
        (a) => a.doctor_id === doctorId && a.slot_id === slotId
      );

      slots.push({
        id: slotId,
        doctor_id: doctorId,
        start_time: startTime,
        end_time: endTime,
        date: dateStr,
        time_display: formatIstTime(startTime) ?? '',
        is_available: !isBooked,
      });
    }
  }

  return slots;
}

export async function bookAppointment(req: BookAppointmentRequest): Promise<BookAppointmentResponse> {
  // D-03: `slot_start` must be a real ISO instant. A slot id (e.g. `slot-doc-...`) is
  // never a timestamp, and submitting one corrupts the confirmation date.
  const requestedStart = req.slot_start;
  if (requestedStart !== undefined && !parseInstant(requestedStart)) {
    throw new ApiError('The selected slot time is invalid. Please reselect a slot.', 'invalid_slot', 400);
  }

  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const slotStart = requestedStart;
    if (!slotStart) {
      throw new ApiError('Missing slot timestamp for booking', 'invalid_request', 400);
    }
    const { data, error } = await client.rpc('book_appointment', {
      p_report_id: req.report_id,
      p_slot_start: slotStart,
    });
    if (error) {
      if (error.code === '23505') {
        throw new ApiError('That slot was just taken. Please select another slot.', 'slot_taken', 409);
      }
      if (error.code === '42501') {
        throw new ApiError('Booking paused until a doctor reviews this report.', 'review_hold', 403);
      }
      if (error.code === '22023') {
        throw new ApiError('Emergency reports are permanently ineligible for routine booking.', 'not_bookable', 422);
      }
      if (error.code === 'P0002') {
        throw new ApiError('Report not found or not owned.', 'not_found', 404);
      }
      if (error.code === '28000') {
        throw new ApiError('Not authenticated.', 'unauthorized', 401);
      }
      throw new ApiError(error.message || 'Failed to book appointment', error.code, 400);
    }

    const rows = (data || []) as {
      appointment_id: string;
      reference_code: string;
      slot_start: string;
      slot_end: string;
      doctor_id: string;
      already_booked: boolean;
    }[];

    if (!rows.length) {
      throw new ApiError('No appointment returned from server', 'internal');
    }
    const row = rows[0];

    // The server derives doctor and department from the report; never the client.
    // Resolve the display names from the reference tables instead of the fictional
    // seed constants, because doctors.id is a uuid and FICTIONAL_DOCTORS uses demo ids.
    const doctorInfo = await lookupDoctor(row.doctor_id);
    const department = doctorInfo ? await lookupDepartment(doctorInfo.department_key) : null;

    const appointment: Appointment = {
      id: row.appointment_id,
      report_id: req.report_id,
      doctor_id: row.doctor_id,
      doctor_name: doctorInfo?.display_name || FICTIONAL_DOCTORS.general_medicine.name,
      department_name: department?.name || departmentNameFor(doctorInfo?.department_key),
      slot_id: row.slot_start,
      slot_start: row.slot_start,
      slot_end: row.slot_end,
      reference_code: row.reference_code,
      patient_name: req.patient_name || '',
      created_at: new Date().toISOString(),
      status: 'confirmed',
    };

    return {
      appointment,
      reference_code: row.reference_code,
      already_booked: row.already_booked,
    };
  }

  const report = mockReports.get(req.report_id);
  if (!report) {
    throw new Error('Report not found');
  }

  if (report.status === 'urgent_partial' || report.department_key === 'emergency') {
    throw new Error('Emergency reports are permanently ineligible for routine booking');
  }

  if ((report.possible_urgent || report.needs_human_review) && !report.reviewed_at) {
    throw new Error('Booking paused pending doctor review');
  }

  const slotStart = requestedStart;
  if (!slotStart) {
    throw new ApiError('Missing slot timestamp for booking', 'invalid_request', 400);
  }

  // One confirmed appointment per report, mirroring book_appointment's unique constraint.
  const alreadyForReport = Array.from(mockAppointments.values()).find(
    (a) => a.report_id === req.report_id && a.status === 'confirmed',
  );
  if (alreadyForReport) {
    throw new ApiError(
      'This report already has a confirmed appointment.',
      'already_booked',
      409,
    );
  }

  const conflictByStart = Array.from(mockAppointments.values()).find(
    (a) => a.doctor_id === req.doctor_id && a.slot_start === slotStart,
  );
  const conflictById = req.slot_id
    ? Array.from(mockAppointments.values()).find((a) => a.slot_id === req.slot_id)
    : undefined;
  if (conflictByStart || conflictById) {
    throw new ApiError('That slot was just taken. Please select another slot.', 'slot_taken', 409);
  }

  const refCode = generateReferenceCode('APT');
  const doctor = Object.values(FICTIONAL_DOCTORS).find((d) => d.id === req.doctor_id) || FICTIONAL_DOCTORS.general_medicine;

  const apt: Appointment = {
    id: `apt-${Date.now()}`,
    report_id: req.report_id,
    doctor_id: req.doctor_id || doctor.id,
    doctor_name: doctor.name,
    department_name: doctor.department_name,
    slot_id: req.slot_id || slotStart,
    slot_start: slotStart,
    slot_end: addMinutes(slotStart, 30) ?? slotStart,
    reference_code: refCode,
    patient_name: report.report.patient.name.value || 'Patient',
    created_at: new Date().toISOString(),
    status: 'confirmed',
  };

  mockAppointments.set(apt.id, apt);
  return { appointment: apt, reference_code: refCode };
}

export async function markReportReviewed(reportId: string): Promise<MarkReportReviewedResponse> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('mark_report_reviewed', {
      p_report_id: reportId,
    });
    if (error) {
      if (error.code === '42501') {
        throw new ApiError('Not authorised to review this report.', 'forbidden', 403);
      }
      if (error.code === '22023') {
        throw new ApiError('Draft reports cannot be reviewed.', 'invalid_state', 422);
      }
      if (error.code === 'P0002') {
        throw new ApiError('Report not found.', 'not_found', 404);
      }
      throw new ApiError(error.message || 'Failed to mark report reviewed', error.code, 400);
    }

    const rows = (data || []) as {
      report_id: string;
      reviewed_at: string;
      reviewed_by: string;
      already_reviewed: boolean;
    }[];

    if (!rows.length) {
      throw new ApiError('No review data returned', 'internal');
    }
    const row = rows[0];

    return {
      success: true,
      report_id: row.report_id,
      reviewed_at: row.reviewed_at,
      reviewed_by: row.reviewed_by,
      already_reviewed: row.already_reviewed,
    };
  }

  const report = mockReports.get(reportId);
  if (!report) {
    throw new Error('Report not found');
  }

  const now = new Date().toISOString();
  if (!report.reviewed_at) {
    report.reviewed_at = now;
    report.reviewed_by = 'doc-current-auth-uid';
  }

  return {
    success: true,
    report_id: reportId,
    reviewed_at: report.reviewed_at,
    reviewed_by: report.reviewed_by,
  };
}

export async function doctorLogin(email: string, password?: string): Promise<DoctorLoginResponse> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const { data: authData, error: authErr } = await client.auth.signInWithPassword({
      email,
      password: password || '',
    });
    if (authErr || !authData.user) {
      throw new ApiError(authErr?.message || 'Invalid credentials', 'invalid_credentials', 401);
    }

    const { data: profileData, error: profileErr } = await client
      .from('doctor_profiles')
      .select('doctor_id')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    // A signed-in Auth user who is not mapped to a doctor must never be treated as one.
    // Previously a seeded-email fallback handed out a doctor profile here, which meant
    // any account that happened to use a demo address could read that doctor's reports.
    if (profileErr || !profileData) {
      await client.auth.signOut();
      throw new ApiError('not_a_doctor', 'not_a_doctor', 403);
    }

    const doctorRow = await lookupDoctor(profileData.doctor_id);
    if (!doctorRow) {
      await client.auth.signOut();
      throw new ApiError('not_a_doctor', 'not_a_doctor', 403);
    }

    const department = await lookupDepartment(doctorRow.department_key);
    const seedDoc = FICTIONAL_DOCTORS[doctorRow.department_key];

    const doctor: DoctorProfile = {
      id: doctorRow.id,
      name: doctorRow.display_name,
      department_key: doctorRow.department_key,
      department_name: department?.name || departmentNameFor(doctorRow.department_key),
      title: seedDoc?.title || 'Consultant',
      initials: initialsOf(doctorRow.display_name),
      email: authData.user.email || email,
      routine_slots_enabled: department ? department.booking_enabled && !department.is_emergency : false,
    };

    return {
      doctor,
      token: authData.session?.access_token || '',
    };
  }

  const doctor = Object.values(FICTIONAL_DOCTORS).find((d) => d.email.toLowerCase() === email.toLowerCase());
  if (!doctor) {
    throw new ApiError('Invalid credentials', 'invalid_credentials', 401);
  }
  return {
    doctor,
    token: `mock-jwt-${doctor.id}`,
  };
}

export async function doctorLogout(): Promise<void> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    await client.auth.signOut();
  }
}

export async function getDoctorReports(doctorId?: string): Promise<ReportRow[]> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiError(error.message || 'Failed to fetch doctor reports', error.code, 400);
    }
    return (data || []) as ReportRow[];
  }

  const currentDoc = doctorId ? Object.values(FICTIONAL_DOCTORS).find((d) => d.id === doctorId) : null;
  if (!currentDoc) {
    return Array.from(mockReports.values()).filter((r) => r.status !== 'draft');
  }

  const isGeneralMedOrEmergency = currentDoc.department_key === 'general_medicine' || currentDoc.department_key === 'emergency';

  return Array.from(mockReports.values()).filter((r) => {
    if (r.status === 'draft') return false;
    if (r.doctor_id === currentDoc.id) return true;
    if (isGeneralMedOrEmergency && r.department_key === 'emergency') {
      return true;
    }
    return false;
  });
}

/**
 * Resolve a doctor display name from an id (used for the "Reviewed by …" label).
 * Returns null when the name is not available, so callers fall back to a neutral label
 * instead of hardcoding a doctor's name (D-32).
 */
export async function getDoctorDisplayName(doctorId?: string | null): Promise<string | null> {
  if (!doctorId) return null;
  if (currentAppMode === 'supabase') {
    const doctor = await lookupDoctor(doctorId);
    return doctor?.display_name ?? null;
  }
  const fictional = Object.values(FICTIONAL_DOCTORS).find((d) => d.id === doctorId);
  return fictional?.name ?? null;
}

export async function getDoctorReportDetail(reportId: string): Promise<ReportRow | null> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();

    if (error) {
      throw new ApiError(error.message || 'Failed to fetch report detail', error.code, 400);
    }
    return (data || null) as ReportRow | null;
  }

  return mockReports.get(reportId) || null;
}

function sortConversation(rows: DoctorConversationMessage[]): DoctorConversationMessage[] {
  return [...rows].sort((a, b) => {
    const byTime = a.created_at.localeCompare(b.created_at);
    if (byTime !== 0) return byTime;
    return (a.turn_index ?? 0) - (b.turn_index ?? 0);
  });
}

/**
 * Read-only patient answers for a report the authenticated doctor may already read.
 *
 * Authorisation is entirely the existing report/messages RLS:
 *   - the report lookup returns null for a draft, a foreign report or a missing id;
 *   - the messages policy only exposes rows whose session has a report the caller may read.
 *
 * The table stores patient answer rows only. It does not store the assistant question
 * text, so callers must render `question_id` (or an accurate label) rather than inventing
 * a full transcript.
 */
export async function getDoctorMessages(reportId: string): Promise<DoctorConversationMessage[]> {
  if (currentAppMode === 'supabase') {
    if (!isUuid(reportId)) {
      // Same generic result as a foreign or draft report: no existence disclosure.
      throw new ApiError('Report not found.', 'not_found', 404);
    }

    const client = getSupabaseClient();

    // RLS-scoped: a draft, foreign or missing report is indistinguishable here.
    const { data: report, error: reportError } = await client
      .from('reports')
      .select('session_id')
      .eq('id', reportId)
      .maybeSingle();

    if (reportError) {
      throw new ApiError('Failed to fetch patient responses', reportError.code, 400);
    }
    if (!report) {
      throw new ApiError('Report not found.', 'not_found', 404);
    }

    // Messages RLS re-checks report visibility for this session.
    const { data, error } = await client
      .from('messages')
      .select('id, role, question_id, original_text, final_text, input_mode, turn_index, created_at')
      .eq('session_id', report.session_id)
      .order('created_at', { ascending: true })
      .order('turn_index', { ascending: true });

    if (error) {
      throw new ApiError('Failed to fetch patient responses', error.code, 400);
    }

    return sortConversation((data || []) as DoctorConversationMessage[]);
  }

  const report = mockReports.get(reportId);
  if (!report) {
    throw new ApiError('Report not found.', 'not_found', 404);
  }

  const session = mockSessions.get(report.session_id);
  if (session) {
    // The real table contains patient rows only; mirror that here instead of returning
    // the mock's assistant chat bubbles.
    const rows: DoctorConversationMessage[] = session.messages
      .filter((message) => message.role === 'patient')
      .map((message) => ({
        id: message.id,
        role: 'patient' as const,
        question_id: message.question_id ?? null,
        original_text: null,
        final_text: message.content,
        input_mode: null,
        turn_index: message.turn_index || null,
        created_at: message.created_at,
      }));
    return sortConversation(rows);
  }

  return sortConversation(mockSeededMessages.get(reportId) ?? []);
}

export async function getDoctorAppointments(doctorId?: string): Promise<Appointment[]> {
  if (currentAppMode === 'supabase') {
    const client = getSupabaseClient();
    // appointments has no browser grant and no read policy, so this is a narrow
    // read-only RPC (20261102160000_doctor_appointment_reads.sql) rather than a table
    // select. Previously the table read was denied and the error was swallowed into [].
    const { data, error } = await client.rpc('get_doctor_appointments');

    if (error) {
      if (error.code === '28000') {
        throw new ApiError('Not authenticated.', 'unauthorized', 401);
      }
      throw new ApiError(error.message || 'Failed to fetch appointments', error.code, 400);
    }

    const rows = (data || []) as {
      appointment_id: string;
      report_id: string;
      doctor_id: string;
      doctor_name: string;
      department_key: DepartmentKey | null;
      department_name: string | null;
      patient_name: string | null;
      slot_start: string;
      slot_end: string;
      reference_code: string;
      appointment_status: 'confirmed' | 'cancelled';
      created_at: string;
    }[];

    return rows.map((row) => ({
      id: row.appointment_id,
      report_id: row.report_id,
      doctor_id: row.doctor_id,
      doctor_name: row.doctor_name || '',
      department_name: row.department_name || departmentNameFor(row.department_key),
      slot_id: row.slot_start,
      slot_start: row.slot_start,
      slot_end: row.slot_end,
      reference_code: row.reference_code,
      patient_name: row.patient_name || '',
      created_at: row.created_at,
      status: row.appointment_status,
    }));
  }

  const currentDocId = doctorId || FICTIONAL_DOCTORS.general_medicine.id;
  return Array.from(mockAppointments.values()).filter((a) => a.doctor_id === currentDocId);
}

export async function getDoctorDashboardStats(doctorId?: string): Promise<DoctorDashboardStats> {
  const reports = await getDoctorReports(doctorId);
  const appointments = await getDoctorAppointments(doctorId);
  const bookedReportIds = new Set(appointments.map((a) => a.report_id));

  let urgent = 0;
  let new_reports = 0;
  let booked = 0;
  let not_booked = 0;

  for (const r of reports) {
    if (r.status === 'urgent_partial') {
      urgent += 1;
    } else if (r.status === 'submitted') {
      if (!r.reviewed_at) {
        new_reports += 1;
      }
      if (bookedReportIds.has(r.id)) {
        booked += 1;
      } else {
        not_booked += 1;
      }
    }
  }

  return { urgent, new_reports, booked, not_booked };
}
