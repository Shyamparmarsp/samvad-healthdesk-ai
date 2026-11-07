/**
 * Samwad Assistant (doctor) — summary, authorisation and wiring tests.
 *
 * Covered here:
 *   - Hindi rendering for all six doctor contexts, in Devanagari, from real counts
 *   - Asia/Kolkata greeting buckets and appointment clock formatting
 *   - "counts come from rows" (no hardcoded figures) and honest empty states
 *   - safety language: no diagnosis, no prescription, no invented contact/ambulance claim
 *   - strict `speak` fact validation (no free text, no unknown keys)
 *   - `speakDoctorSummary` never claims audio it did not receive
 *   - the assistant is wired into all six doctor pages and none of the patient pages
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  MAX_SUMMARY_CHARACTERS,
  istDateKey,
  istTimeOfDay,
  parseSummaryFacts,
  renderHindiSummary,
  type AppointmentCounts,
  type ReportCounts,
  type SummaryFacts,
} from '../supabase/functions/_shared/doctor-summary';
import {
  buildAppointmentCounts,
  buildAppointmentsFacts,
  buildDashboardFacts,
  buildReportCounts,
  buildReportDetailFacts,
  buildReportsFacts,
  buildUrgentDetailFacts,
  buildUrgentReviewFacts,
} from '../src/lib/assistant-summary';
import { speakDoctorSummary, setAppMode } from '../src/lib/api';
import type { ReportRow } from '../src/types/report';
import type { Appointment } from '../src/types/doctor';

const EMPTY_REPORTS: ReportCounts = {
  total: 0,
  today: 0,
  awaiting_review: 0,
  complete: 0,
  partial: 0,
  reviewed: 0,
  urgent: 0,
};

const EMPTY_APPOINTMENTS: AppointmentCounts = {
  today: 0,
  today_upcoming: 0,
  today_completed: 0,
  future: 0,
  past: 0,
  cancelled: 0,
  next_starts: [],
  next_is_today: false,
};

const DEVANAGARI = /[\u0900-\u097F]/;
/** Latin letters are only allowed inside a bracket-free sentence if they are a unit. */
const LATIN_WORD = /[A-Za-z]{2,}/;

function report(overrides: Partial<ReportRow> = {}): ReportRow {
  const base: ReportRow = {
    id: 'r1',
    session_id: 's1',
    user_id: 'u1',
    status: 'submitted',
    schema_version: 1,
    department_key: 'general_medicine',
    doctor_id: 'd1',
    intake_reference: 'INT-20261105-ABCDEF',
    possible_urgent: false,
    needs_human_review: false,
    emergency_rule_id: null,
    submitted_at: '2026-11-05T04:00:00.000Z',
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-11-05T04:00:00.000Z',
    updated_at: '2026-11-05T04:00:00.000Z',
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Vikram Kumar' },
        age: { status: 'provided', value: 45 },
        gender: { status: 'provided', value: 'male' },
        language: 'hi',
      },
      primary_concern: { status: 'provided', value: 'सीने में दर्द' },
      clinical_details: {
        duration: { status: 'provided', value: 'दो दिन' },
        severity: { status: 'provided', value: 'मध्यम' },
        conditions: { status: 'provided', value: [] },
        medications: { status: 'declined', value: null },
        allergies: { status: 'unknown', value: null },
        other_symptoms: { status: 'not_asked', value: null },
      },
      missing_information: ['other_symptoms'],
      summary: null,
      routing_snapshot: {
        department_key: 'general_medicine',
        department_name: 'General Medicine',
        doctor_id: 'd1',
        doctor_name: 'Dr. Aditi Rao',
        is_fallback: false,
        preliminary: true,
      },
      emergency: null,
    },
  };
  return { ...base, ...overrides };
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a1',
    report_id: 'r1',
    doctor_id: 'd1',
    doctor_name: 'Dr. Aditi Rao',
    department_name: 'General Medicine',
    slot_id: 's1',
    slot_start: '2026-11-05T04:00:00.000Z', // 09:30 IST
    slot_end: '2026-11-05T04:30:00.000Z',
    reference_code: 'APT-20261105-K9X2',
    patient_name: 'Vikram Kumar',
    created_at: '2026-11-04T04:00:00.000Z',
    status: 'confirmed',
    ...overrides,
  };
}

