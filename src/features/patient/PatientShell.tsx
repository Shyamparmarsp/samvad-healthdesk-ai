import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import {
  startSession,
  resumeSession,
  recordConsent,
  chatTurn,
  correctDraftReport,
  submitReport,
  bookAppointment,
  speak,
} from '../../lib/api';
import { ChatTurnResponse } from '../../types/api';
import { CorrectableField, ReportDocumentV1, ReportRow } from '../../types/report';
import { Appointment } from '../../types/doctor';
import { CONSENT_VERSION } from '../../types/consent';
import { captureVoiceAnswer } from '../../lib/audio/voice';

import { WelcomeView } from './WelcomeView';
import { ConsentView } from './ConsentView';
import { ConsentDeclinedView } from './ConsentDeclinedView';
import { ConversationView } from './ConversationView';
import { WhatWeHeardView } from './WhatWeHeardView';
import { ReportReviewView } from './ReportReviewView';
import { BookingView } from './BookingView';
import { ConfirmationView } from './ConfirmationView';
import { EmergencyView } from './EmergencyView';
import { SessionEndedView } from './SessionEndedView';

type PatientScreen =
  | 'welcome'
  | 'consent'
  | 'consent_declined'
  | 'conversation'
  | 'what_we_heard'
  | 'review'
  | 'session_ended'
  | 'booking'
  | 'confirmed_booking'
  | 'confirmed_report_only'
  | 'emergency';

function sanitizeUserError(err: any): string {
  if (!err) return 'An unexpected error occurred. Please try again.';
  const msg = typeof err === 'string' ? err : err.message || '';
  if (/demo_busy/i.test(msg)) {
    return 'The hospital intake desk has reached its daily limit. Please consult hospital reception.';
  }
  if (/network|fetch|offline|failed to fetch|load failed/i.test(msg)) {
    return 'Unable to reach the hospital server. Please check your internet connection.';
  }
  if (/auth_failed|jwt|token|unauthorized/i.test(msg)) {
    return 'Session expired. Please restart your intake.';
  }
  if (/provider_unavailable/i.test(msg)) {
    return 'Voice transcription is unavailable right now. Please type your answer instead.';
  }
  if (/sqlstate|pgrst|relation|schema|table|column|database/i.test(msg)) {
    return 'A hospital service error occurred. Please ask front desk staff for assistance.';
  }
  return msg || 'An unexpected error occurred. Please try again.';
}

