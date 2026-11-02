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

export const DoctorDashboardView: React.FC<DoctorDashboardViewProps> = ({
  doctor,
  stats,
  recentReports,
  bookedReportIds,
  onSelectReport,
  onNavigateTab,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Welcome Header (Figma 82:62 & 82:63) */}
      <div>
        <h1 className="text-[26px] font-bold text-[#1d2433] tracking-tight leading-tight">
          Welcome, {doctor.name}
        </h1>
        <p className="text-[13px] text-[#4a5470] mt-0.5">
          {doctor.department_name} · Dashboard Overview
        </p>
      </div>

      {/* 4 Stat Metric Cards (Figma 82:64 - 82:74) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Urgent Card (Figma 82:64) */}
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
          aria-label={`Urgent: ${stats.urgent}`}
          className="h-[102px] rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
        >
          <span className="text-[26px] font-bold text-[#1d2433] leading-none">
            {stats.urgent}
          </span>
          <span className="text-[12px] font-semibold text-[#4a5470] mt-1.5">
            Urgent
          </span>
        </div>

        {/* New Reports Card (Figma 82:67) */}
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
          aria-label={`New Reports: ${stats.new_reports}`}
          className="h-[102px] rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
        >
          <span className="text-[26px] font-bold text-[#1d2433] leading-none">
            {stats.new_reports}
          </span>
          <span className="text-[12px] font-semibold text-[#4a5470] mt-1.5">
            New Reports
          </span>
        </div>

        {/* Booked Card (Figma 82:70) */}
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
          aria-label={`Booked: ${stats.booked}`}
          className="h-[102px] rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
        >
          <span className="text-[26px] font-bold text-[#1d2433] leading-none">
            {stats.booked}
          </span>
          <span className="text-[12px] font-semibold text-[#4a5470] mt-1.5">
            Booked
          </span>
        </div>

        {/* Not Booked Card (Figma 82:73) */}
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
          aria-label={`Not booked: ${stats.not_booked}`}
          className="h-[102px] rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
        >
          <span className="text-[26px] font-bold text-[#1d2433] leading-none">
            {stats.not_booked}
          </span>
          <span className="text-[12px] font-semibold text-[#4a5470] mt-1.5">
            Not booked
          </span>
        </div>
      </div>

      {/* Recent Pre-Visit Reports Card (Figma 82:76 dashboard/reports-card) */}
      <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[24px] p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200/60">
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

        {recentReports.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#4a5470]">
            No intake reports available yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/60">
            {recentReports.slice(0, 6).map((r) => {
              const isUrgent = r.status === 'urgent_partial';
              const isBooked = bookedReportIds ? bookedReportIds.has(r.id) : false;

              let statusLabel = 'Submitted';
              let statusClass = 'bg-[#eef2f8] text-[#4a5470]';

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
                statusClass = 'bg-[#eef2f8] text-[#4a5470]';
              }

              const initials = (r.report.patient.name.value || 'Anonymous')
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'PT';

              const timeDisplay = r.submitted_at
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
                    <span className={`px-3 py-1 rounded-[12px] text-[10px] font-semibold uppercase tracking-wider ${statusClass}`}>
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