/** 2026-11-05T03:00:00Z is 08:30 IST on 5 November 2026. */
const MORNING = new Date('2026-11-05T03:00:00.000Z');
const AFTERNOON = new Date('2026-11-05T08:30:00.000Z'); // 14:00 IST
const EVENING = new Date('2026-11-05T14:00:00.000Z'); // 19:30 IST
const NIGHT = new Date('2026-11-05T19:30:00.000Z'); // 01:00 IST next day

function dashboardFacts(overrides: {
  reports?: Partial<ReportCounts>;
  appointments?: Partial<AppointmentCounts>;
  intent?: 'greeting' | 'summary';
  now?: Date;
} = {}): SummaryFacts {
  const now = overrides.now ?? MORNING;
  return {
    v: 1,
    context: 'dashboard',
    intent: overrides.intent ?? 'greeting',
    time_of_day: istTimeOfDay(now),
    reports: { ...EMPTY_REPORTS, ...overrides.reports },
    appointments: { ...EMPTY_APPOINTMENTS, ...overrides.appointments },
  };
}

describe('Doctor assistant — Hindi rendering', () => {
  it('1. uses an appropriate Asia/Kolkata greeting and never assumes a gender', () => {
    assert.equal(istTimeOfDay(MORNING), 'morning');
    assert.equal(istTimeOfDay(AFTERNOON), 'afternoon');
    assert.equal(istTimeOfDay(EVENING), 'evening');
    assert.equal(istTimeOfDay(NIGHT), 'night');

    assert.match(renderHindiSummary(dashboardFacts({ now: MORNING })), /^सुप्रभात डॉक्टर!/);
    assert.match(renderHindiSummary(dashboardFacts({ now: AFTERNOON })), /^नमस्कार डॉक्टर!/);
    assert.match(renderHindiSummary(dashboardFacts({ now: EVENING })), /^शुभ संध्या डॉक्टर!/);
    assert.match(renderHindiSummary(dashboardFacts({ now: NIGHT })), /^नमस्कार डॉक्टर!/);

    const text = renderHindiSummary(dashboardFacts({ now: EVENING }));
    assert.doesNotMatch(text, /मैडम|मैडम जी|सर\b/, 'no gendered address');
  });

  it('2. greeting counts come from the supplied facts, never from a fixed example', () => {
    const small = renderHindiSummary(
      dashboardFacts({
        reports: { total: 3, today: 3, awaiting_review: 2, partial: 1, complete: 1, reviewed: 0, urgent: 1 },
        appointments: { today: 4, today_upcoming: 2, today_completed: 0, next_starts: ['2026-11-05T04:00:00.000Z'], next_is_today: true },
      }),
    );
    assert.match(small, /आज आपके कुल 4 अपॉइंटमेंट निर्धारित हैं/);
    assert.match(small, /इनमें से 2 अपॉइंटमेंट अभी आने वाले हैं|इनमें 2 अपॉइंटमेंट अभी आने वाले हैं/);
    assert.match(small, /आज आपको 3 नई रिपोर्ट प्राप्त हुई हैं/);
    assert.match(small, /1 रिपोर्ट अत्यावश्यक श्रेणी में है/);
    assert.match(small, /2 रिपोर्ट समीक्षा की प्रतीक्षा में हैं/);
    assert.match(small, /आपका अगला अपॉइंटमेंट सुबह 9:30 बजे है/);

    const large = renderHindiSummary(
      dashboardFacts({
        reports: { total: 12, today: 7, awaiting_review: 5, partial: 2, complete: 9, reviewed: 3, urgent: 2 },
        appointments: { today: 11, today_upcoming: 6, next_starts: ['2026-11-05T05:15:00.000Z'], next_is_today: true },
      }),
    );
    assert.match(large, /11 अपॉइंटमेंट/);
    assert.match(large, /7 नई रिपोर्ट/);
    assert.doesNotMatch(large, /कुल 4 अपॉइंटमेंट/, 'the brief example count must not be hardcoded');
  });

  it('3. a click summary is not a second greeting', () => {
    const greeting = renderHindiSummary(dashboardFacts({ intent: 'greeting' }));
    const summary = renderHindiSummary(dashboardFacts({ intent: 'summary' }));
    assert.match(greeting, /^सुप्रभात डॉक्टर!/);
    assert.match(summary, /^डॉक्टर,/);
    assert.doesNotMatch(summary, /सुप्रभात/);
    assert.notEqual(greeting, summary);
  });

  it('4. an empty dashboard states the absence of work instead of inventing activity', () => {
    const text = renderHindiSummary(dashboardFacts({ intent: 'summary' }));
    assert.match(text, /आज कोई अपॉइंटमेंट निर्धारित नहीं है/);
    assert.match(text, /अभी आपके पास कोई रिपोर्ट उपलब्ध नहीं है/);
    assert.doesNotMatch(text, /\d+ (अपॉइंटमेंट|रिपोर्ट)/);
  });

  it('5. completed appointments are reported without a next-slot claim', () => {
    const text = renderHindiSummary(
      dashboardFacts({
        appointments: { today: 2, today_upcoming: 0, today_completed: 2, next_starts: [], next_is_today: false },
      }),
    );
    assert.match(text, /आज के सभी अपॉइंटमेंट पूरे हो चुके हैं/);
    assert.doesNotMatch(text, /आपका अगला अपॉइंटमेंट/);
  });

  it('6. reports list honours the active tab, the search and the displayed rows', () => {
    const facts: SummaryFacts = {
      v: 1,
      context: 'reports',
      time_of_day: 'morning',
      tab: 'urgent',
      search: true,
      reports: { total: 2, today: 1, awaiting_review: 1, partial: 1, complete: 1, reviewed: 0, urgent: 1 },
    };
    const text = renderHindiSummary(facts);
    assert.match(text, /‘अत्यावश्यक’ फ़िल्टर लागू है/);
    assert.match(text, /खोज लागू है/);
    assert.match(text, /इस सूची में 2 रिपोर्ट दिखाई दे रही हैं/);
    assert.match(text, /1 रिपोर्ट का इंटेक अधूरा है/);

    const empty = renderHindiSummary({ ...facts, reports: EMPTY_REPORTS });
    assert.match(empty, /इस चयन में अभी कोई रिपोर्ट नहीं है/);
  });

  it('7. appointments summary uses the selected tab and the real schedule', () => {
    const upcoming = renderHindiSummary({
      v: 1,
      context: 'appointments',
      time_of_day: 'morning',
      tab: 'upcoming',
      appointments: {
        today: 0,
        today_upcoming: 0,
        today_completed: 0,
        future: 3,
        past: 0,
        cancelled: 0,
        next_starts: ['2026-11-09T03:30:00.000Z'],
        next_is_today: false,
      },
    });
    assert.match(upcoming, /आने वाले दिनों में 3 अपॉइंटमेंट निर्धारित हैं/);
    assert.match(upcoming, /अगला अपॉइंटमेंट 9 नवंबर को सुबह 9 बजे है/);

    const past = renderHindiSummary({
      v: 1,
      context: 'appointments',
      time_of_day: 'morning',
      tab: 'past',
      appointments: { ...EMPTY_APPOINTMENTS, past: 4 },
    });
    assert.match(past, /पिछले अपॉइंटमेंट में 4 प्रविष्टि/);

    const none = renderHindiSummary({
      v: 1,
      context: 'appointments',
      time_of_day: 'morning',
      tab: 'today',
      appointments: EMPTY_APPOINTMENTS,
    });
    assert.match(none, /आज कोई अपॉइंटमेंट निर्धारित नहीं है/);
  });

  it('8. a partial report detail names the missing information, not a diagnosis', () => {
    const row = report({ status: 'partial' });
    const facts = buildReportDetailFacts(row, MORNING);
    const text = renderHindiSummary(facts);

    assert.match(text, /यह रिपोर्ट अधूरी है/);
    assert.match(text, /मरीज़ ने अपनी मुख्य परेशानी दर्ज की है/);
    assert.match(text, /जानकारी अभी प्राप्त नहीं हुई/);
    assert.match(text, /समीक्षा अभी बाकी है/);
    assert.doesNotMatch(text, /निदान|दवा|इलाज|उपचार|संभावना/);
    assert.doesNotMatch(text, /Vikram/, 'no patient name is spoken');
  });

  it('9. urgent detail keeps the stored urgency and makes no contact claim', () => {
    const row = report({
      status: 'urgent_partial',
      emergency_rule_id: 'severe_chest_pain',
      report: {
        ...report().report,
        emergency: { rule_id: 'severe_chest_pain', patient_statement: 'सीने में तेज़ दर्द', triggered_at: '2026-11-05T04:00:00.000Z' },
      },
    });
    const text = renderHindiSummary(buildUrgentDetailFacts(row, [row, report({ id: 'r2' })], MORNING));

    assert.match(text, /अत्यावश्यक सूची में इस समय 2 रिपोर्ट हैं/);
    assert.match(text, /सुरक्षा नियम के कारण अत्यावश्यक श्रेणी में दर्ज है/);
    assert.match(text, /सामान्य अपॉइंटमेंट उपलब्ध नहीं हैं/);
    assert.doesNotMatch(text, /एम्बुलेंस|112|सूचित कर दिया|डॉक्टर को बता दिया/);
    assert.doesNotMatch(text, /डॉक्टर को सूचित/);
  });

  it('10. urgent queue summary distinguishes pending and reviewed items', () => {
    const rows = [
      report({ id: 'r1', status: 'urgent_partial' }),
      report({ id: 'r2', status: 'urgent_partial', reviewed_at: '2026-11-05T05:00:00.000Z', reviewed_by: 'doc' }),
      report({ id: 'r3', status: 'urgent_partial' }),
    ];
    const text = renderHindiSummary(buildUrgentReviewFacts(rows, MORNING));
    assert.match(text, /अत्यावश्यक सूची में इस समय 3 रिपोर्ट हैं/);
    assert.match(text, /2 की समीक्षा बाकी है और 1 की समीक्षा पूरी हो चुकी है/);
    assert.match(text, /सामान्य अपॉइंटमेंट उपलब्ध नहीं हैं/);

    const empty = renderHindiSummary(buildUrgentReviewFacts([], MORNING));
    assert.match(empty, /अत्यावश्यक सूची खाली है/);
  });

  it('11. every rendered summary is Devanagari, short enough for Timbre, and free of identifiers', () => {
    const facts: SummaryFacts[] = [
      dashboardFacts({ intent: 'greeting' }),
      dashboardFacts({ intent: 'summary' }),
      {
        v: 1,
        context: 'reports',
        time_of_day: 'evening',
        tab: 'booked',
        search: false,
        reports: { total: 999, today: 999, awaiting_review: 999, partial: 999, complete: 999, reviewed: 999, urgent: 999 },
      },
      {
        v: 1,
        context: 'appointments',
        time_of_day: 'night',
        tab: 'upcoming',
        appointments: {
          today: 999,
          today_upcoming: 999,
          today_completed: 999,
          future: 999,
          past: 999,
          cancelled: 999,
          next_starts: ['2026-11-09T03:30:00.000Z', '2026-11-09T04:45:00.000Z', '2026-11-10T03:30:00.000Z'],
          next_is_today: false,
        },
      },
      buildReportDetailFacts(report(), MORNING),
      buildUrgentDetailFacts(report({ status: 'urgent_partial' }), [report({ id: 'r2' })], MORNING),
    ];

    for (const fact of facts) {
      const text = renderHindiSummary(fact);
      assert.ok(text.length > 0, `${fact.context} produced text`);
      assert.ok(text.length <= MAX_SUMMARY_CHARACTERS, `${fact.context} stays under the Timbre cap (${text.length})`);
      assert.match(text, DEVANAGARI, `${fact.context} is Devanagari`);
      assert.doesNotMatch(text, /INT-|APT-|\bVikram\b|\bKumar\b|@|\+91/, `${fact.context} carries no identifier`);
      // Latin letters may only appear inside a known administrative word (none expected).
      assert.doesNotMatch(text, LATIN_WORD, `${fact.context} is not English prose`);
      assert.doesNotMatch(text, /निदान|रोग की संभावना|दवा|इलाज|उपचार|पर्चा/);
      assert.doesNotMatch(text, /undefined|null|NaN/);
    }
  });

  it('12. the same facts always render the same sentence (screen text == spoken text)', () => {
    const facts = buildDashboardFacts({
      reports: [report(), report({ id: 'r2', status: 'partial' })],
      appointments: [appointment()],
      intent: 'greeting',
      now: MORNING,
    });
    assert.equal(renderHindiSummary(facts), renderHindiSummary(JSON.parse(JSON.stringify(facts))));
  });
});

