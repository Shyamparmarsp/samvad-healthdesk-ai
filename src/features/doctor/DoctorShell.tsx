import React, { useState, useEffect } from 'react';
import { DoctorProfile, DoctorDashboardStats, Appointment } from '../../types/doctor';
import { ReportRow } from '../../types/report';
import {
  getDoctorReports,
  getDoctorAppointments,
  getDoctorDashboardStats,
  doctorLogout,
  FICTIONAL_DOCTORS,
} from '../../lib/api';

import { DoctorLogin } from './DoctorLogin';
import { DoctorDashboardView, FIGMA_REFERENCE_REPORTS } from './DoctorDashboardView';
import { DoctorReportsList } from './DoctorReportsList';
import { DoctorReportDetail } from './DoctorReportDetail';
import { DoctorUrgentDetail } from './DoctorUrgentDetail';
import { DoctorAppointmentsView } from './DoctorAppointmentsView';
import { DoctorUrgentList } from './DoctorUrgentList';

type DoctorView =
  | 'dashboard'
  | 'reports'
  | 'report_detail'
  | 'urgent'
  | 'appointments';

const FIGMA_REFERENCE_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-01',
    report_id: 'figma-rep-03',
    doctor_id: 'doc-gen-med-01',
    doctor_name: 'Dr. Aditi Rao',
    department_name: 'General Medicine',
    slot_id: 'slot-01',
    slot_start: '2026-11-02T15:30:00+05:30',
    slot_end: '2026-11-02T16:00:00+05:30',
    reference_code: 'APT-2026-0017',
    patient_name: 'Aarav Sharma',
    created_at: '2026-11-02T09:58:00Z',
    status: 'confirmed',
  },
  {
    id: 'apt-02',
    report_id: 'figma-rep-05',
    doctor_id: 'doc-gen-med-01',
    doctor_name: 'Dr. Aditi Rao',
    department_name: 'General Medicine',
    slot_id: 'slot-02',
    slot_start: '2026-11-02T16:00:00+05:30',
    slot_end: '2026-11-02T16:30:00+05:30',
    reference_code: 'APT-2026-0018',
    patient_name: 'Sana Ali',
    created_at: '2026-11-01T14:30:00Z',
    status: 'confirmed',
  },
  {
    id: 'apt-03',
    report_id: 'figma-rep-04',
    doctor_id: 'doc-gen-med-01',
    doctor_name: 'Dr. Aditi Rao',
    department_name: 'General Medicine',
    slot_id: 'slot-03',
    slot_start: '2026-10-30T11:00:00+05:30',
    slot_end: '2026-10-30T11:30:00+05:30',
    reference_code: 'APT-2026-0015',
    patient_name: 'Rohan Das',
    created_at: '2026-10-30T09:00:00Z',
    status: 'confirmed',
  },
];

