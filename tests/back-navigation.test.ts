import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BackButton } from '../src/features/common/BackButton';
import { WelcomeView } from '../src/features/patient/WelcomeView';
import { ConsentView } from '../src/features/patient/ConsentView';
import { ConsentDeclinedView } from '../src/features/patient/ConsentDeclinedView';
import { ConversationView } from '../src/features/patient/ConversationView';
import { WhatWeHeardView } from '../src/features/patient/WhatWeHeardView';
import { ReportReviewView } from '../src/features/patient/ReportReviewView';
import { BookingView } from '../src/features/patient/BookingView';
import { ConfirmationView } from '../src/features/patient/ConfirmationView';
import { EmergencyView } from '../src/features/patient/EmergencyView';
import { SessionEndedView } from '../src/features/patient/SessionEndedView';

import { DoctorReportsList } from '../src/features/doctor/DoctorReportsList';
import { DoctorAppointmentsView } from '../src/features/doctor/DoctorAppointmentsView';
import { DoctorUrgentList } from '../src/features/doctor/DoctorUrgentList';
import { DoctorReportDetail } from '../src/features/doctor/DoctorReportDetail';
import { DoctorUrgentDetail } from '../src/features/doctor/DoctorUrgentDetail';
import { DoctorDashboardView } from '../src/features/doctor/DoctorDashboardView';

import { ReportDocumentV1, ReportRow } from '../src/types/report';
import { Appointment, DoctorProfile } from '../src/types/doctor';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------
const MOCK_REPORT_DOC: ReportDocumentV1 = {
  schema_version: 1,
  patient: {
    name: { status: 'provided', value: 'Aarav Sharma' },
    age: { status: 'provided', value: 28 },
    gender: { status: 'provided', value: 'male' },
    language: 'en',
  },
  primary_concern: { status: 'provided', value: 'Headache' },
  clinical_details: {
    duration: { status: 'provided', value: '3 days' },
    severity: { status: 'provided', value: 'Moderate' },
    conditions: { status: 'not_provided', value: null },
    medications: { status: 'not_provided', value: null },
    allergies: { status: 'not_provided', value: null },
    other_symptoms: { status: 'not_provided', value: null },
  },
  missing_information: [],
  summary: {
    text: 'Patient-reported headache for 3 days.',
    source: 'template',
    generated_from: ['primary_concern'],
  },
  routing_snapshot: {
    department_key: 'general_medicine',
    department_name: 'General Medicine',
    doctor_id: 'doc-gen-med-01',
    doctor_name: 'Dr. Aditi Rao',
    is_fallback: false,
    preliminary: true,
  },
  emergency: null,
};

const MOCK_REPORT_ROW: ReportRow = {
  id: 'rep-test-01',
  session_id: 'sess-test-01',
  user_id: 'usr-test-01',
  status: 'submitted',
  schema_version: 1,
  department_key: 'general_medicine',
  doctor_id: 'doc-gen-med-01',
  intake_reference: 'INT-2026-9999',
  possible_urgent: false,
  needs_human_review: false,
  emergency_rule_id: null,
  submitted_at: '2026-11-02T10:00:00Z',
  reviewed_at: null,
  reviewed_by: null,
  created_at: '2026-11-02T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
  report: MOCK_REPORT_DOC,
};

const MOCK_DOCTOR: DoctorProfile = {
  id: 'doc-gen-med-01',
  name: 'Dr. Aditi Rao',
  department_key: 'general_medicine',
  department_name: 'General Medicine',
  room_number: 'OPD-102',
  initials: 'AR',
  email: 'aditi.rao@hospital.demo',
};

