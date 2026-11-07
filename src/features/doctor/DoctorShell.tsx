import React, { useState, useEffect } from 'react';
import { DoctorProfile, DoctorDashboardStats, Appointment, DoctorReportsTab, DoctorAppointmentsTab } from '../../types/doctor';
import { ReportRow } from '../../types/report';
import {
  getDoctorReports,
  getDoctorAppointments,
  getDoctorDashboardStats,
  getAppMode,
  doctorLogout,
  deleteDoctorReport,
  restoreDoctorSession,
} from '../../lib/api';
import { getDoctorLoginSession } from '../../lib/doctor-login-session';

import { ThemeToggle } from '../common/ThemeToggle';
import { DoctorLogin } from './DoctorLogin';
import { DoctorDashboardView } from './DoctorDashboardView';
import { DoctorReportsList } from './DoctorReportsList';
import { DoctorReportDetail } from './DoctorReportDetail';
import { DoctorUrgentDetail } from './DoctorUrgentDetail';
import { DoctorAppointmentsView } from './DoctorAppointmentsView';
import { DoctorUrgentList } from './DoctorUrgentList';
import { SamwadAssistant } from './SamwadAssistant';
import { assistantAudio } from '../../lib/audio/assistant-audio';

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
  /** Stable id of the current login. Mirrors the central login-session store. */
  const [loginSessionId, setLoginSessionId] = useState<string | null>(null);
  /** Restoring a persisted Auth session is not a login and must not brief again. */
  const [isRestoringSession, setIsRestoringSession] = useState(() => {
    // In mock mode a stored login record is the only restore candidate, so a fresh
    // visitor sees the login form immediately. In Supabase mode the session lives in
    // the Auth client storage and is checked asynchronously.
    if (getAppMode() === 'supabase') return true;
    return Boolean(getDoctorLoginSession());
  });

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
  // The assistant must stay silent until the dashboard data has actually arrived.
  const [hasLoadedData, setHasLoadedData] = useState(false);

  // D-29: report list filter state survives opening a report and coming back.
  const [reportsTab, setReportsTab] = useState<DoctorReportsTab>('all');
  const [reportsSearch, setReportsSearch] = useState('');
  // Appointment tab lives here too, so the assistant summarises the visible tab.
  const [appointmentsTab, setAppointmentsTab] = useState<DoctorAppointmentsTab>('upcoming');

  /**
   * Re-attach to an existing authenticated session after a refresh. This is deliberately
   * separate from login: the central login-session store keeps the same nonce (and its
   * "already briefed" flag), so restoration can never re-trigger the greeting.
   */
  useEffect(() => {
    let active = true;
    void restoreDoctorSession()
      .then((doctor) => {
        if (!active) return;
        if (doctor) {
          setCurrentDoctor(doctor);
          setLoginSessionId(getDoctorLoginSession(doctor.id)?.id ?? null);
        }
      })
      .catch(() => {
        // A failed restore leaves the login form in charge; it never greets.
      })
      .finally(() => {
        if (active) setIsRestoringSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  /** A successful login: adopt the nonce minted by the sign-in action itself. */
  const handleLoginSuccess = (doctor: DoctorProfile) => {
    setLoginSessionId(getDoctorLoginSession(doctor.id)?.id ?? null);
    setCurrentDoctor(doctor);
  };

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
      setHasLoadedData(true);
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

  /**
   * Deletes one report and refreshes every derived view.
   *
   * The delete itself is a single authorised database call; only after it resolves does
   * the shell leave the detail view and re-read reports/appointments/stats, so the list,
   * the dashboard counters and the queues can never show a stale row.
   */
  const handleDeleteReport = async (reportId: string) => {
    await deleteDoctorReport(reportId, currentDoctor?.id);
    if (selectedReportId === reportId) {
      setSelectedReportId(null);
      setCurrentView('reports');
    }
    await loadData(currentDoctor?.id);
  };

  /**
   * One global voice: leaving a page stops its speech immediately, before React swaps the
   * view, so a slow unmount can never let two summaries talk over each other.
   */
  useEffect(() => {
    assistantAudio.stop();
  }, [currentView, selectedReportId]);

  const handleSelectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setPreviousView(currentView);
    setCurrentView('report_detail');
  };

  const handleLogout = async () => {
    await doctorLogout();
    setCurrentDoctor(null);
    setLoginSessionId(null);
    setReports([]);
    setAppointments([]);
    setSelectedReportId(null);
    setCurrentView('dashboard');
    setHasLoadedData(false);
    // Never keep a doctor's summary audio or pending speech after logout.
    assistantAudio.reset();
  };

  if (isRestoringSession) {
    return (
      <div role="status" className="flex items-center justify-center py-20 text-xs text-slate-500 gap-2">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" aria-hidden />
        Restoring doctor session…
      </div>
    );
  }

  if (!currentDoctor) {
    return <DoctorLogin onLoginSuccess={handleLoginSuccess} />;
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
            <div className="flex items-center justify-between gap-2 pb-6 pt-1">
              <div className="flex items-center gap-2.5">
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
              <ThemeToggle />
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
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 23 23"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 flex-shrink-0"
                >
                  <path
                    d="M8.62504 3.8335H4.79171C4.26243 3.8335 3.83337 4.26256 3.83337 4.79183V8.62516C3.83337 9.15444 4.26243 9.5835 4.79171 9.5835H8.62504C9.15431 9.5835 9.58337 9.15444 9.58337 8.62516V4.79183C9.58337 4.26256 9.15431 3.8335 8.62504 3.8335Z"
                    stroke="#1F2A44"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18.2083 3.8335H14.375C13.8457 3.8335 13.4166 4.26256 13.4166 4.79183V8.62516C13.4166 9.15444 13.8457 9.5835 14.375 9.5835H18.2083C18.7376 9.5835 19.1666 9.15444 19.1666 8.62516V4.79183C19.1666 4.26256 18.7376 3.8335 18.2083 3.8335Z"
                    stroke="#1F2A44"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8.62504 13.4165H4.79171C4.26243 13.4165 3.83337 13.8456 3.83337 14.3748V18.2082C3.83337 18.7374 4.26243 19.1665 4.79171 19.1665H8.62504C9.15431 19.1665 9.58337 18.7374 9.58337 18.2082V14.3748C9.58337 13.8456 9.15431 13.4165 8.62504 13.4165Z"
                    stroke="#1F2A44"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18.2083 13.4165H14.375C13.8457 13.4165 13.4166 13.8456 13.4166 14.3748V18.2082C13.4166 18.7374 13.8457 19.1665 14.375 19.1665H18.2083C18.7376 19.1665 19.1666 18.7374 19.1666 18.2082V14.3748C19.1666 13.8456 18.7376 13.4165 18.2083 13.4165Z"
                    stroke="#1F2A44"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
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
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 23 23"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5 flex-shrink-0"
                  >
                    <path
                      d="M5.75 2.875H13.4167L17.25 6.70833V20.125H5.75V2.875Z"
                      stroke="#1F2A44"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M13.4167 2.875V7.66667H17.25M8.625 11.5H14.375M8.625 15.3333H14.375"
                      stroke="#1F2A44"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 23 23"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5 flex-shrink-0"
                  >
                    <path
                      d="M18.2083 4.7915H4.79167C3.73312 4.7915 2.875 5.64962 2.875 6.70817V18.2082C2.875 19.2667 3.73312 20.1248 4.79167 20.1248H18.2083C19.2669 20.1248 20.125 19.2667 20.125 18.2082V6.70817C20.125 5.64962 19.2669 4.7915 18.2083 4.7915Z"
                      stroke="#1F2A44"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7.66667 2.875V6.70833M15.3333 2.875V6.70833M2.875 9.58333H20.125"
                      stroke="#1F2A44"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 23 23"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5 flex-shrink-0 text-red-600"
                  >
                    <path
                      d="M11.5 2.875L21.0833 20.125H1.91663L11.5 2.875Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11.5 8.625V13.4167M11.5 16.2917V16.3875"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
              assistant={
                <SamwadAssistant
                  doctorId={currentDoctor.id}
                  page={{ kind: 'dashboard' }}
                  autoGreet
                  loginSessionId={loginSessionId}
                  dataReady={hasLoadedData && !isLoadingData}
                  dataFailed={Boolean(loadError)}
                />
              }
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
              assistant={
                <SamwadAssistant doctorId={currentDoctor.id} page={{ kind: 'reports', tab: reportsTab, searchQuery: reportsSearch }} />
              }
              onDeleteReport={handleDeleteReport}
            />
          )}

          {currentView === 'appointments' && (
            <DoctorAppointmentsView
              appointments={appointments}
              onSelectReport={handleSelectReport}
              onBack={() => setCurrentView('dashboard')}
              activeTab={appointmentsTab}
              onActiveTabChange={setAppointmentsTab}
              assistant={<SamwadAssistant doctorId={currentDoctor.id} page={{ kind: 'appointments', tab: appointmentsTab }} />}
            />
          )}

          {currentView === 'urgent' && (
            <DoctorUrgentList
              urgentReports={urgentReports}
              onSelectReport={handleSelectReport}
              onBack={() => setCurrentView('dashboard')}
              assistant={<SamwadAssistant doctorId={currentDoctor.id} page={{ kind: 'urgent_review' }} />}
            />
          )}

          {currentView === 'report_detail' && selectedReport && (
            selectedReport.status === 'urgent_partial' ? (
              <DoctorUrgentDetail
                report={selectedReport}
                currentDoctor={currentDoctor}
                onBack={() => setCurrentView(previousView || 'urgent')}
                onRefreshReport={() => loadData(currentDoctor.id)}
                assistant={
                  <SamwadAssistant doctorId={currentDoctor.id} page={{ kind: 'urgent_detail', report: selectedReport }} />
                }
              />
            ) : (
              <DoctorReportDetail
                report={selectedReport}
                onBack={() => setCurrentView(previousView || 'reports')}
                onRefreshReport={() => loadData(currentDoctor.id)}
                assistant={
                  <SamwadAssistant doctorId={currentDoctor.id} page={{ kind: 'report_detail', report: selectedReport }} />
                }
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
