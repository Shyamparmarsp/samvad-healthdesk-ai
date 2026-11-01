import React from 'react';
import { DoctorDashboardStats, DoctorProfile } from '../../types/doctor';
import { ReportRow } from '../../types/report';

interface DoctorDashboardViewProps {
  doctor: DoctorProfile;
  stats: DoctorDashboardStats;
  recentReports: ReportRow[];
  onSelectReport: (reportId: string) => void;
  onNavigateTab: (tab: 'reports' | 'appointments' | 'urgent') => void;
}

export const DoctorDashboardView: React.FC<DoctorDashboardViewProps> = ({
  doctor,
  stats,
  recentReports,
  onSelectReport,
  onNavigateTab,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Welcome back, {doctor.name} ({doctor.department_name})
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider">
            Hospital Intake Active
          </span>
        </div>
      </div>

      {/* 4 Stat Cards (docs/report-design.md §15) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Urgent Card */}
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
          aria-label={`Urgent Triage: ${stats.urgent} emergency deterministic partials`}
          className="p-5 rounded-card bg-red-50/70 border border-red-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-800">
              Urgent Triage
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
          </div>
          <div className="text-3xl font-black text-red-950 mt-3 font-mono">
            {stats.urgent}
          </div>
          <p className="text-[11px] text-red-800/80 mt-1">
            Emergency deterministic partials
          </p>
        </div>

        {/* New Reports Card */}
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
          aria-label={`New Reports: ${stats.new_reports} submitted and unreviewed`}
          className="p-5 rounded-card bg-blue-50/70 border border-blue-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
            New Reports
          </span>
          <div className="text-3xl font-black text-blue-950 mt-3 font-mono">
            {stats.new_reports}
          </div>
          <p className="text-[11px] text-blue-800/80 mt-1">
            Submitted &amp; unreviewed
          </p>
        </div>

        {/* Booked Card */}
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
          aria-label={`Booked Consults: ${stats.booked} confirmed appointment slots`}
          className="p-5 rounded-card bg-emerald-50/70 border border-emerald-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            Booked Consults
          </span>
          <div className="text-3xl font-black text-emerald-950 mt-3 font-mono">
            {stats.booked}
          </div>
          <p className="text-[11px] text-emerald-800/80 mt-1">
            Confirmed appointment slots
          </p>
        </div>

        {/* Not Booked Card */}
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
          aria-label={`Not Booked: ${stats.not_booked} reports submitted without booking`}
          className="p-5 rounded-card bg-amber-50/70 border border-amber-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Not Booked
          </span>
          <div className="text-3xl font-black text-amber-950 mt-3 font-mono">
            {stats.not_booked}
          </div>
          <p className="text-[11px] text-amber-800/80 mt-1">
            Report submitted ("Not now" path)
          </p>
        </div>
      </div>

      {/* Recent Intake Reports Table (D2) */}
      <div className="rounded-card bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-text-primary tracking-tight">
            Recent Intake Reports
          </h2>
          <button
            onClick={() => onNavigateTab('reports')}
            className="text-xs font-semibold text-brand-navy hover:underline"
          >
            View all reports &rarr;
          </button>
        </div>

        {recentReports.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No intake reports available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Patient</th>
                  <th className="px-6 py-3">Primary Concern</th>
                  <th className="px-6 py-3">Department</th>
                  <th className="px-6 py-3">Reference</th>
                  <th className="px-6 py-3">Review</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentReports.slice(0, 5).map((r) => {
                  const isUrgent = r.status === 'urgent_partial';
                  const isReviewed = Boolean(r.reviewed_at);
                  return (
                    <tr
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
                      aria-label={`Open report for ${r.report.patient.name.value || 'Anonymous Patient'}`}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer focus:outline-none focus:bg-slate-100 focus:ring-2 focus:ring-inset focus:ring-brand-navy"
                    >
                      <td className="px-6 py-3.5">
                        {isUrgent ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 uppercase tracking-wide">
                            Urgent Partial
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                            Submitted
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-text-primary">
                        {r.report.patient.name.value || 'Anonymous'}
                        <span className="text-slate-400 font-normal block text-[11px]">
                          {r.report.patient.age.value ? `${r.report.patient.age.value} yrs` : ''} • {r.report.patient.gender.value || ''}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 max-w-xs truncate font-medium">
                        {r.report.primary_concern.value || 'N/A'}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]">
                          {r.report.routing_snapshot.department_name}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-[11px] text-slate-500">
                        {r.intake_reference}
                      </td>
                      <td className="px-6 py-3.5">
                        {isReviewed ? (
                          <span className="text-emerald-700 font-medium flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Reviewed
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-brand-navy hover:underline">
                        Review &rarr;
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