describe('Doctor assistant — counting from records', () => {
  it('13. report counters follow the documented dashboard predicates', () => {
    const counts = buildReportCounts(
      [
        report({ id: 'r1' }), // submitted, pending review
        report({ id: 'r2', reviewed_at: '2026-11-05T05:00:00.000Z' }), // submitted, reviewed
        report({ id: 'r3', status: 'partial' }), // partial intake
        report({ id: 'r4', status: 'urgent_partial' }), // urgent
        report({ id: 'r5', created_at: '2026-11-03T04:00:00.000Z', submitted_at: '2026-11-03T04:00:00.000Z' }), // older
      ],
      MORNING,
    );

    assert.equal(counts.total, 5);
    assert.equal(counts.today, 4, '4 reports were received on 5 Nov IST');
    assert.equal(counts.awaiting_review, 2, 'r1 and r5 are submitted and not reviewed');
    assert.equal(counts.complete, 3, 'submitted rows only (r1, r2, r5)');
    assert.equal(counts.partial, 1);
    assert.equal(counts.reviewed, 1);
    assert.equal(counts.urgent, 1);
  });

  it('14. "today" is the Asia/Kolkata day, not the UTC day', () => {
    // 2026-11-05T19:00Z is 00:30 IST on 6 November.
    const lateNight = new Date('2026-11-05T19:00:00.000Z');
    assert.equal(istDateKey(lateNight), '2026-11-06');

    const counts = buildReportCounts([report({ submitted_at: '2026-11-05T19:00:00.000Z', created_at: '2026-11-05T19:00:00.000Z' })], lateNight);
    assert.equal(counts.today, 1, 'the report belongs to the new IST day');

    const nextMorning = buildReportCounts(
      [report({ submitted_at: '2026-11-05T19:00:00.000Z', created_at: '2026-11-05T19:00:00.000Z' })],
      new Date('2026-11-06T03:00:00.000Z'),
    );
    assert.equal(nextMorning.today, 1);
  });

  it('15. appointment counters separate today, upcoming, past and cancelled', () => {
    const counts = buildAppointmentCounts(
      [
        appointment({ id: 'a1', slot_start: '2026-11-05T04:00:00.000Z', slot_end: '2026-11-05T04:30:00.000Z' }), // 09:30 IST, future
        appointment({ id: 'a2', slot_start: '2026-11-05T01:00:00.000Z', slot_end: '2026-11-05T01:30:00.000Z' }), // 06:30 IST, done
        appointment({ id: 'a3', slot_start: '2026-11-09T04:00:00.000Z', slot_end: '2026-11-09T04:30:00.000Z' }), // future day
        appointment({ id: 'a4', slot_start: '2026-11-03T04:00:00.000Z', slot_end: '2026-11-03T04:30:00.000Z' }), // past day
        appointment({ id: 'a5', status: 'cancelled' }),
        appointment({ id: 'a6', slot_start: 'slot-doc-2026-11-05-09:00', slot_end: 'slot-doc-2026-11-05-09:30' }),
      ],
      MORNING,
    );

    assert.equal(counts.today, 2);
    assert.equal(counts.today_completed, 1);
    assert.equal(counts.today_upcoming, 1);
    assert.equal(counts.future, 1);
    assert.equal(counts.past, 1);
    assert.equal(counts.cancelled, 1);
    assert.deepEqual(counts.next_starts, ['2026-11-05T04:00:00.000Z', '2026-11-09T04:00:00.000Z']);
    assert.equal(counts.next_is_today, true);
    assert.equal(counts.today + counts.future + counts.past, 4, 'unreadable slots are never counted');
  });

  it('16. a filtered reports summary only counts the rows on screen', () => {
    const rows = [report({ id: 'r1' }), report({ id: 'r2', status: 'partial' }), report({ id: 'r3', status: 'urgent_partial' })];
    const facts = buildReportsFacts({ displayed: rows.slice(0, 2), tab: 'all', search: '', now: MORNING });
    assert.equal(facts.context, 'reports');
    if (facts.context !== 'reports') return;
    assert.equal(facts.reports.total, 2);
    assert.equal(facts.reports.urgent, 0, 'the urgent row is not in the filtered set');
  });

  it('17. missing information follows the report list, so the summary cannot contradict the page', () => {
    // `allergies` is status "unknown" yet the backend lists it as missing information.
    const withMissing = buildReportDetailFacts(report(), MORNING);
    assert.equal(withMissing.context, 'report_detail');
    if (withMissing.context !== 'report_detail') return;
    assert.equal(withMissing.focus.missing_fields, 1, 'one entry in missing_information');
    assert.equal(withMissing.focus.answered_fields, 9);
    assert.match(renderHindiSummary(withMissing), /1 जानकारी अभी प्राप्त नहीं हुई है/);

    const complete = report();
    complete.report = { ...complete.report, missing_information: [] };
    const withoutMissing = buildReportDetailFacts(complete, MORNING);
    if (withoutMissing.context !== 'report_detail') return;
    assert.equal(withoutMissing.focus.missing_fields, 0);
    assert.match(renderHindiSummary(withoutMissing), /सभी 10 जानकारियाँ दर्ज हो चुकी हैं/);
  });
});

