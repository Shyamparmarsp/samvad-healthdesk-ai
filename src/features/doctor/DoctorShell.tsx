import React, { useState, useEffect } from 'react';
import { DoctorProfile, DoctorDashboardStats, Appointment } from '../../types/doctor';
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
  const [currentDoctor, setCurrentDoctor] = useState<DoctorProfile | null>(null);
  const [currentView, setCurrentView] = useState<DoctorView>('dashboard');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

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
    if (currentDoctor) {
      loadData(currentDoctor.id);
    }
  }, [currentDoctor, currentView]);

  const handleSelectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setCurrentView('report_detail');
  };

  const handleLogout = async () => {
    await doctorLogout();
    setCurrentDoctor(null);
  };

  if (!currentDoctor) {
    return <DoctorLogin onLoginSuccess={(doc) => setCurrentDoctor(doc)} />;
  }

  const selectedReport = reports.find((r) => r.id === selectedReportId);
  const bookedReportIds = new Set(appointments.map((a) => a.report_id));
  const urgentReports = reports.filter((r) => r.status === 'urgent_partial');

  return (
    <div className="w-full max-w-[1280px] min-h-[820px] bg-slate-100 rounded-3xl shadow-xl border border-slate-300 overflow-hidden flex flex-col md:flex-row mx-auto my-4">
      {/* 4-Item Sidebar (Exact D2 Layout, No Settings, No Bell, No Print) */}
      <aside className="w-full md:w-64 bg-brand-navy text-white flex flex-col justify-between p-5 flex-shrink-0">
        <div>
          {/* Clinical Portal Header */}
          <div className="flex items-center gap-3 pb-6 border-b border-white/10">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-sm">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight block">
                Clinical Desk
              </span>
              <span className="text-[10px] text-indigo-300 block uppercase tracking-wider font-semibold">
                Samvad HealthDesk
              </span>
            </div>
          </div>

          {/* 4 Navigation Items Only */}
          <nav className="mt-6 space-y-1">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentView === 'dashboard'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-indigo-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Dashboard
            </button>

            <button
              onClick={() => setCurrentView('reports')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentView === 'reports'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-indigo-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Reports
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-mono">
                {reports.length}
              </span>
            </button>

            <button
              onClick={() => setCurrentView('appointments')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentView === 'appointments'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-indigo-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Appointments
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-mono">
                {appointments.length}
              </span>
            </button>

            <button
              onClick={() => setCurrentView('urgent')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentView === 'urgent'
                  ? 'bg-red-900/60 text-white shadow-sm border border-red-500/40'
                  : 'text-red-200 hover:bg-red-950/40 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
                Urgent Triage
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-mono font-bold">
                {stats.urgent}
              </span>
            </button>
          </nav>
        </div>

        {/* Doctor Identity & Logout Footer */}
        <div className="pt-6 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold uppercase shadow-sm">
              {currentDoctor.initials}
            </div>
            <div>
              <span className="font-bold text-xs block text-white truncate max-w-[120px]">
                {currentDoctor.name}
              </span>
              <span className="text-[10px] text-indigo-300 block truncate max-w-[120px]">
                {currentDoctor.department_name}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-1.5 rounded-lg text-indigo-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content View Container */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {currentView === 'dashboard' && (
          <DoctorDashboardView
            doctor={currentDoctor}
            stats={stats}
            recentReports={reports}
            onSelectReport={handleSelectReport}
            onNavigateTab={(tab) => setCurrentView(tab)}
          />
        )}

        {currentView === 'reports' && (
          <DoctorReportsList
            reports={reports}
            bookedReportIds={bookedReportIds}
            onSelectReport={handleSelectReport}
          />
        )}

        {currentView === 'appointments' && (
          <DoctorAppointmentsView
            appointments={appointments}
            onSelectReport={handleSelectReport}
          />
        )}

        {currentView === 'urgent' && (
          <DoctorUrgentList
            urgentReports={urgentReports}
            onSelectReport={handleSelectReport}
          />
        )}

        {currentView === 'report_detail' && selectedReport && (
          selectedReport.status === 'urgent_partial' ? (
            <DoctorUrgentDetail
              report={selectedReport}
              currentDoctor={currentDoctor}
              onBack={() => setCurrentView('reports')}
              onRefreshReport={() => loadData(currentDoctor.id)}
            />
          ) : (
            <DoctorReportDetail
              report={selectedReport}
              onBack={() => setCurrentView('reports')}
              onRefreshReport={() => loadData(currentDoctor.id)}
            />
          )
        )}
      </main>
    </div>
  );
};
