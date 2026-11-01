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
    // 1. Tab filter
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

export const DoctorReportsList: React.FC<DoctorReportsListProps> = ({
  reports,
  bookedReportIds,
  onSelectReport,
}) => {
  const [activeTab, setActiveTab] = useState<DoctorReportsTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Tab filtering logic per docs/report-design.md §15
  const filteredReports = filterReportsByTab(reports, activeTab, bookedReportIds, searchQuery);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Patient Intake Reports
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Filter by triage status, booked appointments, or search by patient reference.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient or ref..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Filter Tabs (D3) */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold">
        {(['all', 'urgent', 'booked', 'not_booked'] as DoctorReportsTab[]).map((tab) => {
          const isActive = activeTab === tab;
          const labels: Record<DoctorReportsTab, string> = {
            all: 'All Reports',
            urgent: 'Urgent Triage',
            booked: 'Booked',
            not_booked: 'Not Booked',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 capitalize transition-colors relative ${
                isActive
                  ? 'text-brand-navy border-b-2 border-brand-navy font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Reports Table */}
      <div className="rounded-card bg-white border border-slate-200 shadow-sm overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No reports match the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Patient Details</th>
                  <th className="px-6 py-3">Primary Concern</th>
                  <th className="px-6 py-3">Department</th>
                  <th className="px-6 py-3">Intake Reference</th>
                  <th className="px-6 py-3">Review</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredReports.map((r) => {
                  const isUrgent = r.status === 'urgent_partial';
                  const isReviewed = Boolean(r.reviewed_at);
                  const isBooked = bookedReportIds.has(r.id);
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
                      aria-label={`View intake report for ${r.report.patient.name.value || 'Anonymous Patient'}`}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer focus:outline-none focus:bg-slate-100 focus:ring-2 focus:ring-inset focus:ring-brand-navy"
                    >
                      <td className="px-6 py-3.5">
                        {isUrgent ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 uppercase tracking-wide">
                            Urgent Partial
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                            {isBooked ? 'Booked' : 'Submitted'}
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
                        Open &rarr;
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

