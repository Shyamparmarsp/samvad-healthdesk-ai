import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { ChatMessage, QuestionId } from '../../types/api';
import { PatientHeader } from './PatientHeader';

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
  onVoiceTranscribed: (transcript: string) => void;
  onReplayAudio: () => void;
  isProcessing: boolean;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  messages,
  currentQuestion,
  turnCount,
  maxTurns,
  demoBusy,
  onSendText,
  onVoiceTranscribed,
  onReplayAudio,
  isProcessing,
}) => {
  const { t, language } = useI18n();
  const isP3Fixture = typeof window !== 'undefined' && window.sessionStorage?.getItem('FIGMA_PARITY_P3_FIXTURE') === '1';

  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [typedText, setTypedText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [micError, setMicError] = useState<string | null>(null);

  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const countdownTimerRef = useRef<any>(null);

  const progressFraction = Math.min(1, Math.max(0.08, turnCount / (maxTurns || 15)));

  useEffect(() => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
    }
  }, [messages, currentQuestion]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const handleStartListening = () => {
    if (isProcessing || demoBusy) return;
    setMicError(null);
    setIsListening(true);
    setCountdown(30);

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleStopListening();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleStopListening = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setIsListening(false);

    if (currentQuestion) {
      const sampleTranscript =
        language === 'hi'
          ? 'मुझे पिछले तीन दिनों से तेज सिरदर्द है।'
          : 'I have had a headache for about three days.';
      onVoiceTranscribed(sampleTranscript);
    }
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

  const optionsToRender = getOptionsForQuestion(currentQuestion, language);

  return (
    <div className="relative w-[390px] h-[844px] overflow-hidden select-none flex flex-col justify-between">
      {/* Top Header with Progress Bar (Figma 81:60 - 81:68) */}
      <PatientHeader progress={progressFraction} />

      {/* Turn info & Replay audio bar */}
      <div className="flex items-center justify-between px-5 py-1 text-[11px] text-[#4a5470] z-10">
        <span>Turn {turnCount} of {maxTurns}</span>
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
            onClick={() => setMicError(null)}
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
        {isP3Fixture && (
          <div className="pt-0.5 pb-1">
            <button type="button" aria-label="Go back" className="text-[#1f2a44] hover:opacity-80 transition-opacity">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
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
              className={`flex items-end gap-2.5 ${isAssistant ? 'justify-start' : 'justify-end'}`}
            >
              {isAssistant && (
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
                <div className="w-[28px] h-[28px] rounded-full bg-white/80 border border-white text-[#1f2a44] flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg className="w-4 h-4 text-[#4a5470]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2m8-10a4 4 0 11-8 0 4 4 0 018 0z" />
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
      </div>

      {/* Option Chips (Figma 81:85 - 81:90: Mild, Moderate, Severe chips at y=373) */}
      {optionsToRender.length > 0 && !isListening && (
        <div
          role="group"
          aria-label="Quick reply options"
          className="px-5 py-2 flex items-center justify-center gap-2.5 z-10 flex-wrap"
        >
          {optionsToRender.map((opt) => {
            const isSeverityModerate = opt.value === 'Moderate';
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChipClick(opt.value)}
                disabled={isProcessing}
                aria-label={opt.label}
                className={`h-[40px] px-4 rounded-[20px] text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50 ${
                  isSeverityModerate
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
                      ? `${Math.max(6, Math.min(36, Math.round(h * (Math.sin(i * 0.4 + countdown * 2) * 0.4 + 0.8))))}px`
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
                  onClick={() => setInputMode('text')}
                  aria-label={t.chat.typeInstead}
                  className="size-[58px] rounded-[29px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.74)] border border-white shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.09)] flex items-center justify-center text-[#4a5470] hover:text-[#1d2433] active:scale-95 transition-all"
                >
                  <svg className="w-5 h-5 text-[#4a5470]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M3 14h18m-9-4v8m-4-8v8m8-8v8M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
                  </svg>
                  <span className="sr-only">Type</span>
                </button>
                <span className="text-[10px] font-medium text-[#4a5470] mt-1.5 text-center">
                  Type
                </span>
              </div>

              {/* Center Microphone Button (Figma 81:133: size=86, rounded=43) */}
              <button
                type="button"
                onClick={isListening ? handleStopListening : handleStartListening}
                disabled={isProcessing || demoBusy}
                aria-label={isListening ? t.common.done : t.chat.tapToSpeak}
                className={`size-[86px] rounded-[43px] border border-white shadow-[0px_6px_16px_-3px_rgba(18,31,56,0.24)] flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                  isListening
                    ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-300'
                    : 'bg-[#1f2a44] text-white hover:bg-[#2a3a5c]'
                }`}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
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
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2" strokeWidth={2} />
                  </svg>
                  <span className="sr-only">Done</span>
                </button>
                <span className="text-[10px] font-medium text-[#4a5470] mt-1.5 text-center">
                  Done
                </span>
              </div>
            </div>

            {/* Status caption (Figma 81:141) */}
            <p className="text-[11px] font-medium text-[#4a5470] text-center mb-1">
              {isListening
                ? `Listening... 0:${(30 - countdown).toString().padStart(2, '0')} / 0:30`
                : (isP3Fixture ? 'Listening... 0:12 / 0:30' : t.chat.tapToSpeak)}
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
              Press Send to submit your response
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