describe('Doctor assistant — speak payload contract', () => {
  const valid = dashboardFacts({ intent: 'summary' });

  it('18. accepts the exact fact shape', () => {
    assert.deepEqual(parseSummaryFacts(valid), valid);
  });

  it('19. rejects free text, unknown keys and out-of-range counts', () => {
    assert.equal(parseSummaryFacts('सुप्रभात डॉक्टर'), null, 'raw text is not a fact set');
    assert.equal(parseSummaryFacts({ ...valid, text: 'say anything' }), null, 'unknown key rejected');
    assert.equal(parseSummaryFacts({ ...valid, v: 2 }), null, 'version pinned');
    assert.equal(parseSummaryFacts({ ...valid, context: 'login' }), null, 'context allowlist');
    assert.equal(
      parseSummaryFacts({ ...valid, reports: { ...EMPTY_REPORTS, total: -1 } }),
      null,
      'negative counts rejected',
    );
    assert.equal(
      parseSummaryFacts({ ...valid, appointments: { ...EMPTY_APPOINTMENTS, next_starts: ['not a date'] } }),
      null,
      'times must be ISO instants',
    );
    assert.equal(
      parseSummaryFacts({
        ...valid,
        appointments: { ...EMPTY_APPOINTMENTS, next_starts: ['2026-11-05T04:00:00.000Z', '2026-11-05T05:00:00.000Z', '2026-11-05T06:00:00.000Z', '2026-11-05T07:00:00.000Z'] },
      }),
      null,
      'at most three upcoming slots',
    );
    assert.equal(parseSummaryFacts({ v: 1, context: 'report_detail', time_of_day: 'evening' }), null, 'focus required');
  });

  it('20. the mock backend returns the deterministic sentence and never claims audio', async () => {
    setAppMode('mock');
    const result = await speakDoctorSummary(valid);
    assert.equal(result.audioUrl, undefined, 'no audio without a backend');
    assert.equal(result.source, 'fallback', 'no model in mock mode');
    assert.match(result.text ?? '', /[\u0900-\u097F]/, 'Hindi text is still returned for the panel');
    assert.equal(result.language, 'hi', 'default language is Hindi');
    assert.ok((result.text ?? '').length <= MAX_SUMMARY_CHARACTERS);

    const english = await speakDoctorSummary(valid, { language: 'en' });
    assert.equal(english.language, 'en');
    assert.match(english.text ?? '', /Doctor,/, 'English summary is returned for the English selection');
    assert.doesNotMatch(english.text ?? '', /[\u0900-\u097F]/, 'no Devanagari in English mode');
    setAppMode('mock');
  });
});

