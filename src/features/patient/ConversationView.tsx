import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { ChatMessage, QuestionId } from '../../types/api';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';
import { AudioRecorder } from '../../lib/audio';
import { convertBlobToVoiceAnswer, syntheticWavBase64, type VoiceAnswer } from '../../lib/audio/voice';
import { isConversationDeadEnd } from '../../lib/navigation';

export type AnswerType = 'free_text' | 'yes_no' | 'single_choice';

interface DisplayOption {
  label: string;
  value: string;
}

const OPTION_TRANSLATIONS_HI: Record<string, string> = {
  // Severity / Duration
  'Mild': 'हल्का (Mild)',
  'Moderate': 'मध्यम (Moderate)',
  'Severe': 'गंभीर (Severe)',
  'Suddenly': 'अचानक (Suddenly)',
  'Gradually': 'धीरे-धीरे (Gradually)',
  'Comes and goes': 'आता-जाता (Comes and goes)',
  'Constant': 'लगातार (Constant)',
  'Occasional': 'कभी-कभी (Occasional)',
  // Common conditions / symptoms
  'None known': 'कोई नहीं / पता नहीं',
  'None': 'कोई नहीं',
  'High blood pressure': 'हाई ब्लड प्रेशर',
  'Diabetes': 'डायबिटीज',
  'Yes, taking regular medicines': 'हाँ, नियमित दवा ले रहे हैं',
  'Penicillin': 'पेनिसिलिन',
  'Sulfa drugs': 'सल्फा दवाएं',
  'No other symptoms': 'कोई अन्य लक्षण नहीं',
  'Mild fever': 'हल्का बुखार',
  'Headache': 'सिरदर्द',
  // Cardiac / Surgical
  'Pressure': 'दबाव (Pressure)',
  'Heaviness': 'भारीपन (Heaviness)',
  'Sharp pain': 'तीखा दर्द (Sharp pain)',
  'Burning': 'जलन (Burning)',
  'Dull pain': 'हल्का दर्द (Dull pain)',
  'Cramping': 'मरोड़ जैसा (Cramping)',
};

function getOptionsForQuestion(
  question?: ConversationViewProps['currentQuestion'],
  language: 'en' | 'hi' = 'en'
): DisplayOption[] {
  if (!question) return [];

  if (question.id === 'emergency_clarification' || question.is_ambiguous_emergency) {
    return [];
  }

  const isYesNo =
    question.answer_type === 'yes_no' ||
    (question.options &&
      question.options.length === 2 &&
      question.options.some((o) => o.toLowerCase() === 'yes') &&
      question.options.some((o) => o.toLowerCase() === 'no'));

  if (isYesNo) {
    return [
      {
        label: language === 'hi' ? 'हाँ (Yes)' : 'Yes',
        value: 'Yes',
      },
      {
        label: language === 'hi' ? 'नहीं (No)' : 'No',
        value: 'No',
      },
    ];
  }

  if (question.id === 'gender' || question.id === 'patient.gender') {
    if (language === 'hi') {
      return [
        { label: 'पुरुष (Male)', value: 'Male' },
        { label: 'महिला (Female)', value: 'Female' },
        { label: 'अन्य (Other)', value: 'Other' },
        { label: 'बताना नहीं चाहते (Prefer not to say)', value: 'Prefer not to say' },
      ];
    }
    return [
      { label: 'Male', value: 'Male' },
      { label: 'Female', value: 'Female' },
      { label: 'Other', value: 'Other' },
      { label: 'Prefer not to say', value: 'Prefer not to say' },
    ];
  }

  if (question.options && question.options.length > 0) {
    return question.options.map((opt) => {
      const localizedLabel =
        language === 'hi' && OPTION_TRANSLATIONS_HI[opt]
          ? OPTION_TRANSLATIONS_HI[opt]
          : opt;
      return {
        label: localizedLabel,
        value: opt,
      };
    });
  }

  return [];
}

