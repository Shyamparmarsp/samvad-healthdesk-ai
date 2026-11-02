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
import { captureVoiceAnswer, type VoiceAnswer } from '../../lib/audio/voice';
import {
  cachedPromptSources,
  createPromptAudioCache,
  promptIdForQuestion,
} from '../../lib/audio/prompt-audio';
import { PatientScreen, resolveBackNavigation, reviewModeFor } from '../../lib/navigation';

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
  const { language, t } = useI18n();

  const [currentScreen, setCurrentScreen] = useState<PatientScreen>('welcome');
  const [screenHistory, setScreenHistory] = useState<PatientScreen[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [chatState, setChatState] = useState<ChatTurnResponse | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | undefined>(undefined);
  const [endReason, setEndReason] = useState<'dont_submit' | 'incomplete_cap'>('dont_submit');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // D-04: the global daily cap is a distinct state, not a silent no-op consent screen.
  const [demoBusy, setDemoBusy] = useState<boolean>(false);

  /** Session-scoped TTS cache: replaying an adaptive question never re-buys it (D-06). */
  const audioCacheRef = useRef(createPromptAudioCache());
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const navigateToScreen = (nextScreen: PatientScreen) => {
    if (nextScreen !== currentScreen) {
      setScreenHistory((prev) => [...prev, currentScreen]);
      setCurrentScreen(nextScreen);
    }
  };

  /**
   * D-02 / D-10: Back is blocked on terminal screens (emergency, confirmations,
   * ended/declined). The screen components also no longer receive an `onBack` handler
   * for those states, so this is defence in depth.
   */
  const handleBack = () => {
    const decision = resolveBackNavigation({
      currentScreen,
      history: screenHistory,
      hasSubmittedReport: Boolean(chatState?.submitted_report),
      hasAppointment: Boolean(activeAppointment),
    });
    if (decision.action !== 'navigate') return;
    setScreenHistory((prev) => prev.slice(0, -1));
    setCurrentScreen(decision.target);
  };

  // Resume after interruption. Fixture routing is development-only (D-08).
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
          // D-23: say that the session could not be restored instead of silently
          // dropping the patient on Welcome with no explanation.
          if (cancelled) return;
          try {
            sessionStorage.removeItem('samvad_session_id');
          } catch {}
          setErrorMessage(t.chat.restoreFailed);
          setCurrentScreen('welcome');
        }
      })();

      return () => {
        cancelled = true;
      };
    } catch {
      // Ignore storage access restrictions if any.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rememberSession = (id: string) => {
    try {
      sessionStorage.setItem('samvad_session_id', id);
    } catch {}
  };

  const forgetSession = () => {
    try {
      sessionStorage.removeItem('samvad_session_id');
    } catch {}
  };

  // 1. Start talking / typing from welcome screen
  const handleStartIntake = async () => {
    if (isProcessing) return; // never create two sessions from a double click
    setIsProcessing(true);
    setErrorMessage(null);
    setDemoBusy(false);
    setScreenHistory([]);
    try {
      const res = await startSession(language);
      if (res.demo_busy || !res.session_id) {
        // D-04: stay on Welcome with an understandable message and a retry path.
        setDemoBusy(true);
        setChatState(res);
        setSessionId('');
        return;
      }
      setSessionId(res.session_id);
      setChatState(res);
      rememberSession(res.session_id);
      navigateToScreen('consent');
    } catch (err: any) {
      if (err?.code === 'demo_busy' || /demo_busy/i.test(String(err?.message))) {
        setDemoBusy(true);
        return;
      }
      console.error('Failed to start session', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Consent decisions (passes versioned consent constant CONSENT_VERSION)
  const handleConsentAgree = async () => {
    if (isProcessing) return;
    if (!sessionId) {
      setErrorMessage(t.consent.sessionUnavailable);
      return;
    }

    // D-11: do not re-issue record_consent for a session that already consented.
    if (
      chatState &&
      (chatState.session_status === 'in_progress' ||
        chatState.session_status === 'consented' ||
        chatState.messages.length > 0)
    ) {
      navigateToScreen('conversation');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await recordConsent(sessionId, true, language, CONSENT_VERSION);
      setChatState(res);
      navigateToScreen('conversation');
    } catch (err: any) {
      // An already-consented session is not an error the patient must resolve.
      if (err?.code === 'invalid_state') {
        navigateToScreen('conversation');
        return;
      }
      console.error('Failed to record consent', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConsentDecline = async () => {
    if (isProcessing) return;
    if (!sessionId) {
      setErrorMessage(t.consent.sessionUnavailable);
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await recordConsent(sessionId, false, language, CONSENT_VERSION);
      forgetSession();
      navigateToScreen('consent_declined');
    } catch (err: any) {
      console.error('Failed to decline consent', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Submitting text answer
  const handleSendAnswer = async (
    text: string,
    origin: 'conversation' | 'transcript' = 'conversation',
  ): Promise<boolean> => {
    if (!sessionId) {
      setErrorMessage(t.consent.sessionUnavailable);
      return false;
    }
    // An emergency session never accepts another routine answer.
    if (chatState?.session_status === 'emergency') {
      navigateToScreen('emergency');
      return false;
    }
    if (!chatState?.current_question) return false;

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

      if (res.emergency_triggered || res.session_status === 'emergency') {
        navigateToScreen('emergency');
      } else if (res.is_complete || (res.is_cap_reached && res.draft_report)) {
        navigateToScreen('review');
      } else if (origin === 'transcript') {
        navigateToScreen('conversation');
      }
      return true;
    } catch (err: any) {
      console.error('Error submitting turn', err);
      setErrorMessage(sanitizeUserError(err));
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Voice turn: capture a contract-valid WAV, let the backend transcribe it, then
  // show the transcript for confirmation. Never fabricate a transcript locally.
  const handleVoiceRecorded = async (voicePayload: VoiceAnswer | string) => {
    if (!sessionId || !chatState?.current_question) return;
    if (chatState.session_status === 'emergency') {
      navigateToScreen('emergency');
      return;
    }

    // D-40: a string payload used to re-open the microphone with no user gesture.
    // It is not a confirmed answer, so it is reported instead of being sent.
    if (typeof voicePayload === 'string') {
      setErrorMessage(t.chat.recordingFailed);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const voice: VoiceAnswer =
        voicePayload && typeof voicePayload === 'object' && 'audio_base64' in voicePayload
          ? voicePayload
          : await captureVoiceAnswer();
      const res = await chatTurn({
        action: 'submit_turn',
        session_id: sessionId,
        question_id: chatState.current_question.id,
        audio_base64: voice.audio_base64,
        audio_format: voice.audio_format,
      });
      setChatState(res);

      if (res.emergency_triggered || res.session_status === 'emergency') {
        navigateToScreen('emergency');
      } else if (res.transcript_preview) {
        setPendingTranscript(res.transcript_preview.text);
        navigateToScreen('what_we_heard');
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

  // D-41: navigate only after the confirmed answer was actually accepted.
  const handleConfirmTranscript = async (confirmedText: string) => {
    const accepted = await handleSendAnswer(confirmedText, 'transcript');
    if (accepted) setPendingTranscript('');
  };

  const stopActiveAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
  };

  /** Try static candidates in order and play the first one that decodes. */
  const playFirstAvailable = async (urls: string[]): Promise<boolean> => {
    for (const url of urls) {
      stopActiveAudio();
      const audio = new Audio(url);
      activeAudioRef.current = audio;
      audio.onended = () => {
        if (activeAudioRef.current === audio) activeAudioRef.current = null;
      };
      try {
        await audio.play();
        return true;
      } catch {
        // Try the next candidate.
      }
    }
    stopActiveAudio();
    return false;
  };

  const playUrl = async (url: string, onFailure: () => void) => {
    stopActiveAudio();
    const audio = new Audio(url);
    activeAudioRef.current = audio;
    audio.onended = () => {
      if (activeAudioRef.current === audio) activeAudioRef.current = null;
    };
    audio.onerror = () => {
      if (activeAudioRef.current === audio) activeAudioRef.current = null;
      onFailure();
    };
    try {
      await audio.play();
    } catch {
      onFailure();
    }
  };

  /**
   * D-06: fixed prompts are served from `public/audio` (no provider call), and adaptive
   * prompts are fetched at most once per session and then replayed from the cache.
   */
  const handleReplayAudio = async () => {
    const question = chatState?.current_question;
    if (!sessionId || !question) return;

    const questionId = String(question.id);
    const promptId = promptIdForQuestion(questionId);

    if (promptId) {
      const played = await playFirstAvailable(cachedPromptSources(language, promptId));
      if (!played) setErrorMessage(t.chat.audioUnavailable);
      return;
    }

    const cached = audioCacheRef.current.get(language, questionId);
    if (cached) {
      await playUrl(cached, () => setErrorMessage(t.chat.audioUnavailable));
      return;
    }

    try {
      const res = await speak(sessionId, questionId);
      if (res.audioUrl) {
        audioCacheRef.current.set(language, questionId, res.audioUrl);
        await playUrl(res.audioUrl, () => setErrorMessage(t.chat.audioUnavailable));
      } else {
        setErrorMessage(t.chat.audioUnavailable);
      }
    } catch (err) {
      console.warn('Replay audio request failed', err);
      setErrorMessage(t.chat.audioUnavailable);
    }
  };

  useEffect(() => {
    return () => {
      stopActiveAudio();
    };
  }, [currentScreen]);

  useEffect(() => {
    return () => {
      audioCacheRef.current.clear();
    };
  }, []);

  // 5. Report corrections
  const handleCorrectField = async (
    field: CorrectableField,
    patch: { value: any; status: 'provided' | 'declined' },
  ) => {
    if (!sessionId) return;
    setErrorMessage(null);
    try {
      const res = await correctDraftReport({
        action: 'correct_draft_report',
        session_id: sessionId,
        report_id: '',
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
    if (!sessionId || isProcessing) return;
    if (chatState?.submitted_report) {
      navigateToScreen('booking');
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await submitReport({
        action: 'submit_report',
        session_id: sessionId,
        report_id: '',
      });
      setChatState(res);
      navigateToScreen('booking');
    } catch (err: any) {
      console.error('Failed to submit report', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // 7. "Don't submit" option
  const handleDontSubmit = () => {
    forgetSession();
    setEndReason('dont_submit');
    navigateToScreen('session_ended');
  };

  // 8. Incomplete cap end action
  const handleEndSessionCap = () => {
    forgetSession();
    setEndReason('incomplete_cap');
    navigateToScreen('session_ended');
  };

  // 9. Book appointment. The slot id and the ISO start timestamp are separate values.
  const handleBookAppointment = async (slotId: string, slotStart: string) => {
    if (!chatState?.submitted_report) return;
    if (activeAppointment) {
      navigateToScreen('confirmed_booking');
      return;
    }

    const res = await bookAppointment({
      report_id: chatState.submitted_report.id,
      slot_id: slotId,
      slot_start: slotStart,
      doctor_id: chatState.submitted_report.doctor_id,
      patient_name: chatState.submitted_report.report.patient.name.value || undefined,
    });
    setActiveAppointment(res.appointment);
    forgetSession();
    navigateToScreen('confirmed_booking');
  };

  // 10. "Not now" booking path
  const handleNotNowBooking = () => {
    forgetSession();
    navigateToScreen('confirmed_report_only');
  };

  // 11. Restart session
  const handleRestart = () => {
    forgetSession();
    stopActiveAudio();
    audioCacheRef.current.clear();
    setSessionId('');
    setChatState(null);
    setActiveAppointment(undefined);
    setErrorMessage(null);
    setDemoBusy(false);
    setScreenHistory([]);
    setCurrentScreen('welcome');
  };

  const hasSubmittedReport = Boolean(chatState?.submitted_report);
  const reviewDocument: ReportDocumentV1 | undefined =
    (chatState?.draft_report as ReportDocumentV1 | undefined) ??
    (chatState?.submitted_report?.report as ReportDocumentV1 | undefined);

  return (
    <div className="w-[390px] max-w-[390px] h-[844px] bg-[#dde3ee] relative overflow-hidden flex flex-col select-none">
      {/* Figma Ambient Glow Orbs (81:2 & 81:3) */}
      <div className="absolute w-[260px] h-[310px] left-[215px] top-[580px] rounded-full glow-lilac z-0" aria-hidden="true" />
      <div className="absolute w-[280px] h-[260px] left-[-100px] top-[610px] rounded-full glow-sand z-0" aria-hidden="true" />

      {/* Content Shell Layer */}
      <div className="relative z-10 flex flex-col h-full w-full">
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
            demoBusy={demoBusy}
            isStarting={isProcessing}
          />
        )}

        {currentScreen === 'consent' && (
          <ConsentView
            onAgree={handleConsentAgree}
            onDecline={handleConsentDecline}
            onBack={handleBack}
            disabled={!sessionId || isProcessing || demoBusy}
            disabledMessage={!sessionId || demoBusy ? t.consent.sessionUnavailable : null}
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
            sessionStatus={chatState?.session_status}
            onSendText={handleSendAnswer}
            onVoiceRecorded={handleVoiceRecorded}
            onReplayAudio={handleReplayAudio}
            onBack={handleBack}
            isProcessing={isProcessing}
            onEndSession={handleEndSessionCap}
          />
        )}

        {currentScreen === 'what_we_heard' && (
          <WhatWeHeardView
            initialTranscript={pendingTranscript}
            onConfirm={handleConfirmTranscript}
            onCancel={handleBack}
            onBack={handleBack}
            onReplayQuestion={handleReplayAudio}
            isSubmitting={isProcessing}
          />
        )}

        {currentScreen === 'review' && reviewDocument && (
          <ReportReviewView
            report={reviewDocument}
            isCapReached={chatState?.is_cap_reached}
            canSubmit={hasSubmittedReport ? true : chatState?.can_submit}
            mode={reviewModeFor(hasSubmittedReport)}
            onCorrectField={handleCorrectField}
            onSubmit={handleSubmitReport}
            onDontSubmit={handleDontSubmit}
            onEndSessionCap={handleEndSessionCap}
            onBack={handleBack}
            onContinueBooking={hasSubmittedReport ? () => navigateToScreen('booking') : undefined}
            onFinish={hasSubmittedReport ? handleRestart : undefined}
            isSubmitting={isProcessing}
          />
        )}

        {currentScreen === 'session_ended' && (
          <SessionEndedView reason={endReason} onRestart={handleRestart} />
        )}

        {currentScreen === 'booking' && chatState?.submitted_report && (
          <BookingView
            report={chatState.submitted_report as ReportRow}
            onBookAppointment={handleBookAppointment}
            onNotNow={handleNotNowBooking}
            onBack={handleBack}
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

        {currentScreen === 'emergency' && <EmergencyView onEndDemo={handleRestart} />}
      </div>
    </div>
  );
};
