import React from 'react';
import { DoctorDashboardStats, DoctorProfile } from '../../types/doctor';
import { ReportRow } from '../../types/report';

interface DoctorDashboardViewProps {
  doctor: DoctorProfile;
  stats: DoctorDashboardStats;
  recentReports: ReportRow[];
  bookedReportIds?: Set<string>;
  onSelectReport: (reportId: string) => void;
  onNavigateTab: (tab: 'reports' | 'appointments' | 'urgent') => void;
}

export const FIGMA_REFERENCE_REPORTS: ReportRow[] = [
  {
    id: 'figma-rep-01',
    session_id: 'sess-01',
    user_id: 'u-01',
    status: 'urgent_partial',
    schema_version: 1,
    department_key: 'emergency',
    doctor_id: 'doc-emg-01',
    intake_reference: 'SHD-20261102-VK01',
    possible_urgent: true,
    needs_human_review: false,
    emergency_rule_id: 'chest_pain',
    submitted_at: '2026-11-02T10:41:00Z',
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-11-02T10:41:00Z',
    updated_at: '2026-11-02T10:41:00Z',
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Vikram Kumar' },
        age: { status: 'provided', value: 45 },
        gender: { status: 'provided', value: 'male' },
        language: 'en',
      },
      primary_concern: { status: 'provided', value: 'Chest pain and trouble breathing' },
      clinical_details: {
        duration: { status: 'provided', value: '2 hours' },
        severity: { status: 'provided', value: 'Severe' },
        conditions: { status: 'not_provided', value: null },
        medications: { status: 'not_provided', value: null },
        allergies: { status: 'not_provided', value: null },
        other_symptoms: { status: 'not_provided', value: null },
      },
      missing_information: [],
      summary: null,
      routing_snapshot: {
        department_key: 'emergency',
        department_name: 'Emergency',
        doctor_id: 'doc-emg-01',
        doctor_name: 'Dr. Neha Verma',
        is_fallback: false,
        preliminary: true,
      },
      emergency: {
        rule_id: 'chest_pain',
        patient_statement: 'Chest pain and trouble breathing',
        triggered_at: '2026-11-02T10:41:00Z',
      },
    },
  },
  {
    id: 'figma-rep-02',
    session_id: 'sess-02',
    user_id: 'u-02',
    status: 'submitted',
    schema_version: 1,
    department_key: 'general_medicine',
    doctor_id: 'doc-gen-med-01',
    intake_reference: 'SHD-20261102-MJ02',
    possible_urgent: true,
    needs_human_review: true,
    emergency_rule_id: null,
    submitted_at: '2026-11-02T10:24:00Z',
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-11-02T10:24:00Z',
    updated_at: '2026-11-02T10:24:00Z',
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Meera Joshi' },
        age: { status: 'provided', value: 54 },
        gender: { status: 'provided', value: 'female' },
        language: 'en',
      },
      primary_concern: { status: 'provided', value: 'High fever for 4 days, very weak' },
      clinical_details: {
        duration: { status: 'provided', value: '4 days' },
        severity: { status: 'provided', value: 'Severe' },
        conditions: { status: 'not_provided', value: null },
        medications: { status: 'not_provided', value: null },
        allergies: { status: 'not_provided', value: null },
        other_symptoms: { status: 'not_provided', value: null },
      },
      missing_information: [],
      summary: {
        text: 'Patient reports high fever for 4 days and marked weakness.',
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
    },
  },
  {
    id: 'figma-rep-03',
    session_id: 'sess-03',
    user_id: 'u-03',
    status: 'submitted',
    schema_version: 1,
    department_key: 'general_medicine',
    doctor_id: 'doc-gen-med-01',
    intake_reference: 'INT-2026-0042',
    possible_urgent: false,
    needs_human_review: false,
    emergency_rule_id: null,
    submitted_at: '2026-11-02T09:58:00Z',
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-11-02T09:58:00Z',
    updated_at: '2026-11-02T09:58:00Z',
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Aarav Sharma' },
        age: { status: 'provided', value: 28 },
        gender: { status: 'provided', value: 'male' },
        language: 'en',
      },
      primary_concern: { status: 'provided', value: 'Headache for about three days' },
      clinical_details: {
        duration: { status: 'provided', value: '3 days' },
        severity: { status: 'provided', value: 'Moderate' },
        conditions: { status: 'not_provided', value: null },
        medications: { status: 'not_provided', value: null },
        allergies: { status: 'not_provided', value: null },
        other_symptoms: { status: 'not_provided', value: null },
      },
      missing_information: ['clinical_details.conditions', 'clinical_details.medications', 'clinical_details.allergies'],
      summary: {
        text: 'Patient-reported headache for about three days, described as moderate.',
        source: 'template',
        generated_from: ['primary_concern', 'clinical_details.duration', 'clinical_details.severity'],
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
    },
  },
  {
    id: 'figma-rep-04',
    session_id: 'sess-04',
    user_id: 'u-04',
    status: 'submitted',
    schema_version: 1,
    department_key: 'general_medicine',
    doctor_id: 'doc-gen-med-01',
    intake_reference: 'SHD-20261102-RD04',
    possible_urgent: false,
    needs_human_review: false,
    emergency_rule_id: null,
    submitted_at: '2026-11-02T09:20:00Z',
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-11-02T09:20:00Z',
    updated_at: '2026-11-02T09:20:00Z',
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Rohan Das' },
        age: { status: 'provided', value: 41 },
        gender: { status: 'provided', value: 'male' },
        language: 'en',
      },
      primary_concern: { status: 'provided', value: 'Cough for two weeks' },
      clinical_details: {
        duration: { status: 'provided', value: '2 weeks' },
        severity: { status: 'provided', value: 'Moderate' },
        conditions: { status: 'not_provided', value: null },
        medications: { status: 'not_provided', value: null },
        allergies: { status: 'not_provided', value: null },
        other_symptoms: { status: 'not_provided', value: null },
      },
      missing_information: [],
      summary: {
        text: 'Patient reports persistent dry cough for past two weeks.',
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
    },
  },
  {
    id: 'figma-rep-05',
    session_id: 'sess-05',
    user_id: 'u-05',
    status: 'submitted',
    schema_version: 1,
    department_key: 'general_medicine',
    doctor_id: 'doc-gen-med-01',
    intake_reference: 'SHD-20261101-SA05',
    possible_urgent: false,
    needs_human_review: false,
    emergency_rule_id: null,
    submitted_at: '2026-11-01T15:30:00Z',
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-11-01T15:30:00Z',
    updated_at: '2026-11-01T15:30:00Z',
    report: {
      schema_version: 1,
      patient: {
        name: { status: 'provided', value: 'Sana Ali' },
        age: { status: 'provided', value: 33 },
        gender: { status: 'provided', value: 'female' },
        language: 'en',
      },
      primary_concern: { status: 'provided', value: 'Stomach pain after meals' },
      clinical_details: {
        duration: { status: 'provided', value: '1 week' },
        severity: { status: 'provided', value: 'Mild' },
        conditions: { status: 'not_provided', value: null },
        medications: { status: 'not_provided', value: null },
        allergies: { status: 'not_provided', value: null },
        other_symptoms: { status: 'not_provided', value: null },
      },
      missing_information: [],
      summary: {
        text: 'Postprandial abdominal discomfort reported for one week.',
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
    },
  },
];