export const PatientShell: React.FC = () => {
  const { language } = useI18n();

  const [currentScreen, setCurrentScreen] = useState<PatientScreen>('welcome');
  const [sessionId, setSessionId] = useState<string>('');
  const [chatState, setChatState] = useState<ChatTurnResponse | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | undefined>(undefined);
  const [endReason, setEndReason] = useState<'dont_submit' | 'incomplete_cap'>('dont_submit');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resume after interruption (sessionStorage check on mount)
  useEffect(() => {
    try {
      const savedSessionId = sessionStorage.getItem('samvad_session_id');
      if (!savedSessionId) return;

      let cancelled = false;
      (async () => {
        try {
          const res = await resumeSession(savedSessionId);
          if (cancelled) return;
          setSessionId(res.session_id);
          setChatState(res);

          if (res.emergency_triggered) {
            setCurrentScreen('emergency');
          } else if (res.is_complete || (res.is_cap_reached && res.draft_report)) {
            setCurrentScreen('review');
          } else if (res.session_status === 'declined') {
            setCurrentScreen('consent_declined');
          } else if (res.session_status === 'in_progress' || res.current_question) {
            setCurrentScreen('conversation');
          } else if (res.session_status === 'ended') {
            sessionStorage.removeItem('samvad_session_id');
            setCurrentScreen('welcome');
          }
        } catch {
          sessionStorage.removeItem('samvad_session_id');
        }
      })();

      return () => {
        cancelled = true;
      };
    } catch {
      // Ignore storage access restrictions if any
    }
  }, []);

  // 1. Start talking / typing from welcome screen
  const handleStartIntake = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await startSession(language);
      setSessionId(res.session_id);
      setChatState(res);
      try {
        sessionStorage.setItem('samvad_session_id', res.session_id);
      } catch {}
      setCurrentScreen('consent');
    } catch (err: any) {
      console.error('Failed to start session', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Consent decisions (passes versioned consent constant CONSENT_VERSION)
  const handleConsentAgree = async () => {
    if (!sessionId) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await recordConsent(sessionId, true, language, CONSENT_VERSION);
      setChatState(res);
      setCurrentScreen('conversation');
    } catch (err: any) {
      console.error('Failed to record consent', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConsentDecline = async () => {
    if (!sessionId) return;
    setErrorMessage(null);
    try {
      await recordConsent(sessionId, false, language, CONSENT_VERSION);
      try {
        sessionStorage.removeItem('samvad_session_id');
      } catch {}
      setCurrentScreen('consent_declined');
    } catch (err: any) {
      console.error('Failed to decline consent', err);
      setErrorMessage(sanitizeUserError(err));
    }
  };

  // 3. Submitting text answer
  const handleSendAnswer = async (text: string) => {
    if (!sessionId || !chatState?.current_question) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await chatTurn({
        action: 'submit_turn',
        session_id: sessionId,
        text,
        question_id: chatState.current_question.id,
      });
      setChatState(res);

      if (res.emergency_triggered) {
        setCurrentScreen('emergency');
      } else if (res.is_complete || (res.is_cap_reached && res.draft_report)) {
        setCurrentScreen('review');
      }
    } catch (err: any) {
      console.error('Error submitting turn', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Voice turn: capture a contract-valid WAV, let the backend transcribe it, then
  // show the transcript for confirmation. Never fabricate a transcript locally: if the
  // provider is unavailable the error banner offers text instead.
  const handleVoiceRecorded = async (_simulatedTranscript?: string) => {
    if (!sessionId || !chatState?.current_question) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const voice = await captureVoiceAnswer();
      const res = await chatTurn({
        action: 'submit_turn',
        session_id: sessionId,
        question_id: chatState.current_question.id,
        audio_base64: voice.audio_base64,
        audio_format: voice.audio_format,
      });
      setChatState(res);

      if (res.transcript_preview) {
        setPendingTranscript(res.transcript_preview.text);
        setCurrentScreen('what_we_heard');
      } else if (res.error) {
        setErrorMessage(
          res.error === 'provider_unavailable'
            ? 'Voice transcription is unavailable right now. Please type your answer instead.'
            : `Voice step failed (${res.error}). Please type your answer instead.`,
        );
      }
    } catch (err: any) {
      console.error('Error submitting voice turn', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmTranscript = async (confirmedText: string) => {
    setCurrentScreen('conversation');
    await handleSendAnswer(confirmedText);
  };

  // Audio playback management for question audio replay (D-19 verification)
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleReplayAudio = async () => {
    if (!sessionId || !chatState?.current_question) return;
    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }

      const res = await speak(sessionId, chatState.current_question.id);
      if (res.audioUrl) {
        const audio = new Audio(res.audioUrl);
        activeAudioRef.current = audio;
        audio.onended = () => {
          if (res.audioUrl) URL.revokeObjectURL(res.audioUrl);
          if (activeAudioRef.current === audio) activeAudioRef.current = null;
        };
        audio.onerror = () => {
          if (res.audioUrl) URL.revokeObjectURL(res.audioUrl);
          if (activeAudioRef.current === audio) activeAudioRef.current = null;
        };
        await audio.play().catch((err) => {
          console.warn('Audio playback failed or was blocked by browser autoplay policy', err);
        });
      }
    } catch (err) {
      console.warn('Replay audio request failed', err);
    }
  };

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, [currentScreen]);

  // 5. Report corrections
  const handleCorrectField = async (
    field: CorrectableField,
    patch: { value: any; status: 'provided' | 'declined' },
  ) => {
    if (!sessionId) return;
    setErrorMessage(null);
    const activeReportId = chatState?.submitted_report?.id || '';
    try {
      const res = await correctDraftReport({
        action: 'correct_draft_report',
        session_id: sessionId,
        report_id: activeReportId,
        updates: { [field]: patch },
      });
      setChatState(res);
    } catch (err: any) {
      console.error('Failed to update field', err);
      setErrorMessage(sanitizeUserError(err));
    }
  };

  // 6. Submit report to hospital
  const handleSubmitReport = async () => {
    if (!sessionId) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const activeReportId = chatState?.submitted_report?.id || '';
    try {
      const res = await submitReport({
        action: 'submit_report',
        session_id: sessionId,
        report_id: activeReportId,
      });
      setChatState(res);
      setCurrentScreen('booking');
    } catch (err: any) {
      console.error('Failed to submit report', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // 7. "Don't submit" option
  const handleDontSubmit = () => {
    try {
      sessionStorage.removeItem('samvad_session_id');
    } catch {}
    setEndReason('dont_submit');
    setCurrentScreen('session_ended');
  };

  // 8. Incomplete cap end action
  const handleEndSessionCap = () => {
    try {
      sessionStorage.removeItem('samvad_session_id');
    } catch {}
    setEndReason('incomplete_cap');
    setCurrentScreen('session_ended');
  };

  // 9. Book appointment
  const handleBookAppointment = async (slotId: string) => {
    if (!chatState?.submitted_report) return;
    const res = await bookAppointment({
      report_id: chatState.submitted_report.id,
      slot_id: slotId,
      slot_start: slotId,
      doctor_id: chatState.submitted_report.doctor_id,
      patient_name: chatState.submitted_report.report.patient.name.value || undefined,
    });
    setActiveAppointment(res.appointment);
    try {
      sessionStorage.removeItem('samvad_session_id');
    } catch {}
    setCurrentScreen('confirmed_booking');
  };

  // 10. "Not now" booking path
  const handleNotNowBooking = () => {
    try {
      sessionStorage.removeItem('samvad_session_id');
    } catch {}
    setCurrentScreen('confirmed_report_only');
  };

  // 11. Restart session
  const handleRestart = () => {
    try {
      sessionStorage.removeItem('samvad_session_id');
    } catch {}
    setSessionId('');
    setChatState(null);
    setActiveAppointment(undefined);
    setErrorMessage(null);
    setCurrentScreen('welcome');
  };

  return (
    <div className="w-full flex justify-center py-4 sm:py-8">
      {/* Mobile Frame Container (390 x 844 viewport matching Figma V2) */}
      <div className="w-full max-w-[390px] h-[844px] bg-white rounded-[36px] shadow-2xl border-4 border-slate-700/10 overflow-hidden flex flex-col relative">
        {/* Accessible Error / Network Alert Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="absolute top-3 left-4 right-4 z-50 p-3 rounded-2xl bg-red-600 text-white text-xs font-semibold shadow-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="leading-tight">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              aria-label="Dismiss error notification"
              className="ml-2 text-white/80 hover:text-white font-bold p-1 rounded-full hover:bg-white/20 transition-colors"
            >
              ✕
            </button>
          </div>
        )}
        {currentScreen === 'welcome' && (
          <WelcomeView
            onStartTalking={handleStartIntake}
            onTypeInstead={handleStartIntake}
          />
        )}

        {currentScreen === 'consent' && (
          <ConsentView
            onAgree={handleConsentAgree}
            onDecline={handleConsentDecline}
          />
        )}

        {currentScreen === 'consent_declined' && (
          <ConsentDeclinedView onRestart={handleRestart} />
        )}

        {currentScreen === 'conversation' && (
          <ConversationView
            messages={chatState?.messages || []}
            currentQuestion={chatState?.current_question}
            turnCount={chatState?.turn_count || 0}
            maxTurns={chatState?.max_turns || 15}
            demoBusy={chatState?.demo_busy}
            onSendText={handleSendAnswer}
            onVoiceTranscribed={handleVoiceRecorded}
            onReplayAudio={handleReplayAudio}
            isProcessing={isProcessing}
          />
        )}

        {currentScreen === 'what_we_heard' && (
          <WhatWeHeardView
            initialTranscript={pendingTranscript}
            onConfirm={handleConfirmTranscript}
            onCancel={() => setCurrentScreen('conversation')}
          />
        )}

        {currentScreen === 'review' && chatState?.draft_report && (
          <ReportReviewView
            report={chatState.draft_report as ReportDocumentV1}
            isCapReached={chatState.is_cap_reached}
            canSubmit={chatState.can_submit}
            onCorrectField={handleCorrectField}
            onSubmit={handleSubmitReport}
            onDontSubmit={handleDontSubmit}
            onEndSessionCap={handleEndSessionCap}
          />
        )}

        {currentScreen === 'session_ended' && (
          <SessionEndedView
            reason={endReason}
            onRestart={handleRestart}
          />
        )}

        {currentScreen === 'booking' && chatState?.submitted_report && (
          <BookingView
            report={chatState.submitted_report as ReportRow}
            onBookAppointment={handleBookAppointment}
            onNotNow={handleNotNowBooking}
          />
        )}

        {currentScreen === 'confirmed_booking' && chatState?.submitted_report && (
          <ConfirmationView
            type="appointment"
            report={chatState.submitted_report as ReportRow}
            appointment={activeAppointment}
            onHome={handleRestart}
          />
        )}

        {currentScreen === 'confirmed_report_only' && chatState?.submitted_report && (
          <ConfirmationView
            type="report_only"
            report={chatState.submitted_report as ReportRow}
            onHome={handleRestart}
          />
        )}

        {currentScreen === 'emergency' && (
          <EmergencyView onEndDemo={handleRestart} />
        )}
      </div>
    </div>
  );
};
