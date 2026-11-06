import React, { useState } from 'react';
import { DoctorReportsTab } from '../../types/doctor';
import { ReportRow } from '../../types/report';
import { formatIstTime } from '../../lib/booking-time';
import { DoctorPageHeader } from './DoctorPageHeader';
import { TrashIcon } from './TrashIcon';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface DoctorReportsListProps {
  reports: ReportRow[];
  bookedReportIds: Set<string>;
  onSelectReport: (reportId: string) => void;
  onBack?: () => void;
  /**
   * D-29: tab and search state are owned by the shell so that opening a report and
   * pressing Back does not reset the doctor's filter. When omitted the list keeps its
   * own state (standalone/test usage).
   */
  activeTab?: DoctorReportsTab;
  searchQuery?: string;
  onActiveTabChange?: (tab: DoctorReportsTab) => void;
  onSearchChange?: (query: string) => void;
  /** Upper-right header slot: the shared Samwad Assistant. */
  assistant?: React.ReactNode;
  /**
   * Permanently deletes one report. The shell owns this call so it can refresh every
   * affected view (dashboard counters, queues, totals) after the server confirms.
   */
  onDeleteReport?: (reportId: string) => Promise<void>;
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
    if (tab === 'not_booked' && (!['submitted', 'partial'].includes(r.status) || bookedReportIds.has(r.id))) return false;

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
  onBack,
  activeTab: controlledTab,
  searchQuery: controlledSearch,
  onActiveTabChange,
  onSearchChange,
  assistant,
  onDeleteReport,
}) => {
  const [internalTab, setInternalTab] = useState<DoctorReportsTab>('all');
  const [internalSearch, setInternalSearch] = useState('');
  // Deletion is a two-step, server-confirmed action: dialog first, then the RPC.
  const [pendingDelete, setPendingDelete] = useState<ReportRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);

  const activeTab = controlledTab ?? internalTab;
  const searchQuery = controlledSearch ?? internalSearch;

  const setActiveTab = (tab: DoctorReportsTab) => {
    if (onActiveTabChange) onActiveTabChange(tab);
    else setInternalTab(tab);
  };
  const setSearchQuery = (query: string) => {
    if (onSearchChange) onSearchChange(query);
    else setInternalSearch(query);
  };

  const requestDelete = (report: ReportRow) => {
    if (isDeleting) return;
    setDeleteError(null);
    setDeletedNotice(null);
    setPendingDelete(report);
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target || isDeleting || !onDeleteReport) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteReport(target.id);
      // Only now, after the server confirmed, is the row allowed to disappear.
      setPendingDelete(null);
      setDeletedNotice('Report permanently deleted.');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      setDeleteError(
        code === 'forbidden'
          ? 'You are not allowed to delete this report.'
          : code === 'not_found'
            ? 'This report has already been deleted.'
            : 'The report could not be deleted. Please try again.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredReports = filterReportsByTab(reports, activeTab, bookedReportIds, searchQuery);

  const tabs: { key: DoctorReportsTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'booked', label: 'Booked' },
    { key: 'not_booked', label: 'Not booked' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header matching Figma D3, with the Samwad Assistant upper-right */}
      <DoctorPageHeader
        title="Reports"
        subtitle="Patient Intake Reports · Triage, filter and review submitted clinical statements"
        back={onBack ? { onClick: onBack, label: 'Back to Dashboard' } : undefined}
        assistant={assistant}
        toolbar={
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient or ref..."
              aria-label="Search reports by patient, reference or concern"
              className="h-10 w-full rounded-full border border-white bg-white/70 pl-9 pr-3 text-xs text-[#1d2433] placeholder-[#4a5470]/60 shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.08)] backdrop-blur-[6px] focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
            />
            <svg className="absolute left-3 top-3 h-4 w-4 text-[#4a5470]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        }
      />

      {/* Delete outcome, announced without hiding the list */}
      {deletedNotice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-[16px] border border-emerald-200 bg-[#dcf3e6] px-4 py-3 text-[12px] font-medium text-[#176a3b]"
        >
          <span>{deletedNotice}</span>
          <button
            type="button"
            onClick={() => setDeletedNotice(null)}
            aria-label="Dismiss message"
            className="text-[12px] font-semibold text-[#176a3b] underline focus:outline-none"
          >
            Dismiss
          </button>
        </div>
      )}

      {deleteError && !pendingDelete && (
        <div role="alert" className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-medium text-red-900">
          {deleteError}
        </div>
      )}

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

        {/* List matching Figma D3 (74:125 / 81:144) */}
        {filteredReports.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#4a5470]">
            No reports match the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs">
              <tbody className="divide-y divide-[#dde3ee]/60">
                {filteredReports.map((r) => {
                  const isUrgent = r.status === 'urgent_partial';
                  const isPartial = r.status === 'partial';
                  const isBooked = bookedReportIds.has(r.id);
                  const patientName = r.report.patient.name.value || 'Anonymous Patient';
                  const patientAge = r.report.patient.age.value ? `${r.report.patient.age.value} yrs` : '';
                  const primaryConcern = r.report.primary_concern?.value || 'Not provided';
                  const timeFormatted = formatIstTime(r.created_at) ?? 'Time unavailable';

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
                      className="hover:bg-white/60 transition-colors cursor-pointer rounded-[14px] focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
                    >
                      <td className="py-4 px-3" colSpan={6}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          {/* Left: Avatar + Name / Age + Primary Concern */}
                          <div className="flex items-center gap-4 min-w-0 pr-4">
                            <div className="size-[42px] rounded-full bg-[#e5eaf4] text-[#1f2a44] font-semibold text-[13px] flex items-center justify-center shrink-0">
                              {getInitials(patientName)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[#1d2433] text-[14px] truncate">
                                {patientName} {patientAge ? `· ${patientAge}` : ''}
                              </div>
                              <div className="text-[12px] text-[#4a5470] truncate mt-0.5 max-w-md">
                                {primaryConcern}
                              </div>
                            </div>
                          </div>

                          {/* Right: status, time, permanent delete, open arrow. On phones this
                              wraps to its own row so the delete control stays visible. */}
                          <div className="flex shrink-0 items-center gap-3 sm:justify-end sm:gap-4 lg:gap-6">
                            {/* v1.3 partial intake badge: never confusable with urgent. */}
                            {isPartial && (
                              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold bg-[#fff0e6] text-[#b2651a]">
                                PARTIAL INTAKE
                              </span>
                            )}
                            {/* Status badge matching Figma D3 */}
                            {isUrgent ? (
                              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold bg-[#ffe2e5] text-[#d63031]">
                                Urgent
                              </span>
                            ) : r.possible_urgent || r.needs_human_review ? (
                              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold bg-[#fff0e6] text-[#e67e22]">
                                Urgent review
                              </span>
                            ) : isBooked ? (
                              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold bg-[#e6f9ed] text-[#27ae60]">
                                Booked
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-[#4a5470]">
                                Not booked
                              </span>
                            )}

                            {/* Time — the row is tight on phones; the list still shows it
                                from the tablet breakpoint up. */}
                            <span className="hidden w-16 text-right text-[12px] font-medium text-[#4a5470] lg:block">
                              {timeFormatted}
                            </span>

                            {/* Permanent delete — immediately before the open arrow. */}
                            {onDeleteReport && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  requestDelete(r);
                                }}
                                onKeyDown={(event) => {
                                  // The row itself opens the report on Enter/Space.
                                  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                                }}
                                aria-label={`Delete report: ${patientName}`}
                                title="Delete report"
                                disabled={isDeleting}
                                className="flex h-10 w-10 items-center justify-center rounded-full text-[#dc2626] transition-colors hover:bg-[#fee2e2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dc2626] disabled:opacity-50"
                              >
                                <TrashIcon />
                              </button>
                            )}

                            {/* Chevron right matching Figma */}
                            <svg className="w-4 h-4 text-[#1d2433]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Permanently delete report?"
        description={`Do you want to permanently delete this report and its report-specific data? This action cannot be undone.${
          deleteError ? ` ${deleteError}` : ''
        }`}
        confirmLabel="Delete report"
        cancelLabel="Cancel"
        tone="danger"
        busy={isDeleting}
        busyLabel="Deleting…"
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </div>
  );
};