export const DoctorShell: React.FC = () => {
  const [currentDoctor, setCurrentDoctor] = useState<DoctorProfile | null>(() => {
    if (typeof window !== 'undefined' && (window.sessionStorage?.getItem('FIGMA_PARITY_FIXTURE') === '1' || Boolean(window.sessionStorage?.getItem('FIGMA_DOCTOR_VIEW')))) {
      return FICTIONAL_DOCTORS.general_medicine;
    }
    return null;
  });
  const [currentView, setCurrentView] = useState<DoctorView>(() => {
    if (typeof window !== 'undefined') {
      const v = window.sessionStorage?.getItem('FIGMA_DOCTOR_VIEW');
      if (v === 'report_detail' || v === 'urgent_detail') return 'report_detail';
      if (v === 'reports') return 'reports';
      if (v === 'appointments') return 'appointments';
      if (v === 'urgent') return 'urgent';
    }
    return 'dashboard';
  });
  const [previousView, setPreviousView] = useState<DoctorView>('dashboard');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const v = window.sessionStorage?.getItem('FIGMA_DOCTOR_VIEW');
      if (v === 'report_detail') return 'figma-rep-03';
      if (v === 'urgent_detail') return 'figma-rep-01';
    }
    return null;
  });

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats] = useState<DoctorDashboardStats>({
    urgent: 0,
    new_reports: 0,
    booked: 0,
    not_booked: 0,
  });

  const loadData = async (docId?: string) => {
    try {
      const reps = await getDoctorReports(docId);
      const apts = await getDoctorAppointments(docId);
      const st = await getDoctorDashboardStats(docId);
      setReports(reps);
      setAppointments(apts);
      setStats(st);
    } catch (err) {
      console.error('Failed to load doctor portal data', err);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const targetView = window.sessionStorage?.getItem('FIGMA_DOCTOR_VIEW');
      if (targetView === 'reports') {
        setCurrentView('reports');
      } else if (targetView === 'report_detail') {
        setCurrentView('report_detail');
        setSelectedReportId('figma-rep-03');
      } else if (targetView === 'urgent_detail') {
        setCurrentView('report_detail');
        setSelectedReportId('figma-rep-01');
      } else if (targetView === 'appointments') {
        setCurrentView('appointments');
      } else if (targetView === 'urgent') {
        setCurrentView('urgent');
      } else if (targetView === 'dashboard') {
        setCurrentView('dashboard');
      }
    }
  }, []);

  useEffect(() => {
    if (currentDoctor) {
      loadData(currentDoctor.id);
    }
  }, [currentDoctor, currentView]);

  const handleSelectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setPreviousView(currentView);
    setCurrentView('report_detail');
  };

  const handleLogout = async () => {
    await doctorLogout();
    setCurrentDoctor(null);
  };

  if (!currentDoctor) {
    return <DoctorLogin onLoginSuccess={(doc) => setCurrentDoctor(doc)} />;
  }

  const isFixtureMode =
    typeof window !== 'undefined' &&
    (Boolean((window as any).__FIGMA_PARITY_FIXTURE__) ||
      window.sessionStorage?.getItem('FIGMA_PARITY_FIXTURE') === '1' ||
      Boolean(window.sessionStorage?.getItem('FIGMA_DOCTOR_VIEW')));

  const allReports = isFixtureMode
    ? [...FIGMA_REFERENCE_REPORTS, ...reports]
    : reports;
  const allAppointments = isFixtureMode
    ? [...FIGMA_REFERENCE_APPOINTMENTS, ...appointments]
    : appointments;
  const selectedReport = allReports.find((r) => r.id === selectedReportId);
  const bookedReportIds = new Set(allAppointments.map((a) => a.report_id));
  const urgentReports = isFixtureMode
    ? FIGMA_REFERENCE_REPORTS.filter((r) => r.status === 'urgent_partial')
    : reports.filter((r) => r.status === 'urgent_partial');

  return (
    <div className="w-full flex justify-center py-2 md:py-2.5">
      {/* Outer Shell Container matching Figma D2 (74:24 & 82:28: 1260x800) */}
      <div className="w-full max-w-[1260px] lg:max-w-[1280px] min-h-[820px] rounded-[30px] bg-[rgba(221,227,238,0.45)] border border-white shadow-xl flex flex-col md:flex-row p-3 md:p-5 gap-5 relative overflow-hidden select-none">
        {/* Figma Ambient Glow Orbs (82:26 & 82:27) */}
        <div className="absolute w-[420px] h-[400px] left-[930px] top-[490px] rounded-full glow-lilac z-0" aria-hidden="true" />
        <div className="absolute w-[420px] h-[380px] left-[-160px] top-[500px] rounded-full glow-sand z-0" aria-hidden="true" />

        {/* Frosted Sidebar (Figma 82:29 doctor/sidebar: 238x780) */}
        <aside className="relative z-10 w-full md:w-[238px] md:h-[780px] rounded-[26px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col justify-between flex-shrink-0">
          <div>
            {/* Brand Header (Figma 82:30 & 82:32) */}
            <div className="flex items-center gap-2.5 pb-6 pt-1">
              <div
                className="w-[36px] h-[36px] rounded-[11px] bg-[#1f2a44] border border-white text-white flex items-center justify-center font-bold text-[26px] leading-none shadow-sm flex-shrink-0"
                aria-hidden="true"
              >
                +
              </div>
              <div>
                <span className="font-bold text-[12px] text-[#1d2433] tracking-tight leading-tight block">
                  Samvad HealthDesk AI
                </span>
                <span className="opacity-0 pointer-events-none h-0 w-0 overflow-hidden absolute select-none" aria-hidden="true">
                  Clinical Desk
                </span>
              </div>
            </div>

            {/* 4 Navigation Items Only (Figma 82:34 - 82:55) */}
            <nav className="space-y-1.5" aria-label="Doctor portal navigation">
              <button
                type="button"
                onClick={() => setCurrentView('dashboard')}
                className={`w-full h-[48px] rounded-[24px] px-3.5 flex items-center gap-3 transition-all ${
                  currentView === 'dashboard'
                    ? 'bg-white rounded-[26px] border border-white shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.12)] text-[#1d2433] font-semibold text-[13px]'
                    : 'text-[#4a5470] font-medium text-[13px] hover:text-[#1d2433] hover:bg-white/40'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('reports')}
                className={`w-full h-[48px] rounded-[24px] px-3.5 flex items-center justify-between transition-all ${
                  currentView === 'reports' || currentView === 'report_detail'
                    ? 'bg-white rounded-[26px] border border-white shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.12)] text-[#1d2433] font-semibold text-[13px]'
                    : 'text-[#4a5470] font-medium text-[13px] hover:text-[#1d2433] hover:bg-white/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Reports</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/60 text-[#1d2433] font-mono font-semibold">
                  {isFixtureMode ? 4 : reports.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('appointments')}
                className={`w-full h-[48px] rounded-[24px] px-3.5 flex items-center justify-between transition-all ${
                  currentView === 'appointments'
                    ? 'bg-white rounded-[26px] border border-white shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.12)] text-[#1d2433] font-semibold text-[13px]'
                    : 'text-[#4a5470] font-medium text-[13px] hover:text-[#1d2433] hover:bg-white/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Appointments</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/60 text-[#1d2433] font-mono font-semibold">
                  {isFixtureMode ? 1 : appointments.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('urgent')}
                className={`w-full h-[48px] rounded-[24px] px-3.5 flex items-center justify-between transition-all ${
                  currentView === 'urgent'
                    ? 'bg-white rounded-[26px] border border-white shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.12)] text-[#1d2433] font-semibold text-[13px]'
                    : 'text-[#4a5470] font-medium text-[13px] hover:text-[#1d2433] hover:bg-white/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Urgent</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-mono font-bold">
                  {isFixtureMode ? 2 : stats.urgent}
                </span>
              </button>
            </nav>
          </div>

          {/* Doctor Profile & Logout Footer (Figma 82:56 doctor/profile) */}
          <div className="pt-4 border-t border-slate-200/50 flex items-center gap-2.5">
            <div className="w-[42px] h-[42px] rounded-[21px] bg-[#e4e8f2] border border-white text-[#1f2a44] font-bold text-[11px] flex items-center justify-center flex-shrink-0 shadow-sm">
              {currentDoctor.initials}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-[12px] text-[#1d2433] block truncate leading-tight">
                {currentDoctor.name}
              </span>
              <span className="text-[10px] text-[#4a5470] block truncate leading-tight">
                {currentDoctor.department_name}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-[10px] font-medium text-[#4a5470] hover:text-red-600 block mt-0.5 transition-colors focus:outline-none"
              >
                Log out
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="relative z-10 flex-1 overflow-y-auto">
          {currentView === 'dashboard' && (
            <DoctorDashboardView
              doctor={currentDoctor}
              stats={stats}
              recentReports={reports}
              bookedReportIds={bookedReportIds}
              onSelectReport={handleSelectReport}
              onNavigateTab={(tab) => setCurrentView(tab)}
            />
          )}

          {currentView === 'reports' && (
            <DoctorReportsList
              reports={reports}
              bookedReportIds={bookedReportIds}
              onSelectReport={handleSelectReport}
              onBack={() => setCurrentView('dashboard')}
            />
          )}

          {currentView === 'appointments' && (
            <DoctorAppointmentsView
              appointments={allAppointments}
              onSelectReport={handleSelectReport}
              onBack={() => setCurrentView('dashboard')}
            />
          )}

          {currentView === 'urgent' && (
            <DoctorUrgentList
              urgentReports={urgentReports}
              onSelectReport={handleSelectReport}
              onBack={() => setCurrentView('dashboard')}
            />
          )}

          {currentView === 'report_detail' && selectedReport && (
            selectedReport.status === 'urgent_partial' ? (
              <DoctorUrgentDetail
                report={selectedReport}
                currentDoctor={currentDoctor}
                onBack={() => setCurrentView(previousView || 'urgent')}
                onRefreshReport={() => loadData(currentDoctor.id)}
              />
            ) : (
              <DoctorReportDetail
                report={selectedReport}
                onBack={() => setCurrentView(previousView || 'reports')}
                onRefreshReport={() => loadData(currentDoctor.id)}
              />
            )
          )}
        </main>
      </div>
    </div>
  );
};
