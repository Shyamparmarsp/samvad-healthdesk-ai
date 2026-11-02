import React, { useState } from 'react';
import { DoctorReportsTab } from '../../types/doctor';
import { ReportRow } from '../../types/report';

interface DoctorReportsListProps {
  reports: ReportRow[];
  bookedReportIds: Set<string>;
  onSelectReport: (reportId: string) => void;
}

export function filterReportsByTab(
  reports: ReportRow[],
  tab: DoctorReportsTab,
  bookedReportIds: Set<string>,
  searchQuery: string = ''
): ReportRow[] {
  return reports.filter((r) => {
    // 1. Tab filter per docs/report-design.md §15
    if (tab === 'urgent' && r.status !== 'urgent_partial') return false;
    if (tab === 'booked' && !bookedReportIds.has(r.id)) return false;
    if (tab === 'not_booked' && (r.status !== 'submitted' || bookedReportIds.has(r.id))) return false;

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const patientName = (r.report.patient.name.value || '').toLowerCase();
      const refCode = r.intake_reference.toLowerCase();
      const concern = (r.report.primary_concern.value || '').toLowerCase();
      return patientName.includes(q) || refCode.includes(q) || concern.includes(q);
    }

    return true;
  });
}

function getInitials(name?: string): string {
  if (!name) return 'PT';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export const DoctorReportsList: React.FC<DoctorReportsListProps> = ({
  reports,
  bookedReportIds,
  onSelectReport,
}) => {
  const [activeTab, setActiveTab] = useState<DoctorReportsTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredReports = filterReportsByTab(reports, activeTab, bookedReportIds, searchQuery);

  const tabs: { key: DoctorReportsTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'booked', label: 'Booked' },
    { key: 'not_booked', label: 'Not booked' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header matching Figma D3 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-[#1d2433] tracking-tight">
            Reports
          </h1>
          <p className="text-[12px] text-[#4a5470] mt-0.5">
            Patient Intake Reports · Triage, filter and review submitted clinical statements
          </p>
        </div>

        {/* Search input with frosted glass */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient or ref..."
            className="w-full h-10 pl-9 pr-3 rounded-full border border-white bg-white/70 backdrop-blur-[6px] text-xs text-[#1d2433] placeholder-[#4a5470]/60 shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.08)] focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          />
          <svg className="w-4 h-4 text-[#4a5470] absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Frosted Reports Card matching Figma 82:166 */}
      <div className="rounded-[24px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] space-y-6">
        {/* Figma Pill Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`h-[34px] px-4 rounded-full text-[11px] font-semibold transition-all ${
                  isActive
                    ? 'bg-[#1f2a44] text-white shadow-sm'
                    : 'bg-[rgba(255,255,255,0.55)] backdrop-blur-[6px] text-[#4a5470] border border-white hover:bg-white/80'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Table / List */}
        {filteredReports.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#4a5470]">
            No reports match the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#dde3ee]/80 text-[#4a5470] font-semibold text-[11px]">
                <tr>
                  <th className="pb-3 px-4">Patient</th>
                  <th className="pb-3 px-4">Primary Concern</th>
                  <th className="pb-3 px-4">Status</th>
                  <th className="pb-3 px-4">Reference / Time</th>
                  <th className="pb-3 px-4">Review</th>
                  <th className="pb-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dde3ee]/60 text-[#1d2433]">
                {filteredReports.map((r) => {
                  const isUrgent = r.status === 'urgent_partial';
                  const isReviewed = Boolean(r.reviewed_at);
                  const isBooked = bookedReportIds.has(r.id);
                  const patientName = r.report.patient.name.value || 'Anonymous Patient';
                  const patientAge = r.report.patient.age.value ? `${r.report.patient.age.value} yrs` : '';
                  const patientGender = r.report.patient.gender.value || '';
                  const timeFormatted = new Date(r.created_at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  });

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
                      aria-label={`View intake report for ${patientName}`}
                      className="hover:bg-white/50 transition-colors cursor-pointer focus:outline-none focus:bg-white/70"
                    >
                      {/* Patient Avatar + Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="size-[38px] rounded-full bg-[#e4e8f2] border border-white text-[#1f2a44] font-semibold text-[11px] flex items-center justify-center shrink-0">
                            {getInitials(patientName)}
                          </div>
                          <div>
                            <span className="font-bold text-[#1d2433] text-[13px] block">
                              {patientName} {patientAge ? `· ${patientAge}` : ''}
                            </span>
                            <span className="text-[10px] text-[#4a5470]">
                              {patientGender} {patientGender && r.report.routing_snapshot.department_name ? '· ' : ''}
                              {r.report.routing_snapshot.department_name}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Primary Concern */}
                      <td className="py-3.5 px-4 max-w-xs text-[#4a5470] text-[11px] truncate">
                        {r.report.primary_concern.value || 'Not provided'}
                      </td>

                      {/* Status Pill */}
                      <td className="py-3.5 px-4">
                        {isUrgent ? (
                          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold bg-[#fde2e2] text-[#a12626]">
                            Urgent
                          </span>
                        ) : isBooked ? (
                          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold bg-[#dcf3e6] text-[#176a3b]">
                            Booked
                          </span>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold bg-[#eef2f8] text-[#4a5470]">
                            Not booked
                          </span>
                        )}
                      </td>

                      {/* Reference / Timestamp */}
                      <td className="py-3.5 px-4 text-[#4a5470] text-[10px]">
                        <span className="font-mono block">{r.intake_reference}</span>
                        <span className="text-[10px] text-[#4a5470]/80">{timeFormatted}</span>
                      </td>

                      {/* Review State */}
                      <td className="py-3.5 px-4 text-[10px]">
                        {isReviewed ? (
                          <span className="text-[#176a3b] font-semibold flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Reviewed
                          </span>
                        ) : (
                          <span className="text-[#3a4468] font-medium">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Chevron / Open */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center text-[#1f2a44] font-semibold text-xs hover:underline">
                          Open &rarr;
                        </span>
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