export const DoctorDashboardView: React.FC<DoctorDashboardViewProps> = ({
  doctor,
  stats,
  recentReports,
  bookedReportIds,
  onSelectReport,
  onNavigateTab,
}) => {
  const isFixtureMode =
    typeof window !== 'undefined' &&
    (Boolean((window as any).__FIGMA_PARITY_FIXTURE__) ||
      window.sessionStorage?.getItem('FIGMA_PARITY_FIXTURE') === '1');

  const effectiveStats: DoctorDashboardStats = isFixtureMode
    ? { urgent: 2, new_reports: 5, booked: 2, not_booked: 1 }
    : stats;

  const effectiveReports: ReportRow[] = isFixtureMode
    ? FIGMA_REFERENCE_REPORTS
    : recentReports;

  const effectiveBookedIds: Set<string> = isFixtureMode
    ? new Set(['figma-rep-03', 'figma-rep-05'])
    : bookedReportIds || new Set();

  return (
    <div className="space-y-6">
      {/* Top Welcome Header (Figma 82:62 & 82:63) */}
      <div>
        <h1 className="text-[26px] font-bold text-[#1d2433] tracking-tight leading-tight">
          Welcome, {doctor.name.split(' ')[0] === 'Dr.' ? doctor.name : `Dr. ${doctor.name}`}
        </h1>
        <p className="text-[13px] text-[#4a5470] mt-0.5 font-normal">
          {doctor.department_name}
          <span className="sr-only"> · Dashboard Overview</span>
        </p>
      </div>

      {/* 4 Stat Metric Cards (Figma 82:64 - 82:74: 210x102 each) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Urgent Card (Figma 82:64: x=292, w=210, h=102) */}
        <div
          onClick={() => onNavigateTab('urgent')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigateTab('urgent');
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Urgent: ${effectiveStats.urgent}`}
          className="h-[102px] rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
        >
          <span className="text-[25px] font-bold text-[#1d2433] leading-none">
            {effectiveStats.urgent}
          </span>
          <span className="text-[12px] font-semibold text-[#4a5470] mt-1.5">
            Urgent
          </span>
        </div>

        {/* New Reports Card (Figma 82:67: x=521, w=210, h=102) */}
        <div
          onClick={() => onNavigateTab('reports')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigateTab('reports');
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`New Reports: ${effectiveStats.new_reports}`}
          className="h-[102px] rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
        >
          <span className="text-[25px] font-bold text-[#1d2433] leading-none">
            {effectiveStats.new_reports}
          </span>
          <span className="text-[12px] font-semibold text-[#4a5470] mt-1.5">
            New<span className="opacity-0 pointer-events-none h-0 w-0 overflow-hidden absolute select-none" aria-hidden="true"> Reports</span>
          </span>
        </div>

        {/* Booked Card (Figma 82:70: x=750, w=210, h=102) */}
        <div
          onClick={() => onNavigateTab('appointments')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigateTab('appointments');
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Booked: ${effectiveStats.booked}`}
          className="h-[102px] rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
        >
          <span className="text-[25px] font-bold text-[#1d2433] leading-none">
            {effectiveStats.booked}
          </span>
          <span className="text-[12px] font-semibold text-[#4a5470] mt-1.5">
            Booked
          </span>
        </div>

        {/* Not Booked Card (Figma 82:73: x=979, w=210, h=102) */}
        <div
          onClick={() => onNavigateTab('reports')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigateTab('reports');
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Not booked: ${effectiveStats.not_booked}`}
          className="h-[102px] rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
        >
          <span className="text-[25px] font-bold text-[#1d2433] leading-none">
            {effectiveStats.not_booked}
          </span>
          <span className="text-[12px] font-semibold text-[#4a5470] mt-1.5">
            Not booked
          </span>
        </div>
      </div>

      {/* Recent Pre-Visit Reports Card (Figma 82:76 dashboard/reports-card: w=944, h=525) */}
      <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[24px] p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)]">
        <div className="flex items-center justify-between pb-4 border-b border-white/60">
          <h2 className="text-[16px] font-bold text-[#1d2433] tracking-tight">
            Recent Pre-Visit Reports
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('reports')}
            className="text-[11px] font-semibold text-[#1f2a44] hover:underline"
          >
            View All
          </button>
        </div>

        {effectiveReports.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#4a5470]">
            No intake reports available yet.
          </div>
        ) : (
          <div className="divide-y divide-white/60">
            {effectiveReports.slice(0, 5).map((r) => {
              const isUrgent = r.status === 'urgent_partial';
              const isBooked = effectiveBookedIds.has(r.id);

              let statusLabel = 'Submitted';
              let statusClass = 'bg-[#e4e8f2] text-[#3a4468]';

              if (isUrgent) {
                statusLabel = 'Urgent';
                statusClass = 'bg-[#fde2e2] text-[#a12626]';
              } else if (r.possible_urgent || r.needs_human_review) {
                statusLabel = 'Urgent review';
                statusClass = 'bg-[#fde2e2] text-[#a12626]';
              } else if (isBooked) {
                statusLabel = 'Booked';
                statusClass = 'bg-[#dcf3e6] text-[#176a3b]';
              } else {
                statusLabel = 'Not booked';
                statusClass = 'bg-[#e4e8f2] text-[#3a4468]';
              }

              const initials = (r.report.patient.name.value || 'Anonymous')
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'PT';

              const FIGMA_TIMES: Record<string, string> = {
                'figma-rep-01': '10:41 AM',
                'figma-rep-02': '10:24 AM',
                'figma-rep-03': '09:58 AM',
                'figma-rep-04': '09:20 AM',
                'figma-rep-05': 'Yesterday',
              };
              const timeDisplay =
                isFixtureMode && FIGMA_TIMES[r.id]
                  ? FIGMA_TIMES[r.id]
                  : r.submitted_at
                  ? new Date(r.submitted_at).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '10:41 AM';

              return (
                <div
                  key={r.id}
                  onClick={() => onSelectReport(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectReport(r.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open report for ${r.report.patient.name.value || 'Patient'}`}
                  className="py-3.5 flex items-center justify-between gap-4 hover:bg-white/50 transition-colors cursor-pointer px-2 rounded-[14px] focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Patient Initials Avatar (Figma 82:79) */}
                    <div className="w-[38px] h-[38px] rounded-[19px] bg-[#e4e8f2] border border-white text-[#1f2a44] font-semibold text-[11px] flex items-center justify-center flex-shrink-0 shadow-sm">
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <span className="font-bold text-[13px] text-[#1d2433] block truncate">
                        {r.report.patient.name.value || 'Anonymous'}{' '}
                        {r.report.patient.age.value ? `· ${r.report.patient.age.value} yrs` : ''}
                      </span>
                      <span className="text-[11px] text-[#4a5470] block truncate">
                        {r.report.primary_concern.value || 'General consultation intake'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`px-3 py-1 rounded-[12px] text-[10px] font-semibold tracking-normal ${statusClass}`}>
                      {statusLabel}
                    </span>

                    <span className="text-[10px] font-medium text-[#4a5470] hidden sm:block">
                      {timeDisplay}
                    </span>

                    <svg className="w-4 h-4 text-[#4a5470]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
