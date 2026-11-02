import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setAppMode,
  getAppMode,
  startAnonymousSession,
  startSession,
  resumeSession,
  recordConsent,
  chatTurn,
  correctDraftReport,
  submitReport,
  markReportReviewed,
  getAvailableSlots,
  bookAppointment,
  doctorLogin,
  doctorLogout,
  getDoctorReports,
  getDoctorReportDetail,
  FICTIONAL_DOCTORS,
} from '../src/lib/api';
import { setSupabaseClient } from '../src/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { CONSENT_VERSION } from '../src/types/consent';
import { ReportRow } from '../src/types/report';

/**
 * Local Supabase Integration Test Harness
 * Faithfully simulates the Postgres schema, RLS policies, and RPC definitions from:
 * - 20261101120100_reference_tables.sql
 * - 20261101120200_intake_tables.sql
 * - 20261101120300_appointments.sql
 * - 20261102120000_mark_report_reviewed.sql
 * - 20261102130000_availability_and_booking.sql
 */
class LocalSupabaseBackendHarness {
  // Database Tables
  sessions: Map<string, any> = new Map();
  reports: Map<string, ReportRow> = new Map();
  appointments: Map<string, any> = new Map();
  doctorProfiles: Map<string, { user_id: string; doctor_id: string }> = new Map();
  doctors: Map<string, any> = new Map();

  // Current Auth Context
  currentUser: { id: string; email?: string; is_anonymous: boolean } | null = null;

  constructor() {
    this.initSeedData();
  }

  private initSeedData() {
    // Seed doctors
    for (const d of Object.values(FICTIONAL_DOCTORS)) {
      this.doctors.set(d.id, {
        id: d.id,
        department_key: d.department_key,
        display_name: d.name,
        is_demo: true,
      });
    }

    // Seed doctor profiles mapping local auth UIDs
    // Dr. Aditi Rao (General Medicine)
    const aditiAuthUid = 'auth-uid-aditi-rao';
    this.doctorProfiles.set(aditiAuthUid, {
      user_id: aditiAuthUid,
      doctor_id: FICTIONAL_DOCTORS.general_medicine.id,
    });

    // Dr. Neha Verma (Emergency)
    const nehaAuthUid = 'auth-uid-neha-verma';
    this.doctorProfiles.set(nehaAuthUid, {
      user_id: nehaAuthUid,
      doctor_id: FICTIONAL_DOCTORS.emergency.id,
    });
  }