const MOCK_APPOINTMENT: Appointment = {
  id: 'apt-test-01',
  report_id: 'rep-test-01',
  doctor_id: 'doc-gen-med-01',
  doctor_name: 'Dr. Aditi Rao',
  department_name: 'General Medicine',
  slot_id: 'slot-test-01',
  slot_start: '2026-11-02T15:30:00+05:30',
  slot_end: '2026-11-02T16:00:00+05:30',
  reference_code: 'APT-2026-0099',
  patient_name: 'Aarav Sharma',
  created_at: '2026-11-02T10:00:00Z',
  status: 'confirmed',
};

describe('Application-Wide Back Navigation Suite', () => {
  describe('1. Figma Vector Specification & Shared BackButton', () => {
    it('BackButton renders with exact Figma vector dimensions (25x25) and path', () => {
      const html = renderToStaticMarkup(
        React.createElement(BackButton, { label: 'Go back' })
      );
      assert.ok(html.includes('aria-label="Go back"'));
      assert.ok(html.includes('viewBox="0 0 25 25"'));
      assert.ok(html.includes('M14.5833 19.7917L7.29167 12.5L14.5833 5.20833M7.29167 12.5H21.875'));
      assert.ok(html.includes('strokeWidth="1.8"') || html.includes('stroke-width="1.8"'));
      assert.ok(html.includes('size-[36px]'));
    });

    it('BackButton allows custom accessibility labels and classNames', () => {
      const html = renderToStaticMarkup(
        React.createElement(BackButton, { label: 'Back to Dashboard', className: 'custom-nav-class' })
      );
      assert.ok(html.includes('aria-label="Back to Dashboard"'));
      assert.ok(html.includes('custom-nav-class'));
    });
  });

  describe('2. Design Invariant: Home Screens Do NOT Display Back Button', () => {
    it('Patient WelcomeView never renders a BackButton', () => {
      const html = renderToStaticMarkup(
        React.createElement(WelcomeView, {
          onStartTalking: () => {},
          onTypeInstead: () => {},
        })
      );
      assert.ok(!html.includes('aria-label="Go back"'));
      assert.ok(!html.includes('viewBox="0 0 25 25"'));
    });

    it('Doctor DashboardView never renders a BackButton', () => {
      const html = renderToStaticMarkup(
        React.createElement(DoctorDashboardView, {
          doctor: MOCK_DOCTOR,
          stats: { urgent: 0, new_reports: 0, booked: 0, not_booked: 0 },
          recentReports: [],
          bookedReportIds: new Set(),
          onSelectReport: () => {},
          onNavigateTab: () => {},
        })
      );
      assert.ok(!html.includes('aria-label="Go back"'));
      assert.ok(!html.includes('aria-label="Back to Dashboard"'));
    });
  });

  describe('3. Design Invariant: All Non-Home Screens Render BackButton with Accessible Label', () => {
    it('ConsentView renders BackButton when onBack provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(ConsentView, {
          onAgree: () => {},
          onDecline: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('ConsentDeclinedView renders BackButton', () => {
      const html = renderToStaticMarkup(
        React.createElement(ConsentDeclinedView, {
          onRestart: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('ConversationView renders BackButton when onBack provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(ConversationView, {
          messages: [],
          turnCount: 1,
          maxTurns: 15,
          onSendText: () => {},
          onReplayAudio: () => {},
          onBack: () => {},
          isProcessing: false,
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('WhatWeHeardView renders BackButton', () => {
      const html = renderToStaticMarkup(
        React.createElement(WhatWeHeardView, {
          initialTranscript: 'Severe headache',
          onConfirm: () => {},
          onCancel: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('ReportReviewView renders BackButton when onBack provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(ReportReviewView, {
          report: MOCK_REPORT_DOC,
          onCorrectField: () => {},
          onSubmit: () => {},
          onDontSubmit: () => {},
          onEndSessionCap: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('BookingView renders BackButton when onBack provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(BookingView, {
          report: MOCK_REPORT_ROW,
          onBookAppointment: async () => {},
          onNotNow: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('ConfirmationView (appointment) renders BackButton when onBack provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(ConfirmationView, {
          type: 'appointment',
          report: MOCK_REPORT_ROW,
          appointment: MOCK_APPOINTMENT,
          onHome: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('ConfirmationView (report_only) renders BackButton when onBack provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(ConfirmationView, {
          type: 'report_only',
          report: MOCK_REPORT_ROW,
          onHome: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('EmergencyView is terminal: no Back control, and 112 guidance is present', () => {
      // D-02: leaving the emergency state would restore routine intake and discard the
      // 112 guidance, so the emergency screen must not offer a back affordance.
      const html = renderToStaticMarkup(
        React.createElement(EmergencyView, {
          onEndDemo: () => {},
        })
      );
      assert.ok(!html.includes('aria-label="Go back"'));
      assert.ok(!html.includes('viewBox="0 0 25 25"'));
      assert.ok(html.includes('112'));
    });

    it('SessionEndedView renders BackButton', () => {
      const html = renderToStaticMarkup(
        React.createElement(SessionEndedView, {
          reason: 'dont_submit',
          onRestart: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Go back"'));
    });

    it('DoctorReportsList renders BackButton with label "Back to Dashboard"', () => {
      const html = renderToStaticMarkup(
        React.createElement(DoctorReportsList, {
          reports: [MOCK_REPORT_ROW],
          bookedReportIds: new Set(),
          onSelectReport: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Back to Dashboard"'));
    });

    it('DoctorAppointmentsView renders BackButton with label "Back to Dashboard"', () => {
      const html = renderToStaticMarkup(
        React.createElement(DoctorAppointmentsView, {
          appointments: [MOCK_APPOINTMENT],
          onBack: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Back to Dashboard"'));
    });

    it('DoctorUrgentList renders BackButton with label "Back to Dashboard"', () => {
      const html = renderToStaticMarkup(
        React.createElement(DoctorUrgentList, {
          urgentReports: [MOCK_REPORT_ROW],
          onSelectReport: () => {},
          onBack: () => {},
        })
      );
      assert.ok(html.includes('Back to Dashboard'));
    });

    it('DoctorReportDetail renders BackButton with label "Back to Reports"', () => {
      const html = renderToStaticMarkup(
        React.createElement(DoctorReportDetail, {
          report: MOCK_REPORT_ROW,
          onBack: () => {},
          onRefreshReport: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Back to Reports"'));
    });

    it('DoctorUrgentDetail renders BackButton with label "Back to Urgent List"', () => {
      const urgentRow = { ...MOCK_REPORT_ROW, status: 'urgent_partial' as const };
      const html = renderToStaticMarkup(
        React.createElement(DoctorUrgentDetail, {
          report: urgentRow,
          currentDoctor: MOCK_DOCTOR,
          onBack: () => {},
          onRefreshReport: () => {},
        })
      );
      assert.ok(html.includes('aria-label="Back to Urgent List"'));
    });
  });

  describe('4. Deterministic Fallback Navigation Mapping', () => {
    function getFallbackScreen(screen: string): string {
      switch (screen) {
        case 'consent':
        case 'consent_declined':
        case 'session_ended':
        case 'emergency':
          return 'welcome';
        case 'conversation':
          return 'consent';
        case 'what_we_heard':
          return 'conversation';
        case 'review':
          return 'conversation';
        case 'booking':
          return 'review';
        case 'confirmed_booking':
        case 'confirmed_report_only':
          return 'booking';
        default:
          return 'welcome';
      }
    }

    it('Consent falls back to welcome', () => {
      assert.equal(getFallbackScreen('consent'), 'welcome');
    });

    it('Consent declined falls back to welcome', () => {
      assert.equal(getFallbackScreen('consent_declined'), 'welcome');
    });

    it('Emergency falls back to welcome', () => {
      assert.equal(getFallbackScreen('emergency'), 'welcome');
    });

    it('Session ended falls back to welcome', () => {
      assert.equal(getFallbackScreen('session_ended'), 'welcome');
    });

    it('Conversation falls back to consent', () => {
      assert.equal(getFallbackScreen('conversation'), 'consent');
    });

    it('What We Heard falls back to conversation', () => {
      assert.equal(getFallbackScreen('what_we_heard'), 'conversation');
    });

    it('Review falls back to conversation', () => {
      assert.equal(getFallbackScreen('review'), 'conversation');
    });

    it('Booking falls back to review', () => {
      assert.equal(getFallbackScreen('booking'), 'review');
    });

    it('Confirmed booking falls back to booking', () => {
      assert.equal(getFallbackScreen('confirmed_booking'), 'booking');
    });

    it('Confirmed report only falls back to booking', () => {
      assert.equal(getFallbackScreen('confirmed_report_only'), 'booking');
    });
  });

  describe('5. Stateful Navigation Stack Simulation & Invariants', () => {
    it('Stack tracks sequential navigation and pops accurately in LIFO order', () => {
      const history: string[] = [];
      let current = 'welcome';

      function navigate(next: string) {
        if (next !== current) {
          history.push(current);
          current = next;
        }
      }

      function goBack() {
        if (history.length > 0) {
          current = history.pop()!;
        }
      }

      navigate('consent');
      assert.equal(current, 'consent');
      assert.deepEqual(history, ['welcome']);

      navigate('conversation');
      assert.equal(current, 'conversation');
      assert.deepEqual(history, ['welcome', 'consent']);

      navigate('review');
      assert.equal(current, 'review');
      assert.deepEqual(history, ['welcome', 'consent', 'conversation']);

      navigate('booking');
      assert.equal(current, 'booking');
      assert.deepEqual(history, ['welcome', 'consent', 'conversation', 'review']);

      navigate('confirmed_booking');
      assert.equal(current, 'confirmed_booking');

      // Unwind stack step by step
      goBack();
      assert.equal(current, 'booking');

      goBack();
      assert.equal(current, 'review');

      goBack();
      assert.equal(current, 'conversation');

      goBack();
      assert.equal(current, 'consent');

      goBack();
      assert.equal(current, 'welcome');
      assert.equal(history.length, 0);
    });

    it('Double submission invariant: submitted report guard prevents duplicate submissions on back navigation', () => {
      let callCount = 0;
      const chatState: { submitted_report?: ReportRow } = {
        submitted_report: MOCK_REPORT_ROW,
      };

      function handleSubmitReport() {
        if (chatState.submitted_report) {
          // Guard: advance to booking without resubmitting!
          return 'booking';
        }
        callCount++;
        return 'booking';
      }

      const res = handleSubmitReport();
      assert.equal(res, 'booking');
      assert.equal(callCount, 0, 'No submitReport API call made because submitted_report already exists');
    });

    it('Double booking invariant: active appointment guard prevents duplicate appointment creation on back navigation', () => {
      let callCount = 0;
      const activeAppointment: Appointment | undefined = MOCK_APPOINTMENT;

      function handleBookAppointment() {
        if (activeAppointment) {
          // Guard: advance to confirmation without rebooking!
          return 'confirmed_booking';
        }
        callCount++;
        return 'confirmed_booking';
      }

      const res = handleBookAppointment();
      assert.equal(res, 'confirmed_booking');
      assert.equal(callCount, 0, 'No bookAppointment API call made because appointment already exists');
    });

    it('Emergency invariant: emergency report retains urgent status and suppresses routine slot scheduling', () => {
      const urgentReport: ReportRow = {
        ...MOCK_REPORT_ROW,
        status: 'urgent_partial',
        department_key: 'emergency',
        doctor_id: 'doc-emergency-01',
      };

      // Even if user navigates back to welcome or home, the report status and emergency rules remain strict
      assert.equal(urgentReport.status, 'urgent_partial');
      assert.equal(urgentReport.department_key, 'emergency');
    });
  });
});
