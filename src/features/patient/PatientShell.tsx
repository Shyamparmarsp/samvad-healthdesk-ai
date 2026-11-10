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
import { PatientScreen, resolveBackNavigation, reviewModeFor } from '../../lib/navigation';
import { useVoiceConversation, type VoiceNotice } from './useVoiceConversation';
import { useSystemSpeech } from './useSystemSpeech';

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
  /** Voice vs text is a shell-level mode: text mode must stop the microphone. */
  const [inputMode, setInputMode] = useState<'voice' | 'text'>(() => {
    try {
      return sessionStorage.getItem('samvad_session_id') &&
        sessionStorage.getItem('samvad_input_mode') === 'text'
        ? 'text'
        : 'voice';
    } catch {
      return 'voice';
    }
  });
  const [pendingVoiceTranscript, setPendingVoiceTranscript] = useState('');
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  /** v1.3: true while the screen shows a partial-report preview (not yet sent). */
  const [partialPreview, setPartialPreview] = useState(false);
  /** Set when the patient leaves: late provider responses must not navigate afterwards. */
  const exitedRef = useRef(false);

  const navigateToScreen = (nextScreen: PatientScreen) => {
    if (nextScreen !== currentScreen) {
      setScreenHistory((prev) => [...prev, currentScreen]);
      setCurrentScreen(nextScreen);
    }
  };

  /** Adaptive prompts are synthesised once per session and then replayed (D-06). */
  const speakAdaptiveQuestion = async (questionId: string): Promise<string | null> => {
    if (!sessionId) return null;
    try {
      const res = await speak(sessionId, questionId);
      return res.audioUrl ?? null;
    } catch {
      return null;
    }
  };

  /** Applies a response produced by the automatic voice loop. */
  const applyVoiceResponse = (res: ChatTurnResponse) => {
    if (exitedRef.current) return;
    setChatState(res);
    if (res.emergency_triggered || res.session_status === 'emergency') {
      navigateToScreen('emergency');
      return;
    }
    if (res.is_complete || (res.is_cap_reached && res.draft_report)) {
      navigateToScreen('review');
    }
  };

  // The loop only runs on an accepted consent: it never records into a `created` session.
  const voiceActive =
    currentScreen === 'conversation' &&
    (chatState?.session_status === 'consented' || chatState?.session_status === 'in_progress');

  const systemSpeech = useSystemSpeech(sessionId, language);

  const voice = useVoiceConversation({
    active: voiceActive,
    sessionId,
    language,
    question: chatState?.current_question
      ? { id: String(chatState.current_question.id), text: chatState.current_question.text }
      : undefined,
    initialTurnCount: chatState?.turn_count ?? 0,
    speakAdaptive: speakAdaptiveQuestion,
    onResponse: applyVoiceResponse,
  });

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
          exitedRef.current = false;
          let savedMode: 'voice' | 'text' = 'voice';
          try {
            savedMode = sessionStorage.getItem('samvad_input_mode') === 'text' ? 'text' : 'voice';
          } catch {}
          setInputMode(savedMode);
          voice.setSuspended(savedMode === 'text');
          setSessionId(res.session_id);
          setChatState(res);

          if (res.emergency_triggered) {
            setCurrentScreen('emergency');
          } else if (res.is_complete || (res.is_cap_reached && res.draft_report)) {
            setCurrentScreen('review');
          } else if (res.session_status === 'declined') {
            setCurrentScreen('consent_declined');
          } else if (res.session_status === 'created') {
            // Consent is never inferred: a restored session that has not answered the
            // consent question returns to the consent screen, not the microphone.
            setCurrentScreen('consent');
          } else if (res.session_status === 'in_progress' || res.current_question) {
            setCurrentScreen('conversation');
          } else if (res.session_status === 'ended') {
            sessionStorage.removeItem('samvad_session_id');
            sessionStorage.removeItem('samvad_input_mode');
            setCurrentScreen('welcome');
          }
        } catch {
          // D-23: say that the session could not be restored instead of silently
          // dropping the patient on Welcome with no explanation.
          if (cancelled) return;
          try {
            sessionStorage.removeItem('samvad_session_id');
            sessionStorage.removeItem('samvad_input_mode');
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

  const rememberInputMode = (mode: 'voice' | 'text') => {
    try {
      sessionStorage.setItem('samvad_input_mode', mode);
    } catch {}
  };

  const forgetSession = () => {
    try {
      sessionStorage.removeItem('samvad_session_id');
      sessionStorage.removeItem('samvad_input_mode');
    } catch {}
  };

  // 1. Start talking / typing from welcome screen. The entry mode is remembered: a patient
  // who chose "Type Instead" must not have the microphone opened for them.
  const handleStartIntake = async (mode: 'voice' | 'text' = 'voice') => {
    if (isProcessing) return; // never create two sessions from a double click
    setInputMode(mode);
    rememberInputMode(mode);
    // Inside the click gesture: unlock playback and ask for the microphone now, so the
    // assistant can speak and record without further taps.
    exitedRef.current = false;
    voice.unlock({ microphone: mode === 'voice' });
    voice.setSuspended(mode === 'text');
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
      // The Yes click is a gesture: unlock audio and, in voice mode, the microphone.
      voice.unlock({ microphone: inputMode === 'voice' });
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
        if (res.current_question) {
          void voice.announce({
            id: String(res.current_question.id),
            text: res.current_question.text,
          });
        }
      } else if (res.current_question) {
        // A typed or chip answer also gets spoken: the assistant keeps the conversation
        // voice-first, and listening resumes only when the patient is in voice mode.
        void voice.announce({
          id: String(res.current_question.id),
          text: res.current_question.text,
        });
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

  // D-41: navigate only after the confirmed answer was actually accepted.
  const handleConfirmTranscript = async (confirmedText: string) => {
    const accepted = await handleSendAnswer(confirmedText, 'transcript');
    if (accepted) setPendingTranscript('');
  };

  /** Voice ↔ text. Text mode keeps the spoken questions but closes the microphone. */
  const handleChangeInputMode = (mode: 'voice' | 'text') => {
    setInputMode(mode);
    rememberInputMode(mode);
    voice.setSuspended(mode === 'text');
  };

  const handleRetryVoice = () => {
    setInputMode('voice');
    setPendingVoiceTranscript('');
    voice.setSuspended(false);
    void voice.retry();
  };

  /**
   * An automatic submission that the backend rejected lands on the existing transcript
   * screen, so the patient can retry (or correct) instead of losing what they said.
   */
  useEffect(() => {
    if (currentScreen !== 'conversation') return;
    if (voice.notice !== 'submit_failed') return;
    const transcript = voice.transcript.trim();
    if (!transcript) return;
    setPendingTranscript(transcript);
    navigateToScreen('what_we_heard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.notice, voice.transcript, currentScreen]);

  /** Leaving the conversation always releases the microphone. */
  useEffect(() => {
    if (currentScreen === 'conversation') return;
    voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen]);

  // Clear the optimistic transcript bubble once the answer is stored by the backend.
  useEffect(() => {
    if (voice.phase === 'listening' || voice.phase === 'assistant_speaking') {
      setPendingVoiceTranscript('');
    }
  }, [voice.phase]);

  useEffect(() => {
    setPendingVoiceTranscript(voice.transcript);
  }, [voice.transcript]);

  /** D-06: replay the current prompt through the same unlocked audio channel. */
  const handleReplayAudio = async () => {
    if (!chatState?.current_question) return;
    await voice.replay();
  };

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

  /**
   * v1.3 early finish. The backend reports the accepted-answer count; the fallback below
   * only exists for mock/offline mode (the backend value always wins).
   */
  const acceptedAnswerCount = (() => {
    if (typeof chatState?.accepted_answer_count === 'number') return chatState.accepted_answer_count;
    const seen = new Set<string>();
    for (const message of chatState?.messages ?? []) {
      if (message.role !== 'patient') continue;
      const questionId = String(message.question_id ?? '');
      if (questionId && (message.content ?? '').trim().length > 0) seen.add(questionId);
    }
    return seen.size;
  })();

  const canFinishPartial =
    (chatState?.can_finish_partial ??
      (acceptedAnswerCount >= 3 && chatState?.session_status !== 'emergency')) &&
    !chatState?.submitted_report;

  /** Patient-initiated Finish & Send (available from the third accepted answer). */
  const handleFinishPartial = async () => {
    if (!sessionId || isProcessing) return;
    if (chatState?.session_status === 'emergency') {
      navigateToScreen('emergency');
      return;
    }
    if (!canFinishPartial) return;
    await openReportReview(chatState?.is_complete ? 'complete' : 'partial');
  };

  /**
   * Automatic completion: the assistant explains that the summary is ready and the report
   * review opens. Triggered by the backend when the question pool is exhausted or the
   * 15-answer cap is reached. Nothing is sent without explicit confirmation.
   */
  const completionHandledRef = useRef<string>('');
  useEffect(() => {
    if (currentScreen !== 'conversation') return;
    if (!chatState) return;
    if (isProcessing) return;
    const answered = chatState.accepted_answer_count ?? 0;
    if (answered < 3) return;
    const finished =
      Boolean(chatState.intake_complete) ||
      chatState.is_cap_reached ||
      chatState.is_complete ||
      // No question left and enough answers: the report is ready even if the flag is absent.
      (!chatState.current_question && answered >= 3);
    if (!finished) return;
    const key = `${sessionId}:${chatState.turn_count}`;
    if (completionHandledRef.current === key) return;
    completionHandledRef.current = key;
    void openReportReview(chatState.is_complete ? 'complete' : 'partial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen, chatState?.intake_complete, chatState?.is_cap_reached, chatState?.is_complete, chatState?.turn_count, isProcessing]);

  /**
   * Stops the voice loop, speaks the completion acknowledgement and opens the report
   * review. Used for intake completion at turn 15, when the question pool is exhausted,
   * and when the patient chooses Finish & Send. Never sends anything by itself.
   */
  const openReportReview = async (mode: 'partial' | 'complete') => {
    if (!sessionId) return;
    voice.stop();
    setPendingVoiceTranscript('');
    void systemSpeech.speak('complete_intake');
    if (mode === 'complete' && chatState?.draft_report) {
      setPartialPreview(false);
      navigateToScreen('review');
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await submitReport({
        action: 'submit_report',
        session_id: sessionId,
        report_id: '',
        partial: true,
        preview: true,
      });
      setChatState((previous) => ({
        ...(previous as ChatTurnResponse),
        ...res,
        messages: res.messages.length > 0 ? res.messages : previous?.messages ?? [],
      }));
      setPartialPreview(true);
      navigateToScreen('review');
    } catch (err: any) {
      // Fewer than three accepted answers cannot produce a report; say so honestly.
      console.error('Failed to build the report preview', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  /** Send the reviewed partial report to the assigned doctor. */
  const handleSendPartialReport = async () => {
    if (!sessionId || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await submitReport({
        action: 'submit_report',
        session_id: sessionId,
        report_id: '',
        partial: true,
      });
      setChatState(res);
      setPartialPreview(false);
      // Only after the backend confirmed the submission.
      void systemSpeech.speak('report_sent');
      navigateToScreen('booking');
    } catch (err: any) {
      console.error('Failed to send the partial report', err);
      setErrorMessage(sanitizeUserError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // The report-section instruction is spoken (and shown) when the review section opens.
  useEffect(() => {
    if (currentScreen !== 'review') return;
    void systemSpeech.speak('report_ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen]);

  /** Return from the preview to the conversation without sending anything. */
  const handleContinueAnswering = () => {
    setPartialPreview(false);
    navigateToScreen('conversation');
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
      void systemSpeech.speak('report_sent');
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

  /**
   * Back/Exit. During an emergency the patient is routed to the 112 guidance instead of a
   * dialog, so the instructions can never be dismissed by an ordinary back action.
   */
  const handleRequestExit = () => {
    if (chatState?.session_status === 'emergency' || chatState?.emergency_triggered) {
      navigateToScreen('emergency');
      return;
    }
    setExitDialogOpen(true);
  };

  const handleCancelExit = () => setExitDialogOpen(false);

  const handleConfirmExit = () => {
    setExitDialogOpen(false);
    exitedRef.current = true;
    // Release every media resource and timer owned by the voice loop.
    voice.stop();
    setPendingVoiceTranscript('');
    setPendingTranscript('');
    // Answers already persisted by chat-turn stay on the server; the browser keeps the
    // session id so the same patient can resume. Nothing is submitted or completed here.
    navigateToScreen('welcome');
  };

  // 11. Restart session
  const handleRestart = () => {
    forgetSession();
    voice.stop();
    setPendingVoiceTranscript('');
    setInputMode('voice');
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

  /** Localized banner text for a voice notice. Never raw provider or database text. */
  const voiceNoticeMessage = (): string | null => {
    const notice: VoiceNotice | null = voice.notice;
    switch (notice) {
      case 'audio_blocked':
        return t.chat.audioBlocked;
      case 'audio_unavailable':
        return t.chat.audioUnavailable;
      case 'microphone_unavailable':
        return t.chat.micUnavailable;
      case 'transcription_empty':
        return t.chat.transcriptEmpty;
      case 'transcription_failed':
        return t.chat.transcriptionFailed;
      case 'submit_failed':
        return t.chat.submitFailed;
      case 'answer_not_accepted':
        return t.chat.answerNotAccepted;
      case 'recording_failed':
        return t.chat.recordingFailed;
      case 'vad_unavailable':
        return t.chat.vadUnavailable;
      default:
        return null;
    }
  };

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
            onStartTalking={() => void handleStartIntake('voice')}
            onTypeInstead={() => void handleStartIntake('text')}
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
            onReplayAudio={handleReplayAudio}
            onBack={handleBack}
            isProcessing={
              isProcessing || voice.phase === 'transcribing' || voice.phase === 'submitting'
            }
            onEndSession={handleEndSessionCap}
            voicePhase={voice.phase}
            voiceElapsedSeconds={voice.elapsedSeconds}
            micDenied={voice.micDenied}
            pendingTranscript={pendingVoiceTranscript}
            voiceNotice={voiceNoticeMessage()}
            onDismissNotice={() => {
                        voice.dismissNotice();
            }}
            inputMode={inputMode}
            onChangeMode={handleChangeInputMode}
            onDoneAnswer={() => void voice.done()}
            onRetryVoice={handleRetryVoice}
            canFinish={canFinishPartial}
            onFinish={handleFinishPartial}
            vadActive={voice.vadActive && voice.phase === 'listening'}
            speechActive={voice.speechActive}
            exitDialogOpen={exitDialogOpen}
            onRequestExit={handleRequestExit}
            onCancelExit={handleCancelExit}
            onConfirmExit={handleConfirmExit}
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
            canSubmit={hasSubmittedReport || partialPreview ? true : chatState?.can_submit}
            mode={reviewModeFor(hasSubmittedReport)}
            onCorrectField={handleCorrectField}
            onSubmit={partialPreview ? handleSendPartialReport : handleSubmitReport}
            onDontSubmit={handleDontSubmit}
            onEndSessionCap={handleEndSessionCap}
            onBack={partialPreview ? handleContinueAnswering : handleBack}
            onContinueBooking={hasSubmittedReport ? () => navigateToScreen('booking') : undefined}
            onFinish={hasSubmittedReport ? handleRestart : undefined}
            isSubmitting={isProcessing}
            partial={partialPreview}
            instruction={t.review.reportReadyInstruction}
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
            submittedNotice={t.review.sendAck}
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
