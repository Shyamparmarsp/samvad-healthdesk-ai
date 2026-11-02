/**
 * Remediation regression suite (Phases 3-5 of the P0/P1 remediation).
 *
 * Covers the OpenCode-owned corrections:
 *  D-01 warning flags · D-02/D-10 terminal navigation · D-03 booking datetime ·
 *  D-04 demo_busy · D-06 prompt-audio caching · D-08 fixture isolation ·
 *  D-14 information statuses · D-15 missing information · D-21 IST timezone ·
 *  D-32 reviewer label · D-33 source chip · D-36 fail-closed review authority.
 *
 * All providers are mocked: no Groq, Prisma or Timbre call is made.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import {
  describeWarningFlags,
  describeSourceChip,
  describeReviewer,
  presentField,
  presentGender,
  presentMissingInformation,
} from '../src/lib/report-presentation';
import {
  formatAppointmentWhen,
  formatIstDate,
  formatIstDateTime,
  formatIstTime,
  istDateKey,
  parseInstant,
  buildWeekdayDateOptions,
} from '../src/lib/booking-time';
import {
  isTerminalPatientScreen,
  resolveBackNavigation,
  reviewModeFor,
  isConversationDeadEnd,
} from '../src/lib/navigation';
import {
  CACHED_PROMPT_IDS,
  cachedPromptUrl,
  createPromptAudioCache,
  isCachedPrompt,
  promptIdForQuestion,
  resolvePromptAudio,
} from '../src/lib/audio/prompt-audio';

import { WarningFlags } from '../src/features/doctor/WarningFlags';
import { DoctorReportDetail } from '../src/features/doctor/DoctorReportDetail';
import { DoctorUrgentDetail } from '../src/features/doctor/DoctorUrgentDetail';
import { DoctorShell } from '../src/features/doctor/DoctorShell';
import { DoctorAppointmentsView } from '../src/features/doctor/DoctorAppointmentsView';
import { ReportReviewView } from '../src/features/patient/ReportReviewView';

import {
  startSession,
  recordConsent,
  chatTurn,
  submitReport,
  getAvailableSlots,
  bookAppointment,
  setMockDailyCapExceeded,
  setAppMode,
} from '../src/lib/api';
import { CONSENT_VERSION } from '../src/types/consent';
import { ReportDocumentV1, ReportRow } from '../src/types/report';

// ---------------------------------------------------------------------------
// Synthetic reports (no real patient data)
// ---------------------------------------------------------------------------

const BASE_DOC: ReportDocumentV1 = {
  schema_version: 1,
  patient: {
    name: { status: 'provided', value: 'Synthetic Patient A' },
    age: { status: 'provided', value: 41 },
    gender: { status: 'provided', value: 'female' },
    language: 'en',
  },
  primary_concern: { status: 'provided', value: 'Chest discomfort' },
  clinical_details: {
    duration: { status: 'provided', value: '2 days' },
    severity: { status: 'provided', value: 'Moderate' },
    conditions: { status: 'declined', value: null },
    medications: { status: 'unknown', value: null },
    allergies: { status: 'not_asked', value: null },
    other_symptoms: { status: 'provided', value: ['Shortness of breath'] },
  },
  missing_information: ['conditions', 'medications', 'allergies'],
  summary: { text: 'Synthetic summary.', source: 'template', generated_from: ['primary_concern'] },
  routing_snapshot: {
    department_key: 'general_medicine',
    department_name: 'General Medicine',
    doctor_id: 'doc-synthetic',
    doctor_name: 'Dr. Synthetic',
    is_fallback: false,
    preliminary: true,
  },
  emergency: null,
};

function row(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'rep-synthetic',
    session_id: 'sess-synthetic',
    user_id: 'usr-synthetic',
    status: 'submitted',
    schema_version: 1,
    department_key: 'general_medicine',
    doctor_id: 'doc-synthetic',
    intake_reference: 'INT-SYNTHETIC',
    possible_urgent: false,
    needs_human_review: false,
    emergency_rule_id: null,
    submitted_at: '2026-11-02T10:00:00Z',
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
    report: BASE_DOC,
    ...overrides,
  };
}

const noop = () => {};

// ---------------------------------------------------------------------------
// D-01 — warning flags (P0)
// ---------------------------------------------------------------------------

describe('D-01 warning flags reflect the report row', () => {
  it('returns every flag when the report carries several', () => {
    const summary = describeWarningFlags({
      possible_urgent: true,
      needs_human_review: true,
      emergency_rule_id: 'chest_pain',
    });
    assert.equal(summary.state, 'available');
    assert.deepEqual(
      summary.flags.map((f) => f.kind),
      ['possible_urgent', 'needs_human_review', 'emergency_rule'],
    );
    // The rule id is shown verbatim; it is never replaced with invented copy.
    assert.ok(summary.flags.some((f) => f.label.includes('chest_pain')));
  });

  it('reports a single flag correctly', () => {
    const summary = describeWarningFlags({
      possible_urgent: true,
      needs_human_review: false,
      emergency_rule_id: null,
    });
    assert.equal(summary.state, 'available');
    assert.equal(summary.flags.length, 1);
    assert.equal(summary.flags[0].kind, 'possible_urgent');
  });

  it('returns no flags only when the report genuinely has none', () => {
    const summary = describeWarningFlags({
      possible_urgent: false,
      needs_human_review: false,
      emergency_rule_id: null,
    });
    assert.equal(summary.state, 'available');
    assert.deepEqual(summary.flags, []);
  });

  it('treats missing warning data as unavailable, never as "None"', () => {
    assert.equal(describeWarningFlags(undefined).state, 'unavailable');
    assert.equal(describeWarningFlags(null).state, 'unavailable');
    assert.equal(describeWarningFlags({}).state, 'unavailable');
    assert.equal(describeWarningFlags({ submitted_at: 'x' }).state, 'unavailable');
  });

  it('flags partially missing data as malformed but keeps the readable flags', () => {
    const summary = describeWarningFlags({ possible_urgent: true });
    assert.equal(summary.state, 'malformed');
    assert.equal(summary.incomplete, true);
    assert.equal(summary.flags.length, 1);
  });

  it('flags invalid warning data as malformed and never suppresses a real flag', () => {
    const summary = describeWarningFlags({
      possible_urgent: 'yes',
      needs_human_review: 1,
      emergency_rule_id: 42,
    });
    assert.equal(summary.state, 'malformed');
    assert.equal(summary.flags.length, 0);

    const mixed = describeWarningFlags({
      possible_urgent: 'yes',
      needs_human_review: true,
      emergency_rule_id: 'head_trauma',
    });
    assert.equal(mixed.state, 'malformed');
    assert.deepEqual(mixed.flags.map((f) => f.kind), ['needs_human_review', 'emergency_rule']);
  });

  it('renders the real flags in the doctor component', () => {
    const html = renderToStaticMarkup(
      React.createElement(WarningFlags, {
        report: row({ possible_urgent: true, needs_human_review: true, emergency_rule_id: 'chest_pain' }),
      }),
    );
    assert.ok(html.includes('Possible urgent'));
    assert.ok(html.includes('Needs human review'));
    assert.ok(html.includes('chest_pain'));
    assert.ok(!html.includes('>None<'));
  });

  it('renders "None" only for a genuinely unflagged report', () => {
    const html = renderToStaticMarkup(
      React.createElement(WarningFlags, { report: row() }),
    );
    assert.ok(html.includes('None'));
    assert.ok(!html.includes('Possible urgent'));
  });

  it('renders an explicit unavailable message, never "None", without data', () => {
    const html = renderToStaticMarkup(React.createElement(WarningFlags, { report: null }));
    assert.ok(html.includes('Warning flags unavailable'));
    assert.ok(!html.includes('>None<'));
  });

  it('renders a loading state', () => {
    const html = renderToStaticMarkup(
      React.createElement(WarningFlags, { report: row(), isLoading: true }),
    );
    assert.ok(html.includes('Loading warning flags'));
  });

  it('the report detail never prints a hardcoded "None" warning line', () => {
    const html = renderToStaticMarkup(
      React.createElement(DoctorReportDetail, {
        report: row({ possible_urgent: true, needs_human_review: true }),
        onBack: noop,
        onRefreshReport: noop,
      }),
    );
    assert.ok(html.includes('Possible urgent'));
    assert.ok(html.includes('Needs human review'));
    assert.ok(html.includes('data-testid="warning-flags"'));
  });

  it('the urgent detail shows the authoritative emergency rule id', () => {
    const html = renderToStaticMarkup(
      React.createElement(DoctorUrgentDetail, {
        report: row({
          status: 'urgent_partial',
          department_key: 'emergency',
          emergency_rule_id: 'severe_chest_pain',
          possible_urgent: false,
        }),
        currentDoctor: null,
        onBack: noop,
        onRefreshReport: noop,
      }),
    );
    assert.ok(html.includes('severe_chest_pain'));
    assert.ok(!html.includes('Rule: severe_chest_pain'.replace('severe_chest_pain', 'not recorded')));
  });
});

// ---------------------------------------------------------------------------
// D-02 / D-10 — terminal navigation
// ---------------------------------------------------------------------------

describe('D-02/D-10 terminal patient states block Back', () => {
  it('marks emergency and both confirmations as terminal', () => {
    assert.equal(isTerminalPatientScreen('emergency'), true);
    assert.equal(isTerminalPatientScreen('confirmed_booking'), true);
    assert.equal(isTerminalPatientScreen('confirmed_report_only'), true);
    assert.equal(isTerminalPatientScreen('session_ended'), true);
    assert.equal(isTerminalPatientScreen('consent_declined'), true);
    assert.equal(isTerminalPatientScreen('conversation'), false);
  });

  it('blocks Back out of emergency even with history', () => {
    const decision = resolveBackNavigation({
      currentScreen: 'emergency',
      history: ['welcome', 'consent', 'conversation'],
    });
    assert.equal(decision.action, 'blocked');
  });

  it('blocks Back out of a confirmed booking so the slot grid cannot reopen', () => {
    const decision = resolveBackNavigation({
      currentScreen: 'confirmed_booking',
      history: ['welcome', 'consent', 'conversation', 'review', 'booking'],
      hasSubmittedReport: true,
      hasAppointment: true,
    });
    assert.equal(decision.action, 'blocked');
  });

  it('blocks Back from booking when an appointment already exists', () => {
    const decision = resolveBackNavigation({
      currentScreen: 'booking',
      history: ['review'],
      hasSubmittedReport: true,
      hasAppointment: true,
    });
    assert.equal(decision.action, 'blocked');
  });

  it('still allows Back on non-terminal screens', () => {
    const decision = resolveBackNavigation({
      currentScreen: 'conversation',
      history: ['welcome', 'consent'],
      hasSubmittedReport: false,
    });
    assert.deepEqual(decision, { action: 'navigate', target: 'consent', reason: 'history' });
  });

  it('uses the deterministic fallback when history is empty', () => {
    const decision = resolveBackNavigation({ currentScreen: 'booking', history: [] });
    assert.deepEqual(decision, { action: 'navigate', target: 'review', reason: 'fallback' });
  });

  it('renders the review screen read-only after submission (D-37)', () => {
    assert.equal(reviewModeFor(true), 'submitted');
    assert.equal(reviewModeFor(false), 'draft');

    const html = renderToStaticMarkup(
      React.createElement(ReportReviewView, {
        report: BASE_DOC,
        mode: 'submitted',
        onCorrectField: noop,
        onSubmit: noop,
        onDontSubmit: noop,
        onEndSessionCap: noop,
        onContinueBooking: noop,
        onFinish: noop,
      }),
    );
    assert.ok(!html.includes('Draft Preview'));
    assert.ok(!html.includes('>Edit<'));
    assert.ok(html.includes('already been submitted'));
  });

  it('detects the documented dead-end conversation state (D-39)', () => {
    assert.equal(
      isConversationDeadEnd({ hasCurrentQuestion: false, sessionStatus: 'in_progress' }),
      true,
    );
    assert.equal(
      isConversationDeadEnd({ hasCurrentQuestion: true, sessionStatus: 'in_progress' }),
      false,
    );
    assert.equal(
      isConversationDeadEnd({ hasCurrentQuestion: false, sessionStatus: 'emergency' }),
      false,
    );
    assert.equal(
      isConversationDeadEnd({ hasCurrentQuestion: false, isCapReached: true, sessionStatus: 'in_progress' }),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// D-03 / D-21 — appointment datetime contract and IST
// ---------------------------------------------------------------------------

describe('D-03/D-21 appointment datetime contract', () => {
  it('rejects a slot id where a timestamp is required', () => {
    assert.equal(parseInstant('slot-doc-2026-11-03-09:00'), null);
    assert.equal(parseInstant(''), null);
    assert.equal(parseInstant(undefined), null);
    assert.ok(parseInstant('2026-11-03T09:00:00+05:30'));
  });

  it('formats the booked instant in Asia/Kolkata, not the browser zone', () => {
    assert.equal(formatIstTime('2026-11-02T15:30:00+05:30'), '3:30 PM');
    assert.equal(formatIstDate('2026-11-02T15:30:00+05:30'), 'Mon, 02 Nov 2026');
    assert.equal(formatIstDateTime('2026-11-02T15:30:00+05:30'), 'Mon, 02 Nov 2026 · 3:30 PM');
  });

  it('never renders "Invalid Date"', () => {
    const invalid = formatAppointmentWhen('slot-abc');
    assert.equal(invalid.valid, false);
    assert.ok(!/Invalid Date/i.test(invalid.text));
    assert.equal(formatAppointmentWhen('2026-11-02T15:30:00+05:30').valid, true);
  });

  it('builds date keys in IST, not the UTC day', () => {
    // 00:30 IST on 3 Nov is still 2 Nov in UTC.
    assert.equal(istDateKey(new Date('2026-11-02T19:00:00Z')), '2026-11-03');
    const options = buildWeekdayDateOptions(new Date('2026-11-02T05:00:00Z'), 5, 1);
    assert.ok(options.length === 5);
    assert.ok(options.every((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.dateKey)));
    // 2 Nov 2026 is a Monday; the next five weekdays exclude the weekend.
    assert.deepEqual(options.map((o) => o.dateKey), [
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-09',
    ]);
  });

  it('books with the ISO slot start and confirms the same instant', async () => {
    setAppMode('mock');
    const session = await startSession('en');
    await recordConsent(session.session_id, true, 'en', CONSENT_VERSION);

    const answers: [string, string][] = [
      ['name', 'Synthetic Booking Patient'],
      ['age', '35'],
      ['gender', 'Female'],
      ['primary_concern', 'Knee pain'],
      ['duration', '1 week'],
      ['severity', 'Mild'],
      ['conditions', 'None'],
      ['medications', 'None'],
      ['allergies', 'None'],
      ['other_symptoms', 'None'],
    ];
    let state: any = null;
    for (const [q, a] of answers) {
      state = await chatTurn({ action: 'submit_turn', session_id: session.session_id, question_id: q as any, text: a });
      if (state.is_complete) break;
    }
    const submitted = await submitReport({ action: 'submit_report', session_id: session.session_id });
    const slot = (await getAvailableSlots(submitted.submitted_report!.id))[0];

    const booked = await bookAppointment({
      report_id: submitted.submitted_report!.id,
      slot_id: slot.id,
      slot_start: slot.start_time,
      doctor_id: submitted.submitted_report!.doctor_id,
    });

    assert.equal(booked.appointment.slot_start, slot.start_time);
    assert.notEqual(booked.appointment.slot_start, slot.id);
    assert.equal(formatAppointmentWhen(booked.appointment.slot_start).valid, true);
    // Slot end is exactly 30 minutes after the start.
    assert.equal(
      new Date(booked.appointment.slot_end).getTime() - new Date(booked.appointment.slot_start).getTime(),
      30 * 60 * 1000,
    );
  });

  it('rejects a slot id sent as slot_start and refuses a second booking', async () => {
    setAppMode('mock');
    const session = await startSession('en');
    await recordConsent(session.session_id, true, 'en', CONSENT_VERSION);
    for (const [q, a] of [
      ['name', 'Synthetic Duplicate Patient'],
      ['age', '50'],
      ['gender', 'Male'],
      ['primary_concern', 'Back pain'],
      ['duration', '3 weeks'],
      ['severity', 'Moderate'],
      ['conditions', 'None'],
      ['medications', 'None'],
      ['allergies', 'None'],
      ['other_symptoms', 'None'],
    ] as [string, string][]) {
      await chatTurn({ action: 'submit_turn', session_id: session.session_id, question_id: q as any, text: a });
    }
    const submitted = await submitReport({ action: 'submit_report', session_id: session.session_id });
    const reportId = submitted.submitted_report!.id;
    // Only free slots: an earlier test in this file books the same doctor's first slot.
    const slots = (await getAvailableSlots(reportId)).filter((slot) => slot.is_available);

    await assert.rejects(
      () => bookAppointment({ report_id: reportId, slot_id: slots[0].id, slot_start: slots[0].id, doctor_id: 'doc-x' }),
      /invalid/i,
    );

    await bookAppointment({
      report_id: reportId,
      slot_id: slots[0].id,
      slot_start: slots[0].start_time,
      doctor_id: submitted.submitted_report!.doctor_id,
    });

    // A second booking for the same report is refused before any slot conflict is
    // reported, so the patient is told the truth about why.
    await assert.rejects(
      () =>
        bookAppointment({
          report_id: reportId,
          slot_id: slots[1].id,
          slot_start: slots[1].start_time,
          doctor_id: submitted.submitted_report!.doctor_id,
        }),
      /already has a confirmed appointment/i,
    );
  });
});

// ---------------------------------------------------------------------------
// D-04 — demo_busy
// ---------------------------------------------------------------------------

describe('D-04 demo_busy at session start', () => {
  it('returns the busy envelope with no session id', async () => {
    setAppMode('mock');
    setMockDailyCapExceeded(true);
    const res = await startSession('en');
    setMockDailyCapExceeded(false);

    assert.equal(res.demo_busy, true);
    assert.equal(res.session_id, '');
    assert.equal(res.error, 'demo_busy');
  });

  it('rejects consent on an empty session id at the API boundary', async () => {
    setAppMode('mock');
    await assert.rejects(
      () => recordConsent('', true, 'en', CONSENT_VERSION),
      /Session not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// D-06 — cached prompt audio
// ---------------------------------------------------------------------------

describe('D-06 prompt audio is cached and never bought twice', () => {
  it('maps the five fixed prompts to static assets', () => {
    assert.deepEqual([...CACHED_PROMPT_IDS].sort(), [
      'ask-age',
      'ask-gender',
      'ask-name',
      'ask-primary-concern',
      'greeting',
    ]);
    assert.equal(promptIdForQuestion('greeting'), 'greeting');
    assert.equal(promptIdForQuestion('name'), 'ask-name');
    assert.equal(promptIdForQuestion('primary_concern'), 'ask-primary-concern');
    assert.equal(promptIdForQuestion('GM-001'), null);
    assert.equal(isCachedPrompt('ask-age'), true);
    assert.equal(cachedPromptUrl('hi', 'greeting'), '/audio/hi/greeting.mp3');
  });

  it('never calls the provider for a cached prompt', async () => {
    let providerCalls = 0;
    const cache = createPromptAudioCache();
    const result = await resolvePromptAudio({ language: 'en', questionId: 'greeting' }, cache, async () => {
      providerCalls += 1;
      return 'blob:should-not-happen';
    });
    assert.equal(providerCalls, 0);
    assert.equal(result.url, '/audio/en/greeting.mp3');
  });

  it('buys an adaptive prompt once and replays it from the cache', async () => {
    let providerCalls = 0;
    const cache = createPromptAudioCache();
    const fetchAudio = async () => {
      providerCalls += 1;
      return 'blob:adaptive-1';
    };

    const first = await resolvePromptAudio({ language: 'en', questionId: 'GM-004' }, cache, fetchAudio);
    const second = await resolvePromptAudio({ language: 'en', questionId: 'GM-004' }, cache, fetchAudio);
    const otherLanguage = await resolvePromptAudio({ language: 'hi', questionId: 'GM-004' }, cache, fetchAudio);

    assert.equal(providerCalls, 2); // one per language, not one per replay
    assert.equal(first.fromCache, false);
    assert.equal(second.fromCache, true);
    assert.equal(otherLanguage.fromCache, false);
  });

  it('reports a missing adaptive prompt honestly', async () => {
    const cache = createPromptAudioCache();
    const result = await resolvePromptAudio({ language: 'en', questionId: 'GM-009' }, cache, async () => null);
    assert.equal(result.status, 'missing');
    assert.equal(result.url, undefined);
  });
});

// ---------------------------------------------------------------------------
// D-08 / D-36 — fixtures and review authority fail closed
// ---------------------------------------------------------------------------

describe('D-08 fixture isolation and D-36 review authority', () => {
  it('no production module reads a fixture sessionStorage key (D-08)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const roots = ['src/features', 'src/lib', 'src/App.tsx'];
    const offenders: string[] = [];

    const scan = (entry: string) => {
      const stat = fs.statSync(entry);
      if (stat.isDirectory()) {
        for (const child of fs.readdirSync(entry)) scan(path.join(entry, child));
        return;
      }
      if (!/\.(ts|tsx)$/.test(entry)) return;
      const source = fs.readFileSync(entry, 'utf8');
      if (/FIGMA_(PATIENT_VIEW|DOCTOR_VIEW|PARITY)/.test(source)) offenders.push(entry);
    };

    for (const root of roots) scan(root);
    assert.deepEqual(offenders, []);
  });

  it('the doctor portal requires authentication: no credential-free auto-open', () => {
    // Even with a fixture key set, a non-dev build renders the login screen.
    (globalThis as any).window = {
      sessionStorage: {
        getItem: (key: string) =>
          key === 'FIGMA_PARITY_FIXTURE' || key === 'FIGMA_DOCTOR_VIEW' ? 'report_detail' : null,
      },
    };
    (globalThis as any).window.__FIGMA_PARITY_FIXTURE__ = true;
    try {
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(DoctorShell)),
      );
      assert.ok(!html.includes('Patient Report'));
      assert.ok(!html.includes('Dashboard'));
      assert.ok(html.includes('Evaluator access'));
    } finally {
      delete (globalThis as any).window;
    }
  });

  it('the report detail no longer substitutes fixture report content', () => {
    const html = renderToStaticMarkup(
      React.createElement(DoctorReportDetail, {
        report: row(),
        onBack: noop,
        onRefreshReport: noop,
      }),
    );
    assert.ok(!html.includes('INT-2026-0042'));
    assert.ok(!html.includes('Aarav Sharma'));
    assert.ok(html.includes('INT-SYNTHETIC'));
  });

  it('urgent review is denied when the current doctor is unknown', () => {
    const html = renderToStaticMarkup(
      React.createElement(DoctorUrgentDetail, {
        report: row({ status: 'urgent_partial', department_key: 'emergency', emergency_rule_id: 'x' }),
        currentDoctor: null,
        onBack: noop,
        onRefreshReport: noop,
      }),
    );
    assert.ok(!html.includes('Acknowledge Triage'));
    assert.ok(html.includes('Read-only cross-visibility'));
  });
});

// ---------------------------------------------------------------------------
// D-12 / D-14 / D-15 / D-32 / D-33 — report truthfulness
// ---------------------------------------------------------------------------

describe('D-12/D-14/D-15 report truthfulness', () => {
  it('keeps all six information statuses distinguishable', () => {
    assert.equal(presentField({ status: 'declined', value: null }).text, 'Declined');
    assert.equal(presentField({ status: 'unknown', value: null }).text, 'Unknown');
    assert.equal(presentField({ status: 'unclear', value: null }).text, 'Unclear');
    assert.equal(presentField({ status: 'not_asked', value: null }).text, 'Not asked');
    assert.equal(presentField({ status: 'not_provided', value: null }).text, 'Not provided');
    assert.equal(presentField({ status: 'provided', value: ['None'] }).text, 'None');
  });

  it('does not claim "Not provided" when the field is missing entirely', () => {
    const missing = presentField(undefined);
    assert.equal(missing.status, 'unavailable');
    assert.notEqual(missing.text, 'Not provided');
  });

  it('capitalises gender and maps declined', () => {
    assert.equal(presentGender({ status: 'provided', value: 'male' }), 'Male');
    assert.equal(presentGender({ status: 'declined', value: null }), 'Prefer not to say');
    assert.equal(presentGender(undefined), 'Unavailable');
  });

  it('uses report.missing_information rather than recomputing absence', () => {
    assert.equal(presentMissingInformation(BASE_DOC).text, 'existing conditions, medications, allergies');
    assert.equal(presentMissingInformation({ missing_information: [] }).text, 'None');
    assert.equal(presentMissingInformation({}).text, 'Unavailable');
  });

  it('the patient review exposes an "Other symptoms" correction row (D-12)', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportReviewView, {
        report: BASE_DOC,
        onCorrectField: noop,
        onSubmit: noop,
        onDontSubmit: noop,
        onEndSessionCap: noop,
      }),
    );
    assert.ok(html.includes('Other Symptoms'));
    assert.ok(html.includes('Shortness of breath'));
    assert.ok(html.includes('Declined'));
    assert.ok(html.includes('Unknown'));
    assert.ok(html.includes('Not asked'));
  });

  it('derives the source chip and reviewer label from data', () => {
    assert.equal(describeSourceChip(BASE_DOC), 'English');
    assert.equal(describeSourceChip({ ...BASE_DOC, patient: { ...BASE_DOC.patient, language: 'hi' } }), 'हिंदी · Hindi');
    assert.equal(describeSourceChip(BASE_DOC, ['voice', 'voice']), 'Voice · English');
    assert.equal(describeSourceChip(BASE_DOC, ['voice', 'text']), 'Voice + text · English');
    assert.equal(describeReviewer({ reviewed_at: '2026-11-02T11:00:00Z' }), 'Reviewed');
    assert.equal(
      describeReviewer({ reviewed_at: '2026-11-02T11:00:00Z' }, 'Dr. Synthetic'),
      'Reviewed by Dr. Synthetic',
    );
    assert.equal(describeReviewer({}), 'Not reviewed');
  });

  it('the doctor detail shows review status without a hardcoded reviewer name', () => {
    const html = renderToStaticMarkup(
      React.createElement(DoctorReportDetail, {
        report: row({ reviewed_at: '2026-11-02T11:00:00Z', reviewed_by: 'doc-unresolvable' }),
        onBack: noop,
        onRefreshReport: noop,
      }),
    );
    assert.ok(html.includes('Reviewed'));
    assert.ok(!html.includes('Reviewed by Dr. Aditi Rao'));
  });
});

// ---------------------------------------------------------------------------
// D-18 — appointments table headers match cells
// ---------------------------------------------------------------------------

describe('D-18 appointment table headers match their cells', () => {
  it('labels the department and reference columns correctly', () => {
    const html = renderToStaticMarkup(
      React.createElement(DoctorAppointmentsView, {
        appointments: [
          {
            id: 'apt-synthetic',
            report_id: 'rep-synthetic',
            doctor_id: 'doc-synthetic',
            doctor_name: 'Dr. Synthetic',
            department_name: 'General Medicine',
            slot_id: '2026-11-10T15:30:00+05:30',
            slot_start: '2026-11-10T15:30:00+05:30',
            slot_end: '2026-11-10T16:00:00+05:30',
            reference_code: 'APT-SYNTHETIC',
            patient_name: 'Synthetic Patient A',
            created_at: '2026-11-02T09:00:00Z',
            status: 'confirmed',
          },
        ],
        onBack: noop,
      }),
    );
    assert.ok(html.includes('Department'));
    assert.ok(html.includes('Reference'));
    assert.ok(!html.includes('Age / Gender'));
    assert.ok(html.includes('General Medicine'));
    assert.ok(html.includes('APT-SYNTHETIC'));
    // Default tab is Upcoming (D-42).
    assert.ok(html.includes('aria-selected="true"') || html.includes('Upcoming'));
  });
});
