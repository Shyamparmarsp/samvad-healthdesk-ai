import React, { useState, useEffect } from 'react';
import { DoctorProfile, DoctorDashboardStats, Appointment, DoctorReportsTab } from '../../types/doctor';
import { ReportRow } from '../../types/report';
import {
  getDoctorReports,
  getDoctorAppointments,
  getDoctorDashboardStats,
  doctorLogout,
} from '../../lib/api';

import { DoctorLogin } from './DoctorLogin';
import { DoctorDashboardView } from './DoctorDashboardView';
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

export const DoctorShell: React.FC = () => {
  /**
   * D-08: the doctor portal requires a real Supabase session. There is no fixture
   * router, no synthetic report table and no credential-free auto-open path.
   */
  const [currentDoctor, setCurrentDoctor] = useState<DoctorProfile | null>(null);
  const [currentView, setCurrentView] = useState<DoctorView>('dashboard');
  const [previousView, setPreviousView] = useState<DoctorView>('dashboard');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats] = useState<DoctorDashboardStats>({
    urgent: 0,
    new_reports: 0,
    booked: 0,
    not_booked: 0,
  });

  // D-25: loading/error are surfaced instead of being swallowed into empty lists.
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // D-29: report list filter state survives opening a report and coming back.
  const [reportsTab, setReportsTab] = useState<DoctorReportsTab>('all');
  const [reportsSearch, setReportsSearch] = useState('');

  const loadData = async (docId?: string) => {
    setIsLoadingData(true);
    setLoadError(null);
    try {
      const [reps, apts, st] = await Promise.all([
        getDoctorReports(docId),
        getDoctorAppointments(docId),
        getDoctorDashboardStats(docId),
      ]);
      setReports(reps);
      setAppointments(apts);
      setStats(st);
    } catch (err: any) {
      // Keep the last good data on screen; report the failure explicitly.
      setLoadError(
        err?.code === 'unauthorized'
          ? 'Your session has expired. Please log in again.'
          : 'Could not load the doctor portal data. Check the connection and retry.',
      );
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (currentDoctor) {
      void loadData(currentDoctor.id);
    }
  }, [currentDoctor]);

  const handleSelectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setPreviousView(currentView);
    setCurrentView('report_detail');
  };

  const handleLogout = async () => {
    await doctorLogout();
    setCurrentDoctor(null);
    setReports([]);
    setAppointments([]);
    setSelectedReportId(null);
    setCurrentView('dashboard');
  };

  if (!currentDoctor) {
    return <DoctorLogin onLoginSuccess={(doc) => setCurrentDoctor(doc)} />;
  }

  const allReports = reports;
  const selectedReport = allReports.find((r) => r.id === selectedReportId);
  const bookedReportIds = new Set(appointments.map((a) => a.report_id));
  const urgentReports = reports.filter((r) => r.status === 'urgent_partial');

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
                  {allReports.length}
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
                  {appointments.length}
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
                  {urgentReports.length}
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
          {/* D-25: explicit load failure with retry, last good data kept behind it */}
          {loadError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-[16px] bg-red-50/95 border border-red-200 text-red-900 text-xs flex items-center justify-between gap-3"
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => void loadData(currentDoctor.id)}
                disabled={isLoadingData}
                className="px-3 py-1.5 rounded-full bg-[#1f2a44] text-white font-semibold disabled:opacity-50"
              >
                {isLoadingData ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}

          {isLoadingData && reports.length === 0 && !loadError && (
            <div role="status" aria-live="polite" className="mb-4 text-[11px] text-[#4a5470]">
              Loading doctor portal data…
            </div>
          )}

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
              reports={allReports}
              bookedReportIds={bookedReportIds}
              onSelectReport={handleSelectReport}
              onBack={() => setCurrentView('dashboard')}
              activeTab={reportsTab}
              searchQuery={reportsSearch}
              onActiveTabChange={setReportsTab}
              onSearchChange={setReportsSearch}
            />
          )}

          {currentView === 'appointments' && (
            <DoctorAppointmentsView
              appointments={appointments}
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

          {currentView === 'report_detail' && !selectedReport && (
            <div role="alert" className="p-6 rounded-[18px] bg-white/70 text-xs text-[#4a5470]">
              That report is not available to this account.
              <button
                type="button"
                onClick={() => setCurrentView('reports')}
                className="ml-2 font-semibold text-[#1f2a44] underline"
              >
                Back to reports
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
