import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import {
  startSession,
  recordConsent,
  chatTurn,
  correctDraftReport,
  submitReport,
  bookAppointment,
} from '../../lib/api';
import { ChatTurnResponse } from '../../types/api';
import { CorrectableField, ReportDocumentV1, ReportRow } from '../../types/report';
import { Appointment } from '../../types/doctor';
import { CONSENT_VERSION } from '../../types/consent';

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

export const PatientShell: React.FC = () => {
  const { language } = useI18n();

  const [currentScreen, setCurrentScreen] = useState<PatientScreen>('welcome');
  const [sessionId, setSessionId] = useState<string>('');
  const [chatState, setChatState] = useState<ChatTurnResponse | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | undefined>(undefined);
  const [endReason, setEndReason] = useState<'dont_submit' | 'incomplete_cap'>('dont_submit');

  // 1. Start talking / typing from welcome screen
  const handleStartIntake = async () => {
    setIsProcessing(true);
    try {
      const res = await startSession(language);
      setSessionId(res.session_id);
      setChatState(res);
      setCurrentScreen('consent');
    } catch (err) {
      console.error('Failed to start session', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Consent decisions (passes versioned consent constant CONSENT_VERSION)
  const handleConsentAgree = async () => {
    if (!sessionId) return;
    setIsProcessing(true);
    try {
      const res = await recordConsent(sessionId, true, language, CONSENT_VERSION);
      setChatState(res);
      setCurrentScreen('conversation');
    } catch (err) {
      console.error('Failed to record consent', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConsentDecline = async () => {
    if (!sessionId) return;
    try {
      await recordConsent(sessionId, false, language, CONSENT_VERSION);
      setCurrentScreen('consent_declined');
    } catch (err) {
      console.error('Failed to decline consent', err);
    }
  };

  // 3. Submitting text answer
  const handleSendAnswer = async (text: string) => {
    if (!sessionId || !chatState?.current_question) return;
    setIsProcessing(true);
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
    } catch (err) {
      console.error('Error submitting turn', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Voice turn request -> returns transcript_preview state per wire contract
  const handleVoiceRecorded = async () => {
    if (!sessionId || !chatState?.current_question) return;
    setIsProcessing(true);
    try {
      const res = await chatTurn({
        action: 'submit_turn',
        session_id: sessionId,
        question_id: chatState.current_question.id,
        audio_base64: 'simulated_audio_base64',
        audio_format: 'audio/webm',
      });
      setChatState(res);

      if (res.transcript_preview) {
        setPendingTranscript(res.transcript_preview.text);
        setCurrentScreen('what_we_heard');
      }
    } catch (err) {
      console.error('Error submitting voice turn', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmTranscript = async (confirmedText: string) => {
    setCurrentScreen('conversation');
    await handleSendAnswer(confirmedText);
  };

  // 5. Report corrections
  const handleCorrectField = async (
    field: CorrectableField,
    patch: { value: any; status: 'provided' | 'declined' },
  ) => {
    if (!sessionId) return;
    try {
      const res = await correctDraftReport({
        action: 'correct_draft_report',
        session_id: sessionId,
        report_id: 'draft',
        updates: { [field]: patch },
      });
      setChatState(res);
    } catch (err) {
      console.error('Failed to update field', err);
    }
  };

  // 6. Submit report to hospital
  const handleSubmitReport = async () => {
    if (!sessionId) return;
    setIsProcessing(true);
    try {
      const res = await submitReport({
        action: 'submit_report',
        session_id: sessionId,
        report_id: 'draft',
      });
      setChatState(res);
      setCurrentScreen('booking');
    } catch (err) {
      console.error('Failed to submit report', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 7. "Don't submit" option
  const handleDontSubmit = () => {
    setEndReason('dont_submit');
    setCurrentScreen('session_ended');
  };

  // 8. Incomplete cap end action
  const handleEndSessionCap = () => {
    setEndReason('incomplete_cap');
    setCurrentScreen('session_ended');
  };

  // 9. Book appointment
  const handleBookAppointment = async (slotId: string) => {
    if (!chatState?.submitted_report) return;
    const res = await bookAppointment({
      report_id: chatState.submitted_report.id,
      slot_id: slotId,
      doctor_id: chatState.submitted_report.doctor_id,
    });
    setActiveAppointment(res.appointment);
    setCurrentScreen('confirmed_booking');
  };

  // 10. "Not now" booking path
  const handleNotNowBooking = () => {
    setCurrentScreen('confirmed_report_only');
  };

  // 11. Restart session
  const handleRestart = () => {
    setSessionId('');
    setChatState(null);
    setActiveAppointment(undefined);
    setCurrentScreen('welcome');
  };

  return (
    <div className="w-full flex justify-center py-4 sm:py-8">
      {/* Mobile Frame Container (390 x 844 viewport matching Figma V2) */}
      <div className="w-full max-w-[390px] h-[844px] bg-white rounded-[36px] shadow-2xl border-4 border-slate-700/10 overflow-hidden flex flex-col relative">
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
            onReplayAudio={() => {}}
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