const FIGMA_WAVEFORM_HEIGHTS = [
  8, 12, 18, 10, 23, 30, 14, 21, 34, 18, 10, 25, 36, 17, 10, 22, 31, 14, 8, 20, 30, 16, 9, 23, 34, 18, 10, 25, 32, 14, 8, 17, 11, 7, 13
];

interface ConversationViewProps {
  messages: ChatMessage[];
  currentQuestion?: {
    id: QuestionId | string;
    text: string;
    text_hi?: string;
    answer_type?: AnswerType;
    options?: string[];
    is_ambiguous_emergency?: boolean;
  };
  turnCount: number;
  maxTurns: number;
  demoBusy?: boolean;
  onSendText: (text: string) => void;
  onVoiceTranscribed?: (transcript: string) => void;
  onVoiceRecorded?: (voice: VoiceAnswer) => void;
  onReplayAudio: () => void;
  onBack?: () => void;
  isProcessing: boolean;
  /** D-39: explicit way out of a documented dead-end session. */
  onEndSession?: () => void;
  /** Server-owned session status, used only to detect the dead-end state. */
  sessionStatus?: string;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  messages,
  currentQuestion,
  turnCount,
  maxTurns,
  demoBusy,
  onSendText,
  onVoiceTranscribed,
  onVoiceRecorded,
  onReplayAudio,
  onBack,
  isProcessing,
  onEndSession,
  sessionStatus,
}) => {
  const { t, language } = useI18n();

  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [typedText, setTypedText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'completed' | 'error'>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  // D-05: a denied/unavailable microphone is a real state with a text fallback.
  const [micDenied, setMicDenied] = useState(false);
  // D-50: the active severity/option chip reflects the patient's selection.
  const [selectedChip, setSelectedChip] = useState<string | null>(null);

  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const isStoppingRef = useRef<boolean>(false);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);

  const optionsToRender = getOptionsForQuestion(currentQuestion, language);

  // D-39: the backend can return an incomplete session with no next question. That
  // used to dead-end with sends silently ignored; it now offers an explicit End.
  const isDeadEnd =
    messages.length > 0 &&
    isConversationDeadEnd({
      hasCurrentQuestion: Boolean(currentQuestion),
      isProcessing,
      demoBusy,
      sessionStatus,
    });


  const progressFraction = Math.min(1, Math.max(0.08, turnCount / (maxTurns || 15)));

  // Keep the newest turn visible.
  useEffect(() => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
    }
  }, [messages, currentQuestion]);

  // Release the recorder and timer when the screen unmounts.
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (audioRecorderRef.current) {
        audioRecorderRef.current.cancel();
        audioRecorderRef.current = null;
      }
      isStoppingRef.current = false;
    };
  }, []);

  const handleStartListening = async () => {
    if (isProcessing || demoBusy || isListening || isStoppingRef.current) return;
    setMicError(null);

    try {
      const recorder = new AudioRecorder();
      audioRecorderRef.current = recorder;

      // Handle stream track termination (e.g. microphone unplugged/disconnected)
      recorder.setOnTrackEnded(() => {
        if (!isStoppingRef.current) {
          void handleStopListening();
        }
      });

      recorder.setOnError((err) => {
        console.error('Audio recorder error:', err);
        if (!isStoppingRef.current) {
          void handleStopListening();
        }
      });

      // 1. Recording starts only after microphone access and MediaRecorder successfully start
      await recorder.start();

      // 2. Timer starts at 00:00
      const startTime = Date.now();
      recordingStartTimeRef.current = startTime;
      isStoppingRef.current = false;
      setIsListening(true);
      setRecordingStatus('recording');
      setElapsedSeconds(0);

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }

      // Reliable elapsed-time calculation updated every 250ms
      timerIntervalRef.current = setInterval(() => {
        if (!recordingStartTimeRef.current || isStoppingRef.current) return;

        const elapsedMs = Date.now() - recordingStartTimeRef.current;
        const currentElapsedSec = Math.floor(elapsedMs / 1000);

        if (currentElapsedSec >= 30) {
          setElapsedSeconds(30);
          // 6. At exactly 30 seconds, recording automatically stops
          void handleStopListening();
        } else {
          setElapsedSeconds(currentElapsedSec);
        }
      }, 250);
    } catch (err: any) {
      console.error('Microphone recording start failed:', err);
      if (audioRecorderRef.current) {
        audioRecorderRef.current.cancel();
        audioRecorderRef.current = null;
      }
      setIsListening(false);
      setRecordingStatus('error');
      setElapsedSeconds(0);
      setMicDenied(true);
      setMicError(
        t.chat.micUnavailable ||
          'Microphone access is unavailable. Please check permissions or switch to text mode.'
      );
    }
  };

  const handleStopListening = async () => {
    // 8. The recording is stopped exactly once
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setIsListening(false);
    setRecordingStatus('completed');

    const recorder = audioRecorderRef.current;
    audioRecorderRef.current = null;
    recordingStartTimeRef.current = null;

    if (recorder) {
      try {
        const recordingResult = await recorder.stop();
        const voice = await convertBlobToVoiceAnswer(recordingResult.blob);
        isStoppingRef.current = false;
        // 7. The application transitions into the existing transcript-processing workflow
        if (onVoiceRecorded) {
          onVoiceRecorded(voice);
        } else if (onVoiceTranscribed) {
          onVoiceTranscribed(voice as any);
        }
      } catch (err) {
        console.error('Failed to stop recording cleanly:', err);
        isStoppingRef.current = false;
        const fallbackVoice: VoiceAnswer = {
          audio_base64: syntheticWavBase64(),
          audio_format: 'audio/wav',
          source: 'synthetic',
        };
        if (onVoiceRecorded) {
          onVoiceRecorded(fallbackVoice);
        } else if (onVoiceTranscribed) {
          onVoiceTranscribed(fallbackVoice as any);
        }
      }
    } else {
      isStoppingRef.current = false;
      // No recorder was active. Never fabricate a transcript and never re-open the
      // microphone without a user gesture (D-40): report the failure honestly.
      setMicError(t.chat.recordingFailed);
    }
  };

  const getTimerStatusText = () => {
    if (isListening) {
      const elapsedMinutes = Math.floor(elapsedSeconds / 60);
      const elapsedSecs = elapsedSeconds % 60;
      const formattedElapsed = `${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedSecs).padStart(2, '0')}`;
      const prefix = language === 'hi' ? 'सुन रहे हैं...' : 'Listening...';
      return `${prefix} ${formattedElapsed} / 00:30`;
    }
    if (recordingStatus === 'completed') {
      return language === 'hi' ? 'रिकॉर्डिंग पूरी हुई' : 'Recording complete';
    }
    return language === 'hi'
      ? 'अधिकतम रिकॉर्डिंग समय: 30 सेकंड'
      : 'Maximum recording time: 30 seconds';
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedText.trim() || isProcessing || demoBusy) return;
    const txt = typedText.trim();
    setTypedText('');
    onSendText(txt);
  };

  const handleChipClick = (value: string) => {
    if (isProcessing || demoBusy) return;
    onSendText(value);
  };

  // D-05: the approved microphone-denied state (text fallback + retry + back).
  // Placed after the handlers so the retry control uses an initialised callback.
  if (micDenied) {
    return (
      <div className="relative w-[390px] h-[844px] overflow-hidden select-none flex flex-col justify-between p-5">
        <PatientHeader />
        {onBack && (
          <div className="pt-0.5 pb-1">
            <BackButton onClick={onBack} />
          </div>
        )}

        {micError && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-2 p-2.5 rounded-[16px] bg-amber-50/90 border border-amber-200 text-xs text-amber-900 shadow-sm flex items-center justify-between z-10"
          >
            <span>{micError}</span>
            <button
              onClick={() => setMicError(null)}
              aria-label="Dismiss error"
              className="text-amber-700 hover:text-amber-900 font-bold ml-2 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Figma 72:209 Mic Denied / Text Mode */}
        <div className="my-auto backdrop-blur-[9px] bg-[rgba(255,255,255,0.65)] border border-white rounded-[28px] p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] space-y-5">
          <p className="text-[15px] font-bold text-[#1d2433] leading-snug">
            {t.chat.micDeniedTitle}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!typedText.trim() || isProcessing || demoBusy) return;
              const text = typedText.trim();
              setTypedText('');
              setMicDenied(false);
              onSendText(text);
            }}
            className="relative"
          >
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={t.chat.inputPlaceholder}
              aria-label={t.chat.inputPlaceholder}
              disabled={isProcessing || demoBusy}
              className="w-full h-[48px] pl-4 pr-11 rounded-[14px] bg-white/85 border border-white text-sm text-[#1d2433] placeholder:text-[#4a5470]/60 focus:outline-none focus:ring-2 focus:ring-[#1f2a44] shadow-inner"
            />
            <button
              type="submit"
              disabled={!typedText.trim() || isProcessing || demoBusy}
              aria-label={t.chat.send}
              className="absolute right-2 top-2 size-8 rounded-[10px] bg-[#1f2a44] text-white flex items-center justify-center disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setMicDenied(false);
              setMicError(null);
              void handleStartListening();
            }}
            disabled={isProcessing || demoBusy}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] text-white font-semibold text-[14px] shadow-sm hover:bg-[#2a3a5c] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-white"></span>
            <span>{t.chat.tryMicrophoneAgain}</span>
          </button>
        </div>

        <p className="text-[9px] text-center text-[#4a5470] pb-2 leading-tight font-normal">
          {t.welcome.disclaimer}
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-[390px] h-[844px] overflow-hidden select-none flex flex-col justify-between">
      {/* Dedicated Processing Screen matching Figma P3b / Node 72:192 (D-09) */}
      {isProcessing && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-40 bg-[rgba(221,227,238,0.7)] backdrop-blur-sm flex flex-col justify-between p-5 select-none"
        >
          <PatientHeader progress={progressFraction} />
          {onBack && (
            <div className="pt-0.5 pb-1">
              <BackButton onClick={onBack} />
            </div>
          )}
          <div className="my-auto backdrop-blur-[9px] bg-[rgba(255,255,255,0.75)] border border-white rounded-[28px] p-8 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] text-center max-w-[350px] mx-auto w-full">
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="w-3 h-3 rounded-full bg-[#1f2a44] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-3 h-3 rounded-full bg-[#1f2a44] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-3 h-3 rounded-full bg-[#1f2a44] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-[17px] font-bold text-[#1d2433] leading-snug">
              {language === 'hi' ? 'आपके उत्तर को समझा जा रहा है...' : 'Understanding your answer...'}
            </p>
          </div>
          <p className="text-[9px] text-center text-[#4a5470] pb-2">
            {t.welcome.disclaimer}
          </p>
        </div>
      )}

      {/* Top Header with Progress Bar (Figma 81:60 - 81:68) */}
      <PatientHeader progress={progressFraction} />

      {/* Turn info & Replay audio bar */}
      <div className="flex items-center justify-between px-5 py-1 text-[11px] text-[#4a5470] z-10">
        <span>{language === 'hi' ? `टर्न ${turnCount} / ${maxTurns}` : `Turn ${turnCount} of ${maxTurns}`}</span>
        <button
          type="button"
          onClick={onReplayAudio}
          title={t.chat.replayQuestion}
          aria-label={t.chat.replayQuestion}
          className="flex items-center gap-1 font-medium text-[#1f2a44] hover:underline"
        >
          <svg className="w-3.5 h-3.5 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span>{t.chat.replayQuestion}</span>
        </button>
      </div>

      {/* Demo Busy Banner if Cap Reached (D9 copy) */}
      {demoBusy && (
        <div role="status" aria-live="polite" className="mx-5 mb-2 p-3 rounded-[16px] bg-amber-50/90 border border-amber-200 text-xs text-amber-900 shadow-sm z-10">
          <p className="font-semibold">{t.chat.demoBusyTitle}</p>
          <p className="mt-0.5 text-[11px]">{t.chat.demoBusyMessage}</p>
        </div>
      )}

      {/* Mic Permission Denied / Error Banner */}
      {micError && (
        <div
          role="alert"
          aria-live="polite"
          className="mx-5 mb-2 p-2.5 rounded-[16px] bg-amber-50/90 border border-amber-200 text-xs text-amber-900 shadow-sm flex items-center justify-between z-10"
        >
          <span>{micError}</span>
          <button
            onClick={() => {
              setMicError(null);
              setMicDenied(false);
            }}
            aria-label="Dismiss error"
            className="text-amber-700 hover:text-amber-900 font-bold ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Scrolling Chat Message Log (Figma 81:73, 81:75) */}
      <div
        ref={chatScrollContainerRef}
        role="log"
        aria-live="polite"
        className="flex-1 overflow-y-auto px-5 py-2 space-y-3 z-10"
      >
        {onBack && (
          <div className="pt-0.5 pb-1">
            <BackButton onClick={onBack} />
          </div>
        )}

        {messages.map((msg) => {
          const isAssistant = msg.role === 'assistant';
          const displayedContent =
            isAssistant && msg.question_id && msg.question_id === currentQuestion?.id && language === 'hi' && currentQuestion.text_hi
              ? currentQuestion.text_hi
              : msg.content;
          return (
            <div
              key={msg.id}
              className={`flex items-center gap-2.5 ${isAssistant ? 'justify-start' : 'justify-end'}`}
            >
              {isAssistant && (
                <div
                  className="w-[30px] h-[30px] rounded-full bg-white/80 border border-white text-[#1f2a44] flex items-center justify-center flex-shrink-0 shadow-sm"
                  aria-hidden="true"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 30 30"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5 block"
                  >
                    <path
                      d="M20 8.75H10C7.92893 8.75 6.25 10.4289 6.25 12.5V20C6.25 22.0711 7.92893 23.75 10 23.75H20C22.0711 23.75 23.75 22.0711 23.75 20V12.5C23.75 10.4289 22.0711 8.75 20 8.75Z"
                      stroke="#1F2A44"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15 3.75V8.75M11.25 15H11.2625M18.75 15H18.7625M11.25 20H18.75M3.75 13.75V18.75M26.25 13.75V18.75"
                      stroke="#1F2A44"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
              <div
                className={`max-w-[82%] rounded-[20px] px-4 py-3 text-[13px] leading-relaxed ${
                  isAssistant
                    ? 'backdrop-blur-[9px] bg-[rgba(255,255,255,0.7)] border border-white text-[#1d2433] shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.1)] rounded-bl-sm'
                    : 'bg-[rgba(225,235,253,0.92)] border border-[#d1def5] text-[#1d2433] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.08)] rounded-br-sm'
                }`}
              >
                {displayedContent}
              </div>
              {!isAssistant && (
                <div
                  className="w-[30px] h-[30px] rounded-full bg-white/80 border border-white text-[#1f2a44] flex items-center justify-center flex-shrink-0 shadow-sm"
                  aria-hidden="true"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="3 3.875 22 22"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-[18px] h-[18px] block"
                  >
                    <path
                      d="M14 13.4167C16.2551 13.4167 18.0833 11.5885 18.0833 9.33333C18.0833 7.07817 16.2551 5.25 14 5.25C11.7448 5.25 9.91663 7.07817 9.91663 9.33333C9.91663 11.5885 11.7448 13.4167 14 13.4167Z"
                      stroke="#1F2A44"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5.83337 24.5C5.83337 22.3341 6.69379 20.2568 8.22534 18.7253C9.75688 17.1937 11.8341 16.3333 14 16.3333C16.166 16.3333 18.2432 17.1937 19.7747 18.7253C21.3063 20.2568 22.1667 22.3341 22.1667 24.5"
                      stroke="#1F2A44"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}

        {/* If currentQuestion is active and not already represented as the last assistant message */}
        {currentQuestion &&
          (messages.length === 0 || messages[messages.length - 1].role === 'patient') && (
            <div className="flex items-end gap-2.5 justify-start">
              <div
                className="w-[30px] h-[30px] rounded-full bg-white/80 border border-white text-[#1f2a44] flex items-center justify-center flex-shrink-0 shadow-sm"
                aria-hidden="true"
              >
                <svg className="w-4 h-4 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="4" y="8" width="16" height="12" rx="4" strokeWidth={1.8} />
                  <circle cx="9" cy="14" r="1.5" fill="currentColor" />
                  <circle cx="15" cy="14" r="1.5" fill="currentColor" />
                  <path d="M12 4v4m-3-4h6" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
              </div>
              <div className="max-w-[82%] rounded-[20px] px-4 py-3 text-[13px] leading-relaxed backdrop-blur-[9px] bg-[rgba(255,255,255,0.7)] border border-white text-[#1d2433] shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.1)] rounded-bl-sm">
                {language === 'hi' && currentQuestion.text_hi ? currentQuestion.text_hi : currentQuestion.text}
              </div>
            </div>
          )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-[#4a5470] py-2 px-3">
            <span className="w-2 h-2 rounded-full bg-[#1f2a44] animate-ping"></span>
            <span>{t.chat.processing}</span>
          </div>
        )}

        {/* D-39: explicit terminal state instead of a silent dead end */}
        {isDeadEnd && (
          <div role="alert" className="mx-1 my-2 p-3.5 rounded-[18px] bg-amber-50/90 border border-amber-200 text-xs text-amber-900">
            <p className="font-bold text-[12px]">{t.chat.deadEndTitle}</p>
            <p className="mt-1 text-[11px] leading-snug">{t.chat.deadEndMessage}</p>
            {onEndSession && (
              <button
                type="button"
                onClick={onEndSession}
                className="mt-2.5 w-full h-[40px] rounded-[20px] bg-[#1f2a44] text-white text-[12px] font-semibold"
              >
                {t.review.endSession}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Option Chips (Figma 81:85 - 81:90: Mild, Moderate, Severe chips, or Gender 2x2 grid) */}
      {optionsToRender.length > 0 && !isListening && (
        <div
          role="group"
          aria-label="Quick reply options"
          className={
            optionsToRender.length === 4
              ? 'px-5 py-2 grid grid-cols-2 gap-2.5 w-[350px] mx-auto z-10'
              : 'px-5 py-2 flex items-center justify-center gap-2.5 z-10 flex-wrap'
          }
        >
          {optionsToRender.map((opt) => {
            const isChipSelected = selectedChip === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setSelectedChip(opt.value);
                  handleChipClick(opt.value);
                }}
                disabled={isProcessing}
                aria-label={opt.label}
                className={`h-[40px] px-4 rounded-[20px] text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50 text-center flex items-center justify-center ${
                  isChipSelected
                    ? 'bg-[#1f2a44] border border-[#1f2a44] text-white shadow-[0px_3px_9px_-3px_rgba(41,51,79,0.17)]'
                    : 'backdrop-blur-[9px] bg-[rgba(255,255,255,0.76)] border border-white text-[#4a5470] hover:text-[#1d2433]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Emergency Clarification Prompt with Yes / No Buttons */}
      {currentQuestion?.id === 'emergency_clarification' && !isListening && (
        <div className="mx-5 my-2 p-3.5 rounded-[18px] bg-red-50/90 border border-red-200 flex flex-col gap-2.5 shadow-sm z-10">
          <p className="text-xs font-semibold text-red-900">
            {t.chat.emergencyClarificationPrompt}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleChipClick('Yes')}
              disabled={isProcessing}
              aria-label={t.common.yes}
              className="flex-1 h-10 rounded-[20px] bg-red-600 text-white font-semibold text-xs shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {t.common.yes}
            </button>
            <button
              type="button"
              onClick={() => handleChipClick('No')}
              disabled={isProcessing}
              aria-label={t.common.no}
              className="flex-1 h-10 rounded-[20px] bg-white border border-slate-300 text-slate-700 font-medium text-xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {t.common.no}
            </button>
          </div>
        </div>
      )}

      {/* Bottom Voice / Text Control Card (Figma 81:91: w=350, h=266 at x=20, y=500) */}
      <div className="px-5 pb-3 z-10">
        {inputMode === 'voice' ? (

          /* Voice Control Card (Figma 81:91) */
          <div className="w-[350px] h-[266px] mx-auto rounded-[28px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] p-4 flex flex-col justify-between items-center relative">
            {/* Waveform Visualization (Figma 81:92: 35 bars) */}
            <div className="h-[38px] w-[262px] flex items-center justify-between px-1 mt-2">
              {FIGMA_WAVEFORM_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className={`w-[3px] rounded-[2px] transition-all duration-200 ${
                    isListening
                      ? 'bg-[#1f2a44] animate-pulse'
                      : 'bg-[#c7d1e5]'
                  }`}
                  style={{
                    height: isListening
                      ? `${Math.max(6, Math.min(36, Math.round(h * (Math.sin(i * 0.4 + elapsedSeconds * 2) * 0.4 + 0.8))))}px`
                      : `${h}px`,
                  }}
                />
              ))}
            </div>

            {/* 3 Buttons Row: Type (58x58), Mic (86x86), Done (58x58) */}
            <div className="flex items-center justify-between w-full max-w-[290px] px-2 my-auto">
              {/* Type Switch Button (Figma 81:128) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (isListening) void handleStopListening();
                    setInputMode('text');
                  }}
                  aria-label={t.chat.typeInstead}
                  className="size-[58px] rounded-[29px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.74)] border border-white shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.09)] flex items-center justify-center text-[#4a5470] hover:text-[#1d2433] active:scale-95 transition-all"
                >
                  <svg className="w-7 h-7 text-[#1f2a44]" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor">
                    <path d="M22.1667 7H5.83333C4.54467 7 3.5 8.04467 3.5 9.33333V18.6667C3.5 19.9553 4.54467 21 5.83333 21H22.1667C23.4553 21 24.5 19.9553 24.5 18.6667V9.33333C24.5 8.04467 23.4553 7 22.1667 7Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M7 10.5H8.16667M11.6667 10.5H12.8333M16.3333 10.5H17.5M21 10.5H22.1667M7 14H8.16667M11.6667 14H12.8333M16.3333 14H17.5M21 14H22.1667M9.33333 17.5H18.6667" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="sr-only">Type</span>
                </button>
                <span className="text-[10px] font-medium text-[#4a5470] mt-1.5 text-center">
                  {language === 'hi' ? 'टाइप करें' : 'Type'}
                </span>
              </div>

              {/* Center Microphone Button (Figma 81:133: size=86, rounded=43) */}
              <button
                type="button"
                onClick={isListening ? handleStopListening : handleStartListening}
                disabled={isProcessing || demoBusy || recordingStatus === 'completed'}
                aria-label={isListening ? t.common.done : t.chat.tapToSpeak}
                className={`size-[86px] rounded-[43px] border border-white shadow-[0px_6px_16px_-3px_rgba(18,31,56,0.24)] flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                  isListening
                    ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-300'
                    : 'bg-[#1f2a44] text-white hover:bg-[#2a3a5c]'
                }`}
              >
                <svg
                  className="w-7 h-7"
                  width="28"
                  height="28"
                  viewBox="0 0 28 28"
                  fill="none"
                  stroke="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M14 3.5C13.0717 3.5 12.1815 3.86875 11.5251 4.52513C10.8687 5.1815 10.5 6.07174 10.5 7V14C10.5 14.9283 10.8687 15.8185 11.5251 16.4749C12.1815 17.1313 13.0717 17.5 14 17.5C14.9283 17.5 15.8185 17.1313 16.4749 16.4749C17.1313 15.8185 17.5 14.9283 17.5 14V7C17.5 6.07174 17.1313 5.1815 16.4749 4.52513C15.8185 3.86875 14.9283 3.5 14 3.5Z"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5.83333 12.8333V14C5.83333 16.1659 6.69375 18.2432 8.22529 19.7747C9.75684 21.3063 11.8341 22.1667 14 22.1667M14 22.1667C16.1659 22.1667 18.2432 21.3063 19.7747 19.7747C21.3063 18.2432 22.1667 16.1659 22.1667 14V12.8333M14 22.1667V25.6667M14 25.6667H9.33333M14 25.6667H18.6667"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* Done Button (Figma 81:137: size=58, rounded=29) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={handleStopListening}
                  disabled={!isListening}
                  aria-label={t.common.done}
                  className={`size-[58px] rounded-[29px] backdrop-blur-[9px] border border-white shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.09)] flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
                      : 'bg-[rgba(255,255,255,0.74)] text-[#4a5470] opacity-50 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-7 h-7 text-[#1f2a44]" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor">
                    <path d="M18.6667 7H9.33333C8.04467 7 7 8.04467 7 9.33333V18.6667C7 19.9553 8.04467 21 9.33333 21H18.6667C19.9553 21 21 19.9553 21 18.6667V9.33333C21 8.04467 19.9553 7 18.6667 7Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="sr-only">Done</span>
                </button>
                <span className="text-[10px] font-medium text-[#4a5470] mt-1.5 text-center">
                  {language === 'hi' ? 'पूर्ण' : 'Done'}
                </span>
              </div>
            </div>

            {/* Status caption (Figma 81:141) */}
            <p className="text-[11px] font-medium text-[#4a5470] text-center mb-1 h-[20px] leading-[20px] select-none">
              {getTimerStatusText()}
            </p>
          </div>
        ) : (
          /* Text Intake Mode UI (Figma 72:209) */
          <div className="w-[350px] h-[266px] mx-auto rounded-[28px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2 border-b border-white/60">
              <span className="text-[12px] font-bold text-[#1d2433]">
                Text Intake Mode
              </span>
              <button
                type="button"
                onClick={() => setInputMode('voice')}
                aria-label={t.chat.useVoice}
                className="text-[11px] font-semibold text-[#1f2a44] hover:underline flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
                <span>{t.chat.useVoice}</span>
              </button>
            </div>

            <form onSubmit={handleTextSubmit} className="flex flex-col gap-3 my-auto">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={t.chat.inputPlaceholder}
                aria-label={t.chat.inputPlaceholder}
                disabled={isProcessing || demoBusy}
                autoFocus
                className="w-full h-[48px] px-4 rounded-[14px] backdrop-blur-[9px] bg-white/85 border border-white text-sm text-[#1d2433] placeholder:text-[#4a5470]/60 focus:outline-none focus:ring-2 focus:ring-[#1f2a44] shadow-inner"
              />
              <button
                type="submit"
                disabled={!typedText.trim() || isProcessing || demoBusy}
                aria-label={t.chat.send}
                className="w-full h-[48px] rounded-[24px] bg-[#1f2a44] text-white text-sm font-semibold hover:bg-[#2a3a5c] disabled:opacity-50 transition-all shadow-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
              >
                {t.chat.send}
              </button>
            </form>

            <p className="text-[10px] text-center text-[#4a5470]">
              {t.chat.textModeHint}
            </p>
          </div>
        )}

        {/* Footer Disclaimer (Figma 81:142 at y=816) */}
        <p className="text-[9px] text-center text-[#4a5470] pt-2 leading-tight font-normal pointer-events-none">
          {t.welcome.disclaimer}
        </p>
      </div>
    </div>
  );
};