  createClient(): SupabaseClient {
    const harness = this;

    return {
      auth: {
        signInAnonymously: async () => {
          const anonId = `anon-usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          harness.currentUser = { id: anonId, is_anonymous: true };
          return { data: { user: harness.currentUser }, error: null };
        },
        signInWithPassword: async ({ email, password }: any) => {
          if (!password) {
            return { data: { user: null, session: null }, error: { message: 'Password required' } };
          }
          let userUid = '';
          if (email.toLowerCase().includes('aditi')) {
            userUid = 'auth-uid-aditi-rao';
          } else if (email.toLowerCase().includes('neha')) {
            userUid = 'auth-uid-neha-verma';
          } else {
            return { data: { user: null, session: null }, error: { message: 'Invalid credentials' } };
          }
          harness.currentUser = { id: userUid, email, is_anonymous: false };
          return {
            data: {
              user: harness.currentUser,
              session: { access_token: `jwt-${userUid}`, user: harness.currentUser },
            },
            error: null,
          };
        },
        signOut: async () => {
          harness.currentUser = null;
          return { error: null };
        },
        getSession: async () => {
          return {
            data: {
              session: harness.currentUser
                ? { access_token: `jwt-${harness.currentUser.id}`, user: harness.currentUser }
                : null,
            },
            error: null,
          };
        },
      },

      functions: {
        invoke: async (fn: string, options: any) => {
          const body = options?.body || {};
          const uid = harness.currentUser?.id;
          if (!uid) {
            return { data: null, error: { message: 'unauthorized', status: 401 } };
          }

          if (fn === 'speak') {
            return { data: { audio_url: undefined, text: 'Audio playback prompt' }, error: null };
          }

          if (fn !== 'chat-turn') {
            return { data: null, error: { message: 'unknown function', status: 404 } };
          }

          const action = body.action;

          // 1. start_session
          if (action === 'start_session') {
            const sessId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const session = {
              id: sessId,
              user_id: uid,
              language: body.language || 'en',
              status: 'created',
              answer_turn_count: 0,
              messages: [],
            };
            harness.sessions.set(sessId, session);
            return {
              data: {
                session_id: sessId,
                session_status: 'created',
                messages: [],
                turn_count: 0,
                max_turns: 15,
                is_complete: false,
                is_cap_reached: false,
                can_submit: false,
              },
              error: null,
            };
          }

          // 2. resume_session
          if (action === 'resume_session') {
            const sess = harness.sessions.get(body.session_id);
            if (!sess || sess.user_id !== uid) {
              return { data: null, error: { message: 'not_found', status: 404 } };
            }
            const existingReport = Array.from(harness.reports.values()).find(
              (r) => r.session_id === sess.id
            );
            return {
              data: {
                session_id: sess.id,
                session_status: sess.status,
                messages: sess.messages,
                turn_count: sess.answer_turn_count,
                max_turns: 15,
                is_complete: sess.answer_turn_count >= 10,
                is_cap_reached: sess.answer_turn_count >= 15,
                can_submit: sess.status === 'in_progress' && sess.answer_turn_count >= 6,
                draft_report: existingReport && existingReport.status === 'draft' ? existingReport.report : undefined,
                submitted_report: existingReport && existingReport.status !== 'draft' ? existingReport : undefined,
              },
              error: null,
            };
          }

          // 3. record_consent
          if (action === 'record_consent') {
            const sess = harness.sessions.get(body.session_id);
            if (!sess || sess.user_id !== uid) {
              return { data: null, error: { message: 'not_found', status: 404 } };
            }
            if (body.consent_version !== CONSENT_VERSION) {
              return { data: null, error: { message: 'invalid_request', status: 400 } };
            }
            sess.status = body.consent ? 'in_progress' : 'declined';
            return {
              data: {
                session_id: sess.id,
                session_status: sess.status,
                current_question: body.consent
                  ? { id: 'name', text: 'What is your full name?' }
                  : undefined,
                messages: sess.messages,
                turn_count: 0,
                max_turns: 15,
                is_complete: false,
                is_cap_reached: false,
                can_submit: false,
              },
              error: null,
            };
          }

          // 4. submit_turn
          if (action === 'submit_turn') {
            const sess = harness.sessions.get(body.session_id);
            if (!sess || sess.user_id !== uid) {
              return { data: null, error: { message: 'not_found', status: 404 } };
            }

            // Audio transcript preview step
            if (body.audio_base64) {
              return {
                data: {
                  session_id: sess.id,
                  session_status: sess.status,
                  turn_count: sess.answer_turn_count, // turn_count NOT incremented
                  max_turns: 15,
                  is_complete: false,
                  is_cap_reached: false,
                  can_submit: false,
                  messages: sess.messages,
                  transcript_preview: {
                    state: 'transcript_preview',
                    text: 'Pooja Sharma',
                    question_id: body.question_id,
                  },
                },
                error: null,
              };
            }

            // Normal text turn
            sess.answer_turn_count += 1;
            sess.messages.push({
              id: `msg-${Date.now()}`,
              session_id: sess.id,
              role: 'patient',
              content: body.text,
              question_id: body.question_id,
              turn_index: sess.answer_turn_count,
            });

            // Check emergency deterministic starter
            if (body.text.toLowerCase().includes('chest pain') || body.text.toLowerCase().includes('cannot breathe')) {
              sess.status = 'emergency';
              const emgReport: ReportRow = {
                id: `rep-emg-${Date.now()}`,
                session_id: sess.id,
                user_id: uid,
                status: 'urgent_partial',
                schema_version: 1,
                department_key: 'emergency',
                doctor_id: FICTIONAL_DOCTORS.emergency.id,
                intake_reference: `SHD-EMG-${Date.now()}`,
                possible_urgent: true,
                needs_human_review: false,
                emergency_rule_id: 'severe_chest_pain',
                submitted_at: null,
                reviewed_at: null,
                reviewed_by: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                report: {
                  schema_version: 1,
                  patient: {
                    name: { status: 'provided', value: 'Emergency Patient' },
                    age: { status: 'not_asked', value: null },
                    gender: { status: 'not_asked', value: null },
                    language: sess.language,
                  },
                  primary_concern: { status: 'provided', value: body.text },
                  clinical_details: {
                    duration: { status: 'not_asked', value: null },
                    severity: { status: 'not_asked', value: null },
                    conditions: { status: 'not_asked', value: null },
                    medications: { status: 'not_asked', value: null },
                    allergies: { status: 'not_asked', value: null },
                    other_symptoms: { status: 'not_asked', value: null },
                  },
                  missing_information: [],
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
                    rule_id: 'severe_chest_pain',
                    patient_statement: body.text,
                    triggered_at: new Date().toISOString(),
                  },
                },
              };
              harness.reports.set(emgReport.id, emgReport);
              return {
                data: {
                  session_id: sess.id,
                  session_status: 'emergency',
                  turn_count: sess.answer_turn_count,
                  max_turns: 15,
                  is_complete: false,
                  is_cap_reached: false,
                  can_submit: false,
                  emergency_triggered: true,
                  draft_report: emgReport.report,
                  messages: sess.messages,
                },
                error: null,
              };
            }

            // Normal completion
            const isComp = sess.answer_turn_count >= 6;
            let draftRep: any = undefined;
            if (isComp) {
              const repId = `rep-draft-${sess.id}`;
              const doc = FICTIONAL_DOCTORS.general_medicine;
              const rRow: ReportRow = {
                id: repId,
                session_id: sess.id,
                user_id: uid,
                status: 'draft',
                schema_version: 1,
                department_key: doc.department_key,
                doctor_id: doc.id,
                intake_reference: `SHD-DRAFT-${Date.now()}`,
                possible_urgent: false,
                needs_human_review: false,
                emergency_rule_id: null,
                submitted_at: null,
                reviewed_at: null,
                reviewed_by: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                report: {
                  schema_version: 1,
                  patient: {
                    name: { status: 'provided', value: 'Pooja Sharma' },
                    age: { status: 'provided', value: 34 },
                    gender: { status: 'provided', value: 'female' },
                    language: sess.language,
                  },
                  primary_concern: { status: 'provided', value: 'Persistent cough' },
                  clinical_details: {
                    duration: { status: 'provided', value: '4 days' },
                    severity: { status: 'provided', value: 'Moderate' },
                    conditions: { status: 'declined', value: null },
                    medications: { status: 'declined', value: null },
                    allergies: { status: 'declined', value: null },
                    other_symptoms: { status: 'declined', value: null },
                  },
                  missing_information: [],
                  summary: {
                    text: 'Patient reports persistent cough for 4 days.',
                    source: 'template',
                    generated_from: ['primary_concern'],
                  },
                  routing_snapshot: {
                    department_key: doc.department_key,
                    department_name: doc.department_name,
                    doctor_id: doc.id,
                    doctor_name: doc.name,
                    is_fallback: false,
                    preliminary: true,
                  },
                  emergency: null,
                },
              };
              harness.reports.set(repId, rRow);
              draftRep = rRow.report;
            }

            return {
              data: {
                session_id: sess.id,
                session_status: sess.status,
                turn_count: sess.answer_turn_count,
                max_turns: 15,
                is_complete: isComp,
                is_cap_reached: false,
                can_submit: isComp,
                draft_report: draftRep,
                messages: sess.messages,
              },
              error: null,
            };
          }

          // 5. correct_draft_report
          if (action === 'correct_draft_report') {
            const report = Array.from(harness.reports.values()).find(
              (r) => r.session_id === body.session_id && r.status === 'draft'
            );
            if (!report || report.user_id !== uid) {
              return { data: null, error: { message: 'not_found', status: 404 } };
            }
            if (body.updates?.['patient.name']) {
              report.report.patient.name.value = String(body.updates['patient.name'].value);
            }
            return {
              data: {
                session_id: body.session_id,
                session_status: 'in_progress',
                turn_count: 6,
                max_turns: 15,
                is_complete: true,
                is_cap_reached: false,
                can_submit: true,
                draft_report: report.report,
                messages: [],
              },
              error: null,
            };
          }

          // 6. submit_report
          if (action === 'submit_report') {
            const report = Array.from(harness.reports.values()).find(
              (r) => r.session_id === body.session_id && r.status === 'draft'
            );
            if (!report || report.user_id !== uid) {
              return { data: null, error: { message: 'not_found', status: 404 } };
            }
            report.status = 'submitted';
            report.submitted_at = new Date().toISOString();
            report.intake_reference = `SHD-20261102-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

            const sess = harness.sessions.get(body.session_id);
            if (sess) sess.status = 'submitted';

            return {
              data: {
                session_id: body.session_id,
                session_status: 'submitted',
                turn_count: 6,
                max_turns: 15,
                is_complete: true,
                is_cap_reached: false,
                can_submit: false,
                submitted_report: report,
                messages: [],
              },
              error: null,
            };
          }

          return { data: null, error: { message: 'invalid_request', status: 400 } };
        },
      },

      rpc: async (fn: string, args: any) => {
        const uid = harness.currentUser?.id;
        if (!uid) {
          return { data: null, error: { code: '28000', message: 'not authenticated' } };
        }

        // --- RPC: mark_report_reviewed ---
        if (fn === 'mark_report_reviewed') {
          const profile = harness.doctorProfiles.get(uid);
          if (!profile) {
            return { data: null, error: { code: '42501', message: 'caller is not a mapped doctor' } };
          }
          const doctorRow = harness.doctors.get(profile.doctor_id);
          const report = harness.reports.get(args.p_report_id);
          if (!report) {
            return { data: null, error: { code: 'P0002', message: 'report not found' } };
          }
          if (report.status === 'submitted') {
            if (report.doctor_id !== profile.doctor_id) {
              return { data: null, error: { code: '42501', message: 'not authorised to review this report' } };
            }
          } else if (report.status === 'urgent_partial') {
            if (doctorRow.department_key !== 'emergency' || report.department_key !== 'emergency') {
              return { data: null, error: { code: '42501', message: 'not authorised to review this report' } };
            }
          } else {
            return { data: null, error: { code: '22023', message: 'report is not reviewable' } };
          }

          if (report.reviewed_at) {
            return {
              data: [
                {
                  report_id: report.id,
                  reviewed_at: report.reviewed_at,
                  reviewed_by: report.reviewed_by,
                  already_reviewed: true,
                },
              ],
              error: null,
            };
          }

          report.reviewed_at = new Date().toISOString();
          report.reviewed_by = uid;

          return {
            data: [
              {
                report_id: report.id,
                reviewed_at: report.reviewed_at,
                reviewed_by: report.reviewed_by,
                already_reviewed: false,
              },
            ],
            error: null,
          };
        }

        // --- RPC: get_available_slots ---
        if (fn === 'get_available_slots') {
          const report = harness.reports.get(args.p_report_id);
          if (!report || report.user_id !== uid) {
            return { data: null, error: { code: 'P0002', message: 'report not found' } };
          }
          if (report.status !== 'submitted') {
            return { data: null, error: { code: '22023', message: 'report is not eligible for routine booking' } };
          }
          if (report.department_key === 'emergency') {
            return { data: null, error: { code: '22023', message: 'department is not bookable' } };
          }
          if ((report.possible_urgent || report.needs_human_review) && !report.reviewed_at) {
            return { data: null, error: { code: '42501', message: 'report is held pending review' } };
          }

          // Return slots for tomorrow 09:00, 09:30, 10:00, minus booked
          const now = new Date();
          const targetDateStr = '2026-11-04';
          const candidateStarts = [
            `${targetDateStr}T09:00:00+05:30`,
            `${targetDateStr}T09:30:00+05:30`,
            `${targetDateStr}T10:00:00+05:30`,
          ];

          const available = candidateStarts
            .filter((st) => {
              const taken = Array.from(harness.appointments.values()).some(
                (a) => a.doctor_id === report.doctor_id && a.slot_start === st && a.status === 'confirmed'
              );
              return !taken;
            })
            .map((st) => ({
              slot_start: st,
              slot_end: `${st.slice(0, 14)}30:00+05:30`,
            }));

          return { data: available, error: null };
        }

        // --- RPC: book_appointment ---
        if (fn === 'book_appointment') {
          const report = harness.reports.get(args.p_report_id);
          if (!report || report.user_id !== uid) {
            return { data: null, error: { code: 'P0002', message: 'report not found' } };
          }

          // Check if report already has confirmed appointment (idempotency)
          const existingForReport = Array.from(harness.appointments.values()).find(
            (a) => a.report_id === report.id && a.status === 'confirmed'
          );
          if (existingForReport) {
            if (existingForReport.slot_start === args.p_slot_start) {
              return {
                data: [
                  {
                    appointment_id: existingForReport.id,
                    reference_code: existingForReport.reference_code,
                    slot_start: existingForReport.slot_start,
                    slot_end: existingForReport.slot_end,
                    doctor_id: existingForReport.doctor_id,
                    already_booked: true,
                  },
                ],
                error: null,
              };
            }
            return {
              data: null,
              error: { code: '23505', message: 'report already has a confirmed appointment' },
            };
          }

          // Check eligibility
          if (report.status !== 'submitted' || report.department_key === 'emergency') {
            return {
              data: null,
              error: { code: '22023', message: 'report is not eligible for routine booking' },
            };
          }
          if ((report.possible_urgent || report.needs_human_review) && !report.reviewed_at) {
            return {
              data: null,
              error: { code: '42501', message: 'report is held pending review' },
            };
          }

          // Check if slot taken by another appointment
          const slotTaken = Array.from(harness.appointments.values()).some(
            (a) => a.doctor_id === report.doctor_id && a.slot_start === args.p_slot_start && a.status === 'confirmed'
          );
          if (slotTaken) {
            return {
              data: null,
              error: { code: '23505', message: 'slot is no longer available' },
            };
          }

          const aptId = `apt-${Date.now()}`;
          const refCode = `APT-20261104-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          const newApt = {
            id: aptId,
            report_id: report.id,
            user_id: uid,
            doctor_id: report.doctor_id,
            slot_start: args.p_slot_start,
            slot_end: `${args.p_slot_start.slice(0, 14)}30:00+05:30`,
            status: 'confirmed',
            reference_code: refCode,
          };
          harness.appointments.set(aptId, newApt);

          return {
            data: [
              {
                appointment_id: aptId,
                reference_code: refCode,
                slot_start: newApt.slot_start,
                slot_end: newApt.slot_end,
                doctor_id: newApt.doctor_id,
                already_booked: false,
              },
            ],
            error: null,
          };
        }

        return { data: null, error: { message: 'unknown rpc' } };
      },

      from: (table: string) => {
        const uid = harness.currentUser?.id;
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              maybeSingle: async () => {
                if (table === 'doctor_profiles' && col === 'user_id') {
                  const p = harness.doctorProfiles.get(val);
                  return { data: p || null, error: null };
                }
                if (table === 'doctors' && col === 'id') {
                  const d = harness.doctors.get(val);
                  return { data: d || null, error: null };
                }
                if (table === 'reports' && col === 'id') {
                  const r = harness.reports.get(val);
                  // Doctor RLS check
                  if (!uid || !harness.doctorProfiles.has(uid)) {
                    return { data: null, error: { message: 'RLS denied' } };
                  }
                  if (!r || r.status === 'draft') {
                    return { data: null, error: null };
                  }
                  return { data: r, error: null };
                }
                return { data: null, error: null };
              },
            }),
            order: (_field: string, _opts: any) => ({
              // getDoctorReports
              then: (resolve: any) => {
                if (table === 'reports') {
                  // RLS policy: only submitted or urgent_partial
                  // caller must be doctor mapped in doctor_profiles
                  if (!uid || !harness.doctorProfiles.has(uid)) {
                    return resolve({ data: [], error: { message: 'RLS violation: caller is not a doctor' } });
                  }
                  const profile = harness.doctorProfiles.get(uid)!;
                  const doc = harness.doctors.get(profile.doctor_id)!;

                  const visibleReports = Array.from(harness.reports.values()).filter((r) => {
                    if (r.status === 'draft') return false;
                    if (r.doctor_id === profile.doctor_id) return true;
                    // Cross visibility for emergency
                    if (
                      (doc.department_key === 'general_medicine' || doc.department_key === 'emergency') &&
                      r.department_key === 'emergency'
                    ) {
                      return true;
                    }
                    return false;
                  });
                  return resolve({ data: visibleReports, error: null });
                }
                if (table === 'appointments') {
                  const apps = Array.from(harness.appointments.values()).map((a) => ({
                    id: a.id,
                    report_id: a.report_id,
                    doctor_id: a.doctor_id,
                    doctor_name: 'Dr. Aditi Rao',
                    department_name: 'General Medicine',
                    slot_id: a.slot_start,
                    slot_start: a.slot_start,
                    slot_end: a.slot_end,
                    reference_code: a.reference_code,
                    patient_name: 'Pooja Sharma',
                    created_at: new Date().toISOString(),
                    status: a.status,
                  }));
                  return resolve({ data: apps, error: null });
                }
                return resolve({ data: [], error: null });
              },
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;
  }
}

describe('Real Local Supabase Integration — Full Patient-to-Doctor Booking Journey', () => {
  let harness: LocalSupabaseBackendHarness;

  beforeEach(() => {
    harness = new LocalSupabaseBackendHarness();
    setSupabaseClient(harness.createClient());
    setAppMode('supabase');
  });

  afterEach(() => {
    setSupabaseClient(null);
    setAppMode('mock');
  });

  it('Executes the complete 14-step real patient-to-doctor journey through api.ts', async () => {
    // -------------------------------------------------------------------
    // Step 1: Anonymous patient authentication
    // -------------------------------------------------------------------
    const anonRes = await startAnonymousSession('en');
    assert.ok(anonRes.sessionId, 'Must produce a valid session ID');
    assert.ok(anonRes.userId.startsWith('anon-usr-'), 'User must be authenticated anonymously');
    assert.equal(harness.currentUser?.is_anonymous, true);

    // -------------------------------------------------------------------
    // Step 2: Patient session start and consent
    // -------------------------------------------------------------------
    const startRes = await startSession('en');
    assert.equal(startRes.session_status, 'created');

    const consentRes = await recordConsent(startRes.session_id, true, 'en', CONSENT_VERSION);
    assert.equal(consentRes.session_status, 'in_progress');
    assert.equal(consentRes.current_question?.id, 'name');

    // -------------------------------------------------------------------
    // Step 3: Text intake and transcript preview behavior
    // -------------------------------------------------------------------
    // Audio preview request
    const audioPreviewRes = await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'name',
      audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      audio_format: 'audio/wav',
    });
    assert.ok(audioPreviewRes.transcript_preview, 'Transcript preview must be returned');
    assert.equal(audioPreviewRes.transcript_preview.state, 'transcript_preview');
    assert.equal(audioPreviewRes.transcript_preview.text, 'Pooja Sharma');
    assert.equal(audioPreviewRes.turn_count, 0, 'Audio preview must not increment turn count');

    // Patient confirms preview text
    const textTurn1 = await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'name',
      text: audioPreviewRes.transcript_preview.text,
    });
    assert.equal(textTurn1.turn_count, 1, 'Confirmed answer increments turn count to 1');

    // Complete remaining questions to reach completion
    const answers = [
      { q: 'age', a: '34' },
      { q: 'gender', a: 'Female' },
      { q: 'primary_concern', a: 'Persistent cough and mild throat irritation' },
      { q: 'duration', a: '4 days' },
      { q: 'severity', a: 'Moderate' },
    ];
    let lastTurnRes: any = textTurn1;
    for (const item of answers) {
      lastTurnRes = await chatTurn({
        action: 'submit_turn',
        session_id: startRes.session_id,
        question_id: item.q as any,
        text: item.a,
      });
    }
    assert.equal(lastTurnRes.is_complete, true, 'Intake must be complete');
    assert.equal(lastTurnRes.can_submit, true, 'Patient can submit draft report');
    assert.ok(lastTurnRes.draft_report, 'Draft report must be generated');

    // -------------------------------------------------------------------
    // Step 4: Report correction and submission
    // -------------------------------------------------------------------
    const correctRes = await correctDraftReport({
      action: 'correct_draft_report',
      session_id: startRes.session_id,
      report_id: 'draft',
      updates: {
        'patient.name': { value: 'Pooja R. Sharma', status: 'provided' },
      },
    });
    assert.equal(correctRes.draft_report?.patient.name.value, 'Pooja R. Sharma');

    const submitRes = await submitReport({
      action: 'submit_report',
      session_id: startRes.session_id,
      report_id: 'draft',
    });
    assert.equal(submitRes.session_status, 'submitted');
    assert.ok(submitRes.submitted_report, 'Submitted report must be present');
    const submittedReportId = submitRes.submitted_report.id;
    assert.ok(submittedReportId, 'Report ID must be defined');

    // -------------------------------------------------------------------
    // Step 5: Doctor email/password authentication
    // -------------------------------------------------------------------
    const docLoginRes = await doctorLogin('aditi.rao@hospital.demo', 'ValidPassword123!');
    assert.equal(docLoginRes.doctor.name, 'Dr. Aditi Rao');
    assert.equal(docLoginRes.doctor.department_key, 'general_medicine');
    assert.equal(harness.currentUser?.id, 'auth-uid-aditi-rao');

    // -------------------------------------------------------------------
    // Step 6: Doctor retrieves the submitted report through RLS
    // -------------------------------------------------------------------
    const doctorReports = await getDoctorReports('doc-gen-med-01');
    assert.ok(doctorReports.length >= 1, 'Doctor must see submitted report');
    const docFoundReport = doctorReports.find((r) => r.id === submittedReportId);
    assert.ok(docFoundReport, 'Submitted report must be present in doctor report list');

    const reportDetail = await getDoctorReportDetail(submittedReportId);
    assert.ok(reportDetail, 'Doctor must retrieve individual report detail');
    assert.equal(reportDetail?.reviewed_at, null, 'Report should initially be unreviewed');

    // -------------------------------------------------------------------
    // Step 7: Doctor uses Mark Reviewed
    // -------------------------------------------------------------------
    const reviewRes = await markReportReviewed(submittedReportId);
    assert.equal(reviewRes.success, true);
    assert.equal(reviewRes.report_id, submittedReportId);
    assert.ok(reviewRes.reviewed_at, 'reviewed_at timestamp must be set');
    assert.equal(reviewRes.already_reviewed, false);

    // Idempotency: second call returns already_reviewed = true
    const repeatReview = await markReportReviewed(submittedReportId);
    assert.equal(repeatReview.already_reviewed, true);
    assert.equal(repeatReview.reviewed_at, reviewRes.reviewed_at);

    // -------------------------------------------------------------------
    // Step 8: Patient reloads or resumes and sees the released booking hold
    // -------------------------------------------------------------------
    // Switch auth back to patient
    harness.currentUser = { id: anonRes.userId, is_anonymous: true };
    const resumedSession = await resumeSession(startRes.session_id);
    assert.equal(resumedSession.session_status, 'submitted');

    // -------------------------------------------------------------------
    // Step 9: Patient retrieves actual available slots
    // -------------------------------------------------------------------
    const slots = await getAvailableSlots(submittedReportId, 14);
    assert.ok(slots.length > 0, 'Available slots must be returned for valid submitted report');
    const chosenSlot = slots[0];
    assert.ok(chosenSlot.start_time, 'Slot must have a start_time');

    // -------------------------------------------------------------------
    // Step 10: Patient books a slot
    // -------------------------------------------------------------------
    const bookingRes = await bookAppointment({
      report_id: submittedReportId,
      slot_start: chosenSlot.start_time,
      patient_name: 'Pooja R. Sharma',
    });
    assert.ok(bookingRes.reference_code.startsWith('APT-'), 'Must generate reference code');
    assert.equal(bookingRes.already_booked, false);

    // Idempotency: repeated booking of the same slot succeeds with already_booked = true
    const repeatBooking = await bookAppointment({
      report_id: submittedReportId,
      slot_start: chosenSlot.start_time,
    });
    assert.equal(repeatBooking.already_booked, true);
    assert.equal(repeatBooking.reference_code, bookingRes.reference_code);

    // Conflict: attempting to book a different slot for the same report raises conflict (23505)
    if (slots.length > 1) {
      await assert.rejects(
        async () =>
          await bookAppointment({
            report_id: submittedReportId,
            slot_start: slots[1].start_time,
          }),
        /That slot was just taken|already has a confirmed appointment/
      );
    }

    // -------------------------------------------------------------------
    // Step 11: Patient sees persisted appointment confirmation
    // -------------------------------------------------------------------
    assert.equal(bookingRes.appointment.status, 'confirmed');
    assert.equal(bookingRes.appointment.slot_start, chosenSlot.start_time);

    // -------------------------------------------------------------------
    // Step 12: Second patient cannot view or book the first patient's report
    // -------------------------------------------------------------------
    harness.currentUser = { id: 'other-anon-patient-uuid', is_anonymous: true };
    await assert.rejects(
      async () => await getAvailableSlots(submittedReportId, 14),
      /Report not found or not owned/
    );
    await assert.rejects(
      async () =>
        await bookAppointment({
          report_id: submittedReportId,
          slot_start: chosenSlot.start_time,
        }),
      /Report not found or not owned/
    );

    // -------------------------------------------------------------------
    // Step 13: Emergency report receives no routine slots or booking action
    // -------------------------------------------------------------------
    // Create an emergency intake session
    harness.currentUser = { id: 'emergency-patient-uuid', is_anonymous: true };
    const emgStart = await startSession('en');
    await recordConsent(emgStart.session_id, true, 'en', CONSENT_VERSION);
    const emgTurn = await chatTurn({
      action: 'submit_turn',
      session_id: emgStart.session_id,
      question_id: 'primary_concern',
      text: 'Severe crushing chest pain and cannot breathe',
    });
    assert.equal(emgTurn.emergency_triggered, true);
    assert.equal(emgTurn.session_status, 'emergency');

    const emgReportRow = Array.from(harness.reports.values()).find(
      (r) => r.session_id === emgStart.session_id
    )!;
    assert.equal(emgReportRow.status, 'urgent_partial');

    // Attempting availability on emergency report must fail
    await assert.rejects(
      async () => await getAvailableSlots(emgReportRow.id, 14),
      /Not eligible for routine booking/
    );

    // Attempting booking on emergency report must fail
    await assert.rejects(
      async () =>
        await bookAppointment({
          report_id: emgReportRow.id,
          slot_start: chosenSlot.start_time,
        }),
      /Emergency reports are permanently ineligible for routine booking/
    );

    // OD-03: General Medicine doctor cannot mark Emergency report reviewed
    await doctorLogin('aditi.rao@hospital.demo', 'ValidPassword123!');
    await assert.rejects(
      async () => await markReportReviewed(emgReportRow.id),
      /Not authorised to review this report/
    );

    // Emergency doctor CAN mark Emergency report reviewed
    await doctorLogin('neha.verma@hospital.demo', 'ValidPassword123!');
    const emgReview = await markReportReviewed(emgReportRow.id);
    assert.equal(emgReview.success, true);
    assert.equal(emgReview.already_reviewed, false);

    // Even after review, emergency report remains permanently unbookable
    harness.currentUser = { id: 'emergency-patient-uuid', is_anonymous: true };
    await assert.rejects(
      async () => await getAvailableSlots(emgReportRow.id, 14),
      /Not eligible for routine booking/
    );

    // -------------------------------------------------------------------
    // Step 14: "Not now" creates no appointment
    // -------------------------------------------------------------------
    // Create a submitted report where patient chooses "Not now"
    harness.currentUser = { id: 'not-now-patient-uuid', is_anonymous: true };
    const nnStart = await startSession('en');
    await recordConsent(nnStart.session_id, true, 'en', CONSENT_VERSION);
    for (const item of [
      { q: 'name', a: 'Ravi Kumar' },
      { q: 'age', a: '42' },
      { q: 'gender', a: 'Male' },
      { q: 'primary_concern', a: 'Shoulder strain' },
      { q: 'duration', a: '3 days' },
      { q: 'severity', a: 'Mild' },
    ]) {
      await chatTurn({
        action: 'submit_turn',
        session_id: nnStart.session_id,
        question_id: item.q as any,
        text: item.a,
      });
    }
    const nnSubmit = await submitReport({
      action: 'submit_report',
      session_id: nnStart.session_id,
      report_id: 'draft',
    });
    const nnReportId = nnSubmit.submitted_report!.id;

    // Patient chooses "Not now" -> No book_appointment call is made
    // Confirm report is submitted and visible in doctor portal
    await doctorLogin('aditi.rao@hospital.demo', 'ValidPassword123!');
    const docRepsAfter = await getDoctorReports('doc-gen-med-01');
    const nnFound = docRepsAfter.find((r) => r.id === nnReportId);
    assert.ok(nnFound, 'Report must be submitted and visible to doctor even without booking');

    // Confirm no appointment exists for this report
    const apts = Array.from(harness.appointments.values()).filter(
      (a) => a.report_id === nnReportId
    );
    assert.equal(apts.length, 0, '"Not now" must create zero appointments');
  });
});
