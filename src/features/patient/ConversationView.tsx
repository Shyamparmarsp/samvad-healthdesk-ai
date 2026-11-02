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

  // 1. Explicit emergency clarification is handled separately with dedicated prompt card
  if (question.id === 'emergency_clarification' || question.is_ambiguous_emergency) {
    return [];
  }

  // 2. Yes/No questions (either answer_type === 'yes_no' or options are Yes/No)
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

  // 3. Gender question
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

  // 4. General options array from backend or mock with Hindi localization
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

interface ConversationViewProps {
  messages: ChatMessage[];
  currentQuestion?: {
    id: QuestionId | string;
    text: string;
    text_hi?: string;
    options?: string[];
    is_ambiguous_emergency?: boolean;
    answer_type?: AnswerType;
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
  demoBusy = false,
  onSendText,
  onVoiceTranscribed,
  onReplayAudio,
  isProcessing,
}) => {
  const { t, language } = useI18n();
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(30);
  const [typedText, setTypedText] = useState<string>('');
  const [micError, setMicError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const countdownIntervalRef = useRef<any>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing, currentQuestion]);

  // Clean up recording timer on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const handleStartListening = () => {
    if (isListening || isProcessing || demoBusy) return;
    setMicError(null);
    setIsListening(true);
    setCountdown(30);

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleStopListening();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const optionsToRender = getOptionsForQuestion(currentQuestion, language);

  const handleStopListening = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setIsListening(false);

    // In mock mode / voice intake: generate a natural response matching current question
    let simulatedVoiceAnswer = 'I have mild pain since yesterday';
    if (currentQuestion?.id === 'name') simulatedVoiceAnswer = 'Pooja Verma';
    else if (currentQuestion?.id === 'age') simulatedVoiceAnswer = '29';
    else if (currentQuestion?.id === 'gender' || currentQuestion?.id === 'patient.gender') simulatedVoiceAnswer = 'Female';
    else if (currentQuestion?.id === 'primary_concern') simulatedVoiceAnswer = 'Sharp knee pain while walking';
    else if (currentQuestion?.id === 'duration') simulatedVoiceAnswer = 'About 2 weeks';
    else if (currentQuestion?.id === 'severity') simulatedVoiceAnswer = 'Moderate';
    else if (currentQuestion?.id === 'conditions') simulatedVoiceAnswer = 'None known';
    else if (currentQuestion?.id === 'medications') simulatedVoiceAnswer = 'None';
    else if (currentQuestion?.id === 'allergies') simulatedVoiceAnswer = 'None known';
    else if (currentQuestion?.id === 'other_symptoms') simulatedVoiceAnswer = 'Mild swelling around the knee';
    else if (optionsToRender.length > 0) {
      simulatedVoiceAnswer = optionsToRender[0].value;
    } else {
      simulatedVoiceAnswer = 'No other issues to mention';
    }

    // Pass to "What we heard" step before sending
    onVoiceTranscribed(simulatedVoiceAnswer);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedText.trim() || isProcessing || demoBusy) return;
    const toSend = typedText.trim();
    setTypedText('');
    onSendText(toSend);
  };

  const handleChipClick = (value: string) => {
    if (isProcessing || demoBusy) return;
    onSendText(value);
  };

  const progress = Math.min(1, Math.max(0, turnCount / maxTurns));

  return (
    <div className="flex flex-col h-full justify-between pb-3 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle & Progress (Figma 72:66) */}
      <PatientHeader progress={progress} />

      {/* Turn counter & Replay audio link */}
      <div className="flex items-center justify-between px-5 pt-1 text-[11px] text-[#4a5470]">
        <span>Turn {turnCount} of {maxTurns}</span>
        <button
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
        <div role="status" aria-live="polite" className="mx-4 mt-2 p-3 rounded-[16px] bg-amber-50/90 border border-amber-200 text-xs text-amber-900 shadow-sm">
          <p className="font-semibold">{t.chat.demoBusyTitle}</p>
          <p className="mt-0.5 text-[11px]">{t.chat.demoBusyMessage}</p>
        </div>
      )}

      {/* Mic Permission Denied / Recording Error Banner */}
      {micError && (
        <div
          role="alert"
          aria-live="polite"
          className="mx-4 mt-2 p-2.5 rounded-[16px] bg-amber-50/90 border border-amber-200 text-xs text-amber-900 shadow-sm flex items-center justify-between"
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
      <div role="log" aria-live="polite" className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => {
          const isAssistant = msg.role === 'assistant';
          const displayedContent =
            isAssistant && msg.question_id && msg.question_id === currentQuestion?.id && language === 'hi' && currentQuestion.text_hi
              ? currentQuestion.text_hi
              : msg.content;
          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isAssistant ? 'justify-start' : 'justify-end'}`}
            >
              {isAssistant && (
                <div className="w-[30px] h-[30px] rounded-full bg-[#1f2a44] border border-white text-white flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm">
                  +
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
                <div className="w-[28px] h-[28px] rounded-full bg-[#e4e8f2] border border-white text-[#1f2a44] flex items-center justify-center flex-shrink-0 text-[10px] font-bold shadow-sm">
                  You
                </div>
              )}
            </div>
          );
        })}

        {/* If currentQuestion is active and not already represented as the last assistant message */}
        {currentQuestion &&
          (messages.length === 0 || messages[messages.length - 1].role === 'patient') && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-[30px] h-[30px] rounded-full bg-[#1f2a44] border border-white text-white flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm">
                +
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

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reply Option Chips (Figma 81:85 - 81:90 & 81:160 - 81:167) */}
      {optionsToRender.length > 0 && !isListening && (
        <div
          role="group"
          aria-label="Quick reply options"
          className="px-4 py-2 flex flex-wrap gap-2 justify-center"
        >
          {optionsToRender.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleChipClick(opt.value)}
              disabled={isProcessing}
              aria-label={opt.label}
              className="h-[40px] px-4 rounded-[20px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.76)] border border-white text-[#1d2433] text-[12px] font-semibold hover:bg-[#1f2a44] hover:text-white transition-all shadow-[0px_3px_9px_-3px_rgba(41,51,79,0.12)] active:scale-95 disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Emergency Clarification Prompt with Yes / No Buttons (D9 copy) */}
      {currentQuestion?.id === 'emergency_clarification' && !isListening && (
        <div className="mx-4 my-2 p-3.5 rounded-[18px] bg-red-50/90 border border-red-200 flex flex-col gap-2.5 shadow-sm">
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

      {/* Bottom Voice / Text Control Card (Figma 81:91 voice/control-card & 81:278 mic-denied/card) */}
      <div className="px-4 pt-1">
        {inputMode === 'voice' ? (
          /* Voice Control Card (Figma 81:91) */
          <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[26px] p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] flex flex-col items-center">
            {/* Waveform Visualization (Figma 81:92) */}
            <div className="h-[36px] w-[260px] flex items-center justify-between px-1 mb-2">
              {[8, 14, 20, 12, 24, 32, 16, 22, 34, 18, 12, 26, 36, 18, 12, 24, 30, 16, 10, 22, 30, 16, 10, 24, 34, 18, 12, 26, 32, 16, 10, 18, 12, 8, 14].map((h, i) => (
                <div
                  key={i}
                  className={`w-[3px] rounded-[2px] transition-all duration-200 ${
                    isListening
                      ? 'bg-[#1f2a44] animate-pulse'
                      : 'bg-[#c7d1e5]'
                  }`}
                  style={{
                    height: isListening ? `${Math.max(6, (h * (Math.sin(i + countdown) + 1.2)) / 1.5)}px` : `${h / 2.5}px`,
                  }}
                />
              ))}
            </div>

            {/* 3 Buttons Row (Type, Mic, Done) */}
            <div className="flex items-center justify-between w-full max-w-[280px] my-1">
              {/* Type Switch Button (Figma 81:128) */}
              <button
                type="button"
                onClick={() => setInputMode('text')}
                aria-label={t.chat.typeInstead}
                className="min-w-[54px] h-[54px] px-2 rounded-[27px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.74)] border border-white text-[#4a5470] hover:text-[#1d2433] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.09)] flex flex-col items-center justify-center transition-all active:scale-95"
              >
                <svg className="w-4 h-4 text-[#4a5470]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-[8px] font-medium text-[#4a5470] leading-none mt-0.5">
                  {t.chat.typeInstead}
                </span>
              </button>

              {/* Center Microphone Button (Figma 81:133) */}
              <button
                type="button"
                onClick={isListening ? handleStopListening : handleStartListening}
                disabled={isProcessing || demoBusy}
                aria-label={isListening ? t.common.done : t.chat.tapToSpeak}
                className={`w-[78px] h-[78px] rounded-[39px] border border-white shadow-[0px_6px_16px_-3px_rgba(18,31,56,0.24)] flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                  isListening
                    ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-300'
                    : 'bg-[#1f2a44] text-white hover:bg-[#2a3a5c]'
                }`}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </button>

              {/* Done Button (Figma 81:137) */}
              <button
                type="button"
                onClick={handleStopListening}
                disabled={!isListening}
                aria-label={t.common.done}
                className={`min-w-[54px] h-[54px] px-2 rounded-[27px] backdrop-blur-[9px] border border-white shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.09)] flex flex-col items-center justify-center transition-all ${
                  isListening
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
                    : 'bg-[rgba(255,255,255,0.74)] text-[#4a5470] opacity-50 cursor-not-allowed'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[8px] font-medium leading-none mt-0.5">
                  {t.common.done}
                </span>
              </button>
            </div>

            {/* Status caption (Figma 81:141) */}
            <p className="text-[11px] font-medium text-[#4a5470] text-center mt-2">
              {isListening
                ? `${t.chat.listening} (${countdown}s)`
                : t.chat.tapToSpeak}
            </p>
          </div>
        ) : (
          /* Text Intake Mode UI (Figma 72:209 MicDeniedView) */
          <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[24px] p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-[#1d2433]">
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

            <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={t.chat.inputPlaceholder}
                aria-label={t.chat.inputPlaceholder}
                disabled={isProcessing || demoBusy}
                autoFocus
                className="flex-1 h-[46px] px-3.5 rounded-[13px] backdrop-blur-[9px] bg-white/80 border border-white text-sm text-[#1d2433] placeholder:text-[#4a5470]/60 focus:outline-none focus:ring-2 focus:ring-[#1f2a44] shadow-inner"
              />
              <button
                type="submit"
                disabled={!typedText.trim() || isProcessing || demoBusy}
                aria-label={t.chat.send}
                className="h-[46px] px-4 rounded-[13px] bg-[#1f2a44] text-white text-xs font-semibold hover:bg-[#2a3a5c] disabled:opacity-50 transition-all shadow-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
              >
                {t.chat.send}
              </button>
            </form>
          </div>
        )}

        {/* Footer Disclaimer */}
        <p className="text-[9px] text-center text-[#4a5470] pt-2 leading-tight font-normal">
          {t.welcome.disclaimer}
        </p>
      </div>
    </div>
  );
};
