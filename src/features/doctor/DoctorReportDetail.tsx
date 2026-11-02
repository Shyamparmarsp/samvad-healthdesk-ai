import React, { useEffect, useState } from 'react';
import { ReportRow } from '../../types/report';
import { DoctorConversationMessage } from '../../types/api';
import { getDoctorMessages, markReportReviewed } from '../../lib/api';

interface DoctorReportDetailProps {
  report: ReportRow;
  onBack: () => void;
  onRefreshReport: () => void;
}

function getInitials(name?: string): string {
  if (!name) return 'PT';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

/** Accurate labels for core questions; adaptive questions are shown by their stable id. */
const QUESTION_LABELS: Record<string, string> = {
  greeting: 'Greeting',
  name: 'Name',
  age: 'Age',
  gender: 'Gender',
  primary_concern: 'Primary concern',
  duration: 'Duration',
  severity: 'Severity',
  conditions: 'Existing conditions',
  medications: 'Medications',
  allergies: 'Allergies',
  other_symptoms: 'Other symptoms',
  emergency_clarification: 'Emergency clarification',
};

function questionLabel(questionId: string | null): string {
  if (!questionId) return 'Question';
  return QUESTION_LABELS[questionId] ?? `Adaptive question ${questionId}`;
}

export const DoctorReportDetail: React.FC<DoctorReportDetailProps> = ({
  report,
  onBack,
  onRefreshReport,
}) => {
  const [isMarking, setIsMarking] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isConversationExpanded, setIsConversationExpanded] = useState(false);
  const [conversation, setConversation] = useState<DoctorConversationMessage[]>([]);
  const [conversationStatus, setConversationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [conversationAttempt, setConversationAttempt] = useState(0);

  useEffect(() => {
    // A different report must never show the previous patient's answers.
    setIsConversationExpanded(false);
    setConversation([]);
    setConversationStatus('idle');
    setConversationError(null);
    setConversationAttempt(0);
  }, [report.id]);

  useEffect(() => {
    if (!isConversationExpanded) return;
    let cancelled = false;
    setConversationStatus('loading');
    setConversationError(null);

    getDoctorMessages(report.id)
      .then((rows) => {
        if (cancelled) return;
        setConversation(rows);
        setConversationStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setConversation([]);
        setConversationStatus('error');
        setConversationError('Patient responses could not be loaded.');
      });

    return () => {
      cancelled = true;
    };
  }, [isConversationExpanded, report.id, conversationAttempt]);

  const patientAnswers = conversation.filter((message) => message.role === 'patient');

  const isReviewed = Boolean(report.reviewed_at);

  const handleMarkReviewed = async () => {
    if (isMarking || isReviewed) return;
    setIsMarking(true);
    setReviewError(null);
    try {
      await markReportReviewed(report.id);
      onRefreshReport();
    } catch (err: any) {
      setReviewError(err?.message || 'Failed to mark report reviewed');
    } finally {
      setIsMarking(false);
    }
  };

  const patient = report.report.patient;
  const clinical = report.report.clinical_details;
  const routing = report.report.routing_snapshot;
  const patientName = patient.name.value || 'Anonymous Patient';
  const patientAge = patient.age.value ? `${patient.age.value} years` : 'Age unstated';
  const patientGender = patient.gender.value || 'Gender unstated';

  // Format conditions, meds, allergies
  const formatList = (val?: string[] | null) => {
    if (!val || val.length === 0) return 'None reported';
    return val.join(', ');
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Status Bar matching Figma D4 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="size-9 rounded-full bg-white/70 border border-white text-[#1f2a44] flex items-center justify-center hover:bg-white transition-all shadow-sm"
            aria-label="Back to Reports"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-[25px] font-bold text-[#1d2433] tracking-tight">
              Patient Report
            </h1>
            <p className="text-[11px] text-[#4a5470] mt-0.5">
              {report.intake_reference} · Submitted{' '}
              {new Date(report.created_at).toLocaleString('en-US', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        {/* Source & Review status chips */}
        <div className="flex items-center gap-2">
          <div className="h-[28px] px-3.5 rounded-full bg-[#e1ebfd] text-[#284c91] text-[10px] font-semibold flex items-center justify-center">
            Voice · English
          </div>
          {isReviewed ? (
            <div className="h-[28px] px-3.5 rounded-full bg-[#dcf3e6] text-[#176a3b] text-[10px] font-semibold flex items-center justify-center">
              Reviewed
            </div>
          ) : (
            <div className="h-[28px] px-3.5 rounded-full bg-[#e4e8f2] text-[#3a4468] text-[10px] font-semibold flex items-center justify-center">
              Pending review
            </div>
          )}
        </div>
      </div>

      {/* Review Error Alert */}
      {reviewError && (
        <div className="p-4 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-medium flex items-center gap-2">
          <svg className="w-4 h-4 text-red-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{reviewError}</span>
        </div>
      )}

      {/* Patient Banner Card matching Figma 82:268 */}
      <div className="rounded-[19px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-[40px] rounded-full bg-[#e4e8f2] border border-white text-[#1f2a44] font-semibold text-[11px] flex items-center justify-center shrink-0">
            {getInitials(patientName)}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
              Clinical Intake Summary
            </span>
            <h2 className="text-[14px] font-bold text-[#1d2433] leading-snug">
              {patientName}
            </h2>
            <p className="text-[10px] text-[#4a5470]">
              {patientAge} · {patientGender}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-[29px] px-3.5 rounded-full bg-[#e1ebfd] text-[#284c91] text-[10px] font-semibold flex items-center justify-center">
            {routing.department_name} (preliminary)
          </div>
          <div className="h-[29px] px-3.5 rounded-full bg-[#dcf3e6] text-[#176a3b] text-[10px] font-semibold flex items-center justify-center">
            {report.status === 'submitted' ? 'Submitted' : report.status}
          </div>
        </div>
      </div>

      {/* Two-column layout matching Figma 82:277 (details) & 82:278 (summary) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column: Clinical Details Card */}
        <div className="rounded-[22px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] space-y-4">
          <div>
            <p className="text-[13px] font-semibold text-[#1d2433]">
              Primary concern: <span className="font-normal text-[#4a5470]">{report.report.primary_concern.value || 'Not provided'}</span>
            </p>
            <p className="text-[12px] text-[#4a5470] mt-1">
              Reported symptoms: {clinical.duration.value ? `${clinical.duration.value}` : ''}
              {clinical.severity.value ? `, ${clinical.severity.value}` : ''}
              {clinical.other_symptoms.value?.length ? `, ${clinical.other_symptoms.value.join(', ')}` : ''}
            </p>
          </div>

          <div className="border-b border-[#dde3ee]/80" />

          {/* Relevant history */}
          <div>
            <h3 className="text-[13px] font-bold text-[#1d2433] mb-2.5">
              Relevant history
            </h3>
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-[#4a5470]">Conditions</span>
                <span className="px-3 py-0.5 rounded-full bg-[#e4e8f2] text-[#3a4468] font-semibold text-[10px]">
                  {formatList(clinical.conditions.value)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#4a5470]">Medications</span>
                <span className="px-3 py-0.5 rounded-full bg-[#e4e8f2] text-[#3a4468] font-semibold text-[10px]">
                  {formatList(clinical.medications.value)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#4a5470]">Allergies</span>
                <span className="px-3 py-0.5 rounded-full bg-[#e4e8f2] text-[#3a4468] font-semibold text-[10px]">
                  {formatList(clinical.allergies.value)}
                </span>
              </div>
            </div>
          </div>

          <div className="border-b border-[#dde3ee]/80" />

          {/* Missing info */}
          <div>
            <h3 className="text-[13px] font-bold text-[#1d2433] mb-1">
              Missing information
            </h3>
            <p className="text-[11px] text-[#4a5470]">
              {[
                !clinical.conditions.value && 'Existing conditions',
                !clinical.medications.value && 'medications',
                !clinical.allergies.value && 'allergies',
              ]
                .filter(Boolean)
                .join(', ') || 'None'}
            </p>
          </div>

          {/* Warning flags */}
          <div>
            <h3 className="text-[12px] font-bold text-[#1d2433] mb-1">
              Warning flags
            </h3>
            <p className="text-[11px] text-[#4a5470]">
              None
            </p>
          </div>

          {/* Preliminary routing */}
          <div>
            <h3 className="text-[12px] font-bold text-[#1d2433] mb-1">
              Preliminary routing
            </h3>
            <p className="text-[11px] text-[#4a5470]">
              {routing.department_name} · {routing.doctor_name}
            </p>
          </div>

          {/* Appointment */}
          <div>
            <h3 className="text-[12px] font-bold text-[#1d2433] mb-1">
              Appointment
            </h3>
            <p className="text-[11px] text-[#4a5470]">
              {report.status === 'submitted' ? 'Routine slot pending patient confirmation' : 'Confirmed'}
            </p>
          </div>
        </div>

        {/* Right Column: AI Summary & Actions Card */}
        <div className="rounded-[22px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-[15px] font-bold text-[#1d2433]">
                AI-organized summary
              </h3>
              <p className="text-[10px] text-[#4a5470] mt-0.5">
                AI-generated from patient-reported information. Not a diagnosis.
              </p>
            </div>

            {/* Summary text card */}
            <div className="rounded-[16px] bg-[rgba(255,255,255,0.65)] backdrop-blur-[6px] border border-white p-4 shadow-sm">
              <p className="text-[12px] text-[#1d2433] leading-relaxed">
                {report.report.summary?.text ||
                  `Patient reports ${report.report.primary_concern.value || 'symptoms'}, duration ${clinical.duration.value || 'unspecified'}.`}
              </p>
            </div>

            {/* Compact informational note */}
            <div className="p-3.5 rounded-[14px] bg-[#e1ebfd]/60 border border-white text-xs text-[#1f2a44] flex items-start gap-2.5 shadow-sm">
              <svg className="w-4 h-4 text-[#1f2a44] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="leading-relaxed text-[11px]">
                Some intake responses may be available only in the conversation history and may not appear in the structured report.
              </p>
            </div>

            {/* Stored patient answers from the intake conversation */}
            <div className="rounded-[16px] bg-[rgba(255,255,255,0.65)] backdrop-blur-[6px] border border-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => setIsConversationExpanded((expanded) => !expanded)}
                aria-expanded={isConversationExpanded}
                className="w-full flex items-center justify-between text-left focus:outline-none"
              >
                <span className="text-[13px] font-bold text-[#1d2433]">
                  Patient responses
                </span>
                <span className="text-[11px] font-semibold text-[#1f2a44]">
                  {isConversationExpanded
                    ? 'Collapse ▲'
                    : `${conversationStatus === 'ready' ? `${patientAnswers.length} recorded · ` : ''}Expand ▼`}
                </span>
              </button>

              {isConversationExpanded && (
                <div className="mt-3 pt-3 border-t border-[#dde3ee] space-y-2.5 text-[11px] text-[#4a5470]">
                  {(conversationStatus === 'loading' || conversationStatus === 'idle') && (
                    <div role="status" aria-live="polite" className="flex items-center gap-2 py-2">
                      <span className="w-2 h-2 rounded-full bg-[#284c91] animate-ping" />
                      <span>Loading patient responses…</span>
                    </div>
                  )}

                  {conversationStatus === 'error' && (
                    <div role="alert" className="rounded-[12px] bg-red-50 border border-red-200 p-3 text-red-900">
                      <p>{conversationError}</p>
                      <button
                        type="button"
                        onClick={() => setConversationAttempt((attempt) => attempt + 1)}
                        className="mt-2 text-[11px] font-semibold underline focus:outline-none"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {conversationStatus === 'ready' && patientAnswers.length === 0 && (
                    <p className="py-2">No patient responses were recorded for this intake.</p>
                  )}

                  {conversationStatus === 'ready' &&
                    patientAnswers.map((answer, index) => {
                      const finalText = answer.final_text?.trim() ?? '';
                      const originalText = answer.original_text?.trim() ?? '';
                      const showsOriginal = originalText.length > 0 && originalText !== finalText;
                      const answerNumber = answer.turn_index ?? index + 1;

                      return (
                        <div
                          key={answer.id}
                          className="rounded-[12px] bg-white/70 border border-[#dde3ee]/70 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#284c91]">
                              {questionLabel(answer.question_id)}
                            </span>
                            <span className="flex items-center gap-2 text-[10px] text-[#6b7590]">
                              {answer.input_mode === 'voice' && (
                                <span className="px-2 py-0.5 rounded-full bg-[#e1ebfd] text-[#284c91] font-semibold">
                                  Voice
                                </span>
                              )}
                              <span>Answer {answerNumber}</span>
                            </span>
                          </div>

                          {showsOriginal ? (
                            <>
                              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7590]">
                                Voice transcript
                              </p>
                              <p className="mt-0.5 text-[11px] italic text-[#4a5470]">
                                “{originalText}”
                              </p>
                              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7590]">
                                Confirmed answer
                              </p>
                              <p className="mt-0.5 text-[12px] text-[#1d2433]">
                                {finalText || 'Not recorded'}
                              </p>
                            </>
                          ) : (
                            <p className="mt-1 text-[12px] text-[#1d2433]">
                              {finalText || 'Not recorded'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Mark Reviewed Action Button matching Figma 82:310 */}
          <div>
            {isReviewed ? (
              <div className="h-[48px] rounded-[22px] bg-[#dcf3e6] border border-emerald-200 text-[#176a3b] font-semibold text-[13px] flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Reviewed by Dr. Aditi Rao</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleMarkReviewed}
                disabled={isMarking}
                className="w-full h-[48px] rounded-[22px] bg-[#1f2a44] text-white font-semibold text-[13px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.18)] hover:bg-[#2b3a5d] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isMarking ? 'Marking...' : 'Mark Reviewed'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