describe('Doctor assistant — page wiring', () => {
  const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it('21. all six doctor pages use the one header that pins the assistant upper-right', () => {
    for (const file of [
      'src/features/doctor/DoctorDashboardView.tsx',
      'src/features/doctor/DoctorReportsList.tsx',
      'src/features/doctor/DoctorReportDetail.tsx',
      'src/features/doctor/DoctorUrgentDetail.tsx',
      'src/features/doctor/DoctorAppointmentsView.tsx',
      'src/features/doctor/DoctorUrgentList.tsx',
    ]) {
      const source = read(file);
      assert.match(source, /assistant\?: React\.ReactNode/, `${file} exposes the slot`);
      assert.match(source, /import \{ DoctorPageHeader \} from '\.\/DoctorPageHeader'/, `${file} uses the shared header`);
      assert.match(source, /<DoctorPageHeader/, `${file} renders the shared header`);
      assert.match(source, /assistant=\{assistant\}/, `${file} passes the assistant to it`);
    }

    const header = read('src/features/doctor/DoctorPageHeader.tsx');
    assert.match(header, /justify-between/, 'title and assistant are the two ends of the row');
    assert.match(header, /data-assistant-slot="upper-right"/, 'the slot is marked for geometry tests');
    assert.match(header, /items-start/, 'the assistant stays at the top of the header, not centred');
  });

  it('22. the shell mounts one assistant per doctor context and never on patient pages', () => {
    const shell = read('src/features/doctor/DoctorShell.tsx');
    for (const kind of ['dashboard', 'reports', 'report_detail', 'urgent_detail', 'urgent_review', 'appointments']) {
      assert.match(shell, new RegExp(`kind: '${kind}'`), `shell covers ${kind}`);
    }
    assert.match(shell, /autoGreet/);
    assert.match(shell, /loginSessionId=\{loginSessionId\}/);
    assert.doesNotMatch(shell, /dashboardEntryToken|greetingToken/, 'navigation no longer arms a greeting');
    assert.match(shell, /restoreDoctorSession\(\)/, 'a restored session is handled separately from login');

    const hook = read('src/features/doctor/useSamwadAssistant.ts');
    assert.match(hook, /claimAutomaticGreeting/, 'the one-time guard is central, not per mount');
    assert.doesNotMatch(hook, /greetingToken/, 'no route-entry token drives the briefing');

    const patientShell = read('src/features/patient/PatientShell.tsx');
    const login = read('src/features/doctor/DoctorLogin.tsx');
    assert.doesNotMatch(patientShell, /SamwadAssistant/);
    assert.doesNotMatch(login, /SamwadAssistant/);

    // The automatic briefing must not steal keyboard focus from the page.
    const component = read('src/features/doctor/SamwadAssistant.tsx');
    assert.match(component, /openSource === 'user'/, 'focus only follows a user click');
    assert.match(component, /event\.key === 'Escape'/, 'Escape closes the panel');
    assert.match(component, /role="dialog"/);
    assert.match(component, /aria-live="polite"/);
  });

  it('23. the button uses the approved Figma assets and metrics', () => {
    const button = read('src/features/doctor/SamwadAssistantButton.tsx');
    assert.match(button, /\/assistant\/mascot-purple-avatar\.png/);
    assert.match(button, /\/assistant\/sparkles\.svg/);
    assert.match(button, /140:2/, 'master component id recorded');
    assert.match(button, /lg:w-\[306px\]/);
    assert.match(button, /lg:h-\[72px\]/);
    assert.match(button, /rounded-full/);
    assert.match(button, /#091329/);
    assert.match(button, /#f7faff/);
    assert.match(button, /aria-haspopup="dialog"/);
  });
});
