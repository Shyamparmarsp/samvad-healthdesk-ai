import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { ChatMessage, QuestionId } from '../../types/api';

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
  const { t, language, setLanguage } = useI18n();
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [typedText, setTypedText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [micError, setMicError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat log
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // 30s countdown timer when listening
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isListening && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (isListening && countdown === 0) {
      handleStopListening();
    }
    return () => clearInterval(timer);
  }, [isListening, countdown]);

  const handleStartListening = () => {
    setMicError(null);
    setIsListening(true);
    setCountdown(30);
  };

  const optionsToRender = getOptionsForQuestion(currentQuestion, language);

  const handleStopListening = () => {
    setIsListening(false);
    // In mock mode: generate a synthetic voice answer matching current question
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
    if (typedText.trim() && !isProcessing) {
      onSendText(typedText.trim());
      setTypedText('');
    }
  };

  const handleChipClick = (option: string) => {
    if (!isProcessing) {
      onSendText(option);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-mobile">
      {/* Top Bar with Question Progress */}
      <div className="px-4 py-3 bg-white/70 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-xs font-semibold text-brand-navy">
            {t.chat.turnCounter} {Math.min(turnCount + 1, maxTurns)} {t.chat.of} {maxTurns}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Language Toggle Button for English / Hindi switching */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
            title={language === 'en' ? 'Switch to Hindi' : 'Switch to English'}
            aria-label={language === 'en' ? 'Switch interface language to Hindi' : 'Switch interface language to English'}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-300 bg-white/70 hover:bg-white text-slate-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            {language === 'en' ? 'हिन्दी' : 'English'}
          </button>

          <button
            onClick={onReplayAudio}
            title={t.chat.replayQuestion}
            aria-label={t.chat.replayQuestion}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Demo Busy Banner if Cap Reached (D9 copy) */}
      {demoBusy && (
        <div role="status" aria-live="polite" className="mx-4 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 shadow-sm">
          <p className="font-semibold">{t.chat.demoBusyTitle}</p>
          <p className="mt-0.5">{t.chat.demoBusyMessage}</p>
        </div>
      )}

      {/* Mic Permission Denied / Recording Error Banner */}
      {micError && (
        <div
          role="alert"
          aria-live="polite"
          className="mx-4 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 shadow-sm flex items-center justify-between"
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

      {/* Scrolling Chat Message Log */}
      <div role="log" aria-live="polite" className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => {
          const isAssistant = msg.role === 'assistant';
          const displayedContent =
            isAssistant && msg.question_id && msg.question_id === currentQuestion?.id && language === 'hi' && currentQuestion.text_hi
              ? currentQuestion.text_hi
              : msg.content;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  isAssistant
                    ? 'bg-white text-text-primary rounded-tl-sm border border-slate-100'
                    : 'bg-brand-navy text-white rounded-tr-sm'
                }`}
              >
                {displayedContent}
              </div>
            </div>
          );
        })}

        {/* If currentQuestion is active and not already represented as the last assistant message */}
        {currentQuestion &&
          (messages.length === 0 || messages[messages.length - 1].role === 'patient') && (
            <div className="flex flex-col items-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm bg-white text-text-primary rounded-tl-sm border border-slate-100">
                {language === 'hi' && currentQuestion.text_hi ? currentQuestion.text_hi : currentQuestion.text}
              </div>
            </div>
          )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-slate-500 py-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
            <span>{t.chat.processing}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reply Option Chips (e.g. for Gender, Severity, Yes/No, Adaptive questions) */}
      {optionsToRender.length > 0 && !isListening && (
        <div
          role="group"
          aria-label="Quick reply options"
          className="px-4 py-2 flex flex-wrap gap-2 border-t border-slate-100 bg-white/50 backdrop-blur-sm"
        >
          {optionsToRender.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleChipClick(opt.value)}
              disabled={isProcessing}
              aria-label={opt.label}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-300 text-brand-navy hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy active:scale-95 disabled:opacity-50 transition-all shadow-sm"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Emergency Clarification Prompt with Yes / No Buttons (D9 copy) */}
      {currentQuestion?.id === 'emergency_clarification' && !isListening && (
        <div className="px-4 py-3 bg-red-50/80 border-t border-red-200 flex flex-col gap-2">
          <p className="text-xs font-semibold text-red-900">
            {t.chat.emergencyClarificationPrompt}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleChipClick('Yes')}
              disabled={isProcessing}
              aria-label={t.common.yes}
              className="flex-1 py-2 rounded-lg bg-red-600 text-white font-semibold text-xs shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {t.common.yes}
            </button>
            <button
              onClick={() => handleChipClick('No')}
              disabled={isProcessing}
              aria-label={t.common.no}
              className="flex-1 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-medium text-xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {t.common.no}
            </button>
          </div>
        </div>
      )}

      {/* Bottom Input Area */}
      <div className="p-4 bg-white/80 border-t border-slate-200/60 backdrop-blur-md">
        {inputMode === 'voice' ? (
          /* Voice Mode UI */
          <div className="flex flex-col items-center">
            {isListening ? (
              /* Listening State (P3b) */
              <div className="flex flex-col items-center py-2 w-full">
                <div className="flex items-center gap-1.5 h-10 mb-3">
                  <span className="w-1.5 h-6 bg-indigo-600 rounded-full animate-wave-1"></span>
                  <span className="w-1.5 h-10 bg-indigo-600 rounded-full animate-wave-2"></span>
                  <span className="w-1.5 h-4 bg-indigo-600 rounded-full animate-wave-3"></span>
                  <span className="w-1.5 h-8 bg-indigo-600 rounded-full animate-wave-4"></span>
                  <span className="w-1.5 h-5 bg-indigo-600 rounded-full animate-wave-5"></span>
                </div>

                <p className="text-xs font-semibold text-brand-navy">
                  {t.chat.listening} ({countdown} {t.chat.countdown})
                </p>

                <button
                  onClick={handleStopListening}
                  className="mt-3 px-5 py-2 rounded-full bg-red-500 text-white font-semibold text-xs shadow-md hover:bg-red-600 transition-all flex items-center gap-1.5"
                >
                  <span className="w-2.5 h-2.5 rounded-sm bg-white"></span>
                  {t.common.done}
                </button>
              </div>
            ) : (
              /* Idle Voice State (P3) */
              <div className="flex items-center justify-between w-full">
                <button
                  onClick={() => setInputMode('text')}
                  aria-label={t.chat.typeInstead}
                  className="text-xs font-medium text-slate-500 hover:text-brand-navy flex items-center gap-1 px-2 py-1 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {t.chat.typeInstead}
                </button>

                {/* 86x86 Circular Mic Action Button */}
                <button
                  onClick={handleStartListening}
                  disabled={isProcessing || demoBusy}
                  aria-label={t.chat.tapToSpeak}
                  className="w-[86px] h-[86px] rounded-full bg-brand-navy text-white shadow-lg hover:bg-brand-navy-light active:scale-95 disabled:opacity-50 transition-all flex flex-col items-center justify-center -mt-6 border-4 border-surface-mobile shadow-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-300"
                >
                  <svg className="w-7 h-7 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                  </svg>
                  <span className="text-[10px] font-medium tracking-tight mt-0.5">
                    {t.chat.tapToSpeak}
                  </span>
                </button>

                <div className="w-16"></div>
              </div>
            )}
          </div>
        ) : (
          /* Text Entry Mode UI (P4b) */
          <form onSubmit={handleTextSubmit} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">
                Text Intake Mode
              </span>
              <button
                type="button"
                onClick={() => setInputMode('voice')}
                aria-label={t.chat.useVoice}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
                {t.chat.useVoice}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={t.chat.inputPlaceholder}
                aria-label={t.chat.inputPlaceholder}
                disabled={isProcessing || demoBusy}
                autoFocus
                className="flex-1 h-11 px-4 rounded-input border border-slate-300 bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-navy shadow-inner"
              />
              <button
                type="submit"
                disabled={!typedText.trim() || isProcessing || demoBusy}
                aria-label={t.chat.send}
                className="h-11 px-5 rounded-input bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light disabled:opacity-50 transition-all flex items-center justify-center shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                {t.chat.send}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
