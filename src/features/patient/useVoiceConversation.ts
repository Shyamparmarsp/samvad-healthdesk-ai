/**
 * React binding for the voice-first intake loop.
 *
 * Owns every audio resource for the conversation screen (one unlocked playback channel,
 * one recorder at a time, one session-scoped TTS cache) and drives `VoiceConversation`.
 * The shell only sees phases and notices, so it never has to coordinate audio itself.
 *
 * Provider calls: fixed prompts are played from `public/audio`; adaptive questions go
 * through the `speak` Edge Function (Timbre) at most once per session and language.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '../../lib/audio';
import { createAudioPlayback, type AudioPlayback } from '../../lib/audio/playback';
import { planAssistantSpeech } from '../../lib/audio/assistant-speech';
import { createPromptAudioCache } from '../../lib/audio/prompt-audio';
import { convertBlobToVoiceAnswer } from '../../lib/audio/voice';
import { createMicrophoneMonitor, createSilenceDetector, isVadSupported, type MicrophoneMonitor } from '../../lib/audio/vad';
import { preconnect, warmUrl } from '../../lib/net';
import { chatTurn } from '../../lib/api';
import type { ChatTurnResponse, QuestionId } from '../../types/api';
import {
  VoiceConversation,
  type QuestionRef,
  type RecordedAnswer,
  type SpeechOutcome,
  type TurnOutcome,
  type VoiceErrorCode,
  type VoicePhase,
} from './voice-conversation';

export type VoiceNotice =
  | VoiceErrorCode
  | 'audio_blocked'
  | 'audio_unavailable'
  | 'vad_unavailable';

export interface UseVoiceConversationOptions {
  /** The conversation screen is showing. */
  active: boolean;
  sessionId: string;
  language: 'en' | 'hi';
  question?: { id: string; text: string; text_hi?: string } | undefined;
  /** Server-side answer count when the loop starts (resumed sessions are not zero). */
  initialTurnCount?: number;
  /** Resolves an adaptive question to a playable URL, or null when TTS is unavailable. */
  speakAdaptive: (questionId: string) => Promise<string | null>;
  /** Applies a backend response to the shell state (and any navigation). */
  onResponse: (response: ChatTurnResponse) => void;
}

export interface VoiceConversationApi {
  phase: VoicePhase;
  elapsedSeconds: number;
  transcript: string;
  notice: VoiceNotice | null;
  micDenied: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  /** Playback actually started for the current question (drives the spoken highlight). */
  speechActive: boolean;
  /** Automatic silence detection is running for the current take. */
  vadActive: boolean;
  dismissNotice: () => void;
  /** Unlocks audio + asks for microphone permission inside the Start Talking gesture. */
  unlock: (options?: { microphone?: boolean }) => void;
  done: () => Promise<void>;
  retry: () => Promise<void>;
  replay: () => Promise<void>;
  announce: (question: QuestionRef) => Promise<void>;
  setSuspended: (suspended: boolean) => void;
  stop: () => void;
}

export function useVoiceConversation(options: UseVoiceConversationOptions): VoiceConversationApi {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [notice, setNotice] = useState<VoiceNotice | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [vadActive, setVadActive] = useState(false);

  const playbackRef = useRef<AudioPlayback | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const cacheRef = useRef(createPromptAudioCache());
  const controllerRef = useRef<VoiceConversation | null>(null);
  const startedRef = useRef<string>('');
  const turnCountRef = useRef(0);
  /** Text mode must survive a controller re-creation (screen changes dispose it). */
  const suspendedRef = useRef(false);
  const monitorRef = useRef<MicrophoneMonitor | null>(null);
  const detectorRef = useRef(createSilenceDetector());
  const vadNoticeShownRef = useRef(false);

  const playback = useCallback((): AudioPlayback => {
    if (!playbackRef.current) playbackRef.current = createAudioPlayback();
    return playbackRef.current;
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      try {
        recorder.cancel();
      } catch {
        // Cancelling twice is harmless.
      }
    }
  }, []);

  /** Speaks one question through the approved channel for that id. */
  /** The fixed questions are asked in a known order, so the next static clip can be
   *  cached while the current one is still speaking (no provider call). */
  const prefetchNextCachedPrompt = useCallback((questionId: string, language: 'en' | 'hi') => {
    const order = ['name', 'age', 'gender', 'primary_concern'];
    const index = order.indexOf(questionId);
    if (index < 0 || index === order.length - 1) return;
    const next = order[index + 1];
    const plan = planAssistantSpeech(next, language);
    if (plan.kind !== 'cached') return;
    for (const source of plan.sources) warmUrl(source);
  }, []);

  const speakQuestion = useCallback(
    async (question: QuestionRef, onStart?: () => void): Promise<SpeechOutcome> => {
      const { language } = optionsRef.current;
      const plan = planAssistantSpeech(question.id, language);

      if (plan.kind === 'cached') {
        for (const source of plan.sources) {
          const result = await playback().play(source, { onStart });
          if (result.ok) {
            prefetchNextCachedPrompt(question.id, language);
            return { spoken: true };
          }
          if (result.reason === 'blocked') return { spoken: false, reason: 'blocked' };
        }
        return { spoken: false, reason: 'missing' };
      }

      if (plan.kind === 'tts') {
        const cached = cacheRef.current.get(language, question.id);
        const url = cached ?? (await optionsRef.current.speakAdaptive(question.id));
        if (!url) return { spoken: false, reason: 'missing' };
        if (!cached) cacheRef.current.set(language, question.id, url);
        const result = await playback().play(url, { onStart });
        if (result.ok) return { spoken: true };
        return { spoken: false, reason: result.reason === 'blocked' ? 'blocked' : 'error' };
      }

      // No cached asset and no synthesis path for this id (for example the emergency
      // clarification): say so instead of playing placeholder silence.
      return { spoken: false, reason: 'missing' };
    },
    [playback, prefetchNextCachedPrompt],
  );

  /** Starts sampling the open take so sustained silence can finalise it. */
  const beginVad = useCallback(() => {
    endVadRef.current?.();
    const stream = recorderRef.current?.stream;
    if (!stream || !isVadSupported()) {
      setVadActive(false);
      if (!vadNoticeShownRef.current) {
        vadNoticeShownRef.current = true;
        setNotice('vad_unavailable');
      }
      return;
    }
    const detector = createSilenceDetector();
    detectorRef.current = detector;
    const monitor = createMicrophoneMonitor(stream, {
      onLevel: (level, atMs) => {
        const event = detector.push(level, atMs);
        if (event === 'silence_detected') controllerRef.current?.notifySilenceDetected();
      },
    });
    monitorRef.current = monitor;
    setVadActive(monitor.supported);
  }, []);

  const endVad = useCallback(() => {
    monitorRef.current?.stop();
    monitorRef.current = null;
    detectorRef.current.reset();
    setVadActive(false);
  }, []);
  const endVadRef = useRef<(() => void) | null>(null);
  endVadRef.current = endVad;

  const startListening = useCallback(async (): Promise<void> => {
    cancelRecording();
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    // A disconnected or failing microphone ends the take instead of hanging silently.
    recorder.setOnTrackEnded(() => {
      void controllerRef.current?.finishAnswer();
    });
    recorder.setOnError(() => {
      void controllerRef.current?.finishAnswer();
    });
    try {
      await recorder.start();
    } catch (error) {
      recorderRef.current = null;
      try {
        recorder.cancel();
      } catch {}
      throw error;
    }
  }, [cancelRecording]);

  const stopListening = useCallback(async (): Promise<RecordedAnswer> => {
    endVad();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) throw new Error('No active recording');

    const result = await recorder.stop();
    const blobSize = result.blob?.size ?? 0;
    if (blobSize === 0) {
      return { audio_base64: '', audio_format: 'audio/wav', duration_ms: result.durationMs, has_audio: false };
    }

    const voice = await convertBlobToVoiceAnswer(result.blob);
    // `source === 'synthetic'` means the browser could not decode the take. Sending it
    // would put an invented tone in front of the transcriber, so it is treated as empty.
    const hasAudio = voice.source === 'microphone' && voice.audio_base64.length > 0;
    return {
      audio_base64: hasAudio ? voice.audio_base64 : '',
      audio_format: voice.audio_format,
      duration_ms: result.durationMs,
      has_audio: hasAudio,
    };
  }, [endVad]);

  const transcribe = useCallback(async (answer: RecordedAnswer) => {
    const { sessionId, question } = optionsRef.current;
    if (!sessionId || !question) return { ok: false as const, reason: 'failed' as const };
    try {
      const response = await chatTurn({
        action: 'submit_turn',
        session_id: sessionId,
        // v2 bank ids are accepted by the backend validator; the shared wire union only
        // lists the core ids, so this narrows without changing the published contract.
        question_id: question.id as QuestionId,
        audio_base64: answer.audio_base64,
        audio_format: answer.audio_format,
      });
      if (response.transcript_preview && response.transcript_preview.text.trim().length > 0) {
        return { ok: true as const, text: response.transcript_preview.text };
      }
      if (response.error === 'transcript_empty') return { ok: false as const, reason: 'empty' as const };
      return { ok: false as const, reason: 'failed' as const };
    } catch {
      return { ok: false as const, reason: 'failed' as const };
    }
  }, []);

  const submit = useCallback(async (text: string, question: QuestionRef): Promise<TurnOutcome> => {
    const { sessionId, onResponse } = optionsRef.current;
    if (!sessionId) return { kind: 'failed' };

    const previousTurns = turnCountRef.current;
    let response: ChatTurnResponse;
    try {
      response = await chatTurn({
        action: 'submit_turn',
        session_id: sessionId,
        question_id: question.id as QuestionId,
        text,
      });
    } catch {
      return { kind: 'failed' };
    }

    turnCountRef.current = response.turn_count ?? previousTurns;
    onResponse(response);

    if (response.emergency_triggered || response.session_status === 'emergency') {
      return { kind: 'emergency' };
    }
    if (response.error) return { kind: 'failed' };
    if (response.is_complete || (response.is_cap_reached && response.draft_report)) {
      return { kind: 'complete' };
    }
    if (!response.current_question) return { kind: 'complete' };

    return {
      kind: 'next',
      question: {
        id: String(response.current_question.id),
        text: response.current_question.text,
      },
      turnAdvanced: (response.turn_count ?? previousTurns) > previousTurns,
    };
  }, []);

  const ensureController = useCallback((): VoiceConversation => {
    if (controllerRef.current) return controllerRef.current;

    const controller = new VoiceConversation(
      {
        speak: speakQuestion,
        startListening: async () => {
          await startListening();
          beginVad();
        },
        stopListening,
        cancelListening: () => {
          endVad();
          cancelRecording();
        },
        transcribe,
        submit,
      },
      {
        onPhase: (next) => {
          setPhase(next);
          if (next !== 'assistant_speaking') setSpeechActive(false);
        },
        onSpeechStart: () => setSpeechActive(true),
        onTranscript: (text) => {
          setTranscript(text);
          setNotice(null);
        },
        onElapsed: (seconds) => setElapsedSeconds(seconds),
        onAudioFailure: (reason) =>
          setNotice(reason === 'blocked' ? 'audio_blocked' : 'audio_unavailable'),
        onError: (code) => {
          setMicDenied(code === 'microphone_unavailable');
          setNotice(code);
        },
        onComplete: () => {
          setElapsedSeconds(0);
          playback().stop();
          cancelRecording();
        },
      },
    );

    controller.setSuspended(suspendedRef.current);
    controllerRef.current = controller;
    return controller;
  }, [beginVad, cancelRecording, endVad, playback, speakQuestion, startListening, stopListening, submit, transcribe]);

  const unlock = useCallback((options: { microphone?: boolean } = {}) => {
    void playback().unlock();
    // Ask for microphone permission inside the click, so the automatic capture after the
    // greeting does not need a second gesture. A patient entering by typing is never
    // prompted for the microphone.
    if (options.microphone === false) return;
    void new AudioRecorder().requestPermission();
  }, [playback]);

  const done = useCallback(async () => {
    await ensureController().finishAnswer();
  }, [ensureController]);

  const retry = useCallback(async () => {
    setNotice(null);
    setMicDenied(false);
    setTranscript('');
    await ensureController().retry();
  }, [ensureController]);

  const replay = useCallback(async () => {
    await ensureController().replay();
  }, [ensureController]);

  const announce = useCallback(
    async (question: QuestionRef) => {
      await ensureController().announce(question);
    },
    [ensureController],
  );

  const setSuspended = useCallback(
    (suspended: boolean) => {
      suspendedRef.current = suspended;
      ensureController().setSuspended(suspended);
    },
    [ensureController],
  );

  const stop = useCallback(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    endVad();
    cancelRecording();
    playback().stop();
    setSpeechActive(false);
    setElapsedSeconds(0);
  }, [cancelRecording, playback]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  // Warm the Supabase origin once so the first `speak` request does not pay for a new
  // TLS/DNS handshake. Static hints only — no request, no data, no provider cost.
  useEffect(() => {
    const url = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : '';
    if (url) preconnect(url);
  }, []);

  // Start the loop once per session, the first time the conversation screen shows a
  // question. Later questions are handled inside the controller.
  useEffect(() => {
    if (!options.active || !options.sessionId || !options.question) return;
    const key = `${options.sessionId}`;
    if (startedRef.current === key) return;
    startedRef.current = key;
    turnCountRef.current = options.initialTurnCount ?? 0;
    void ensureController().start({ id: options.question.id, text: options.question.text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.active, options.sessionId, options.question?.id]);

  // Leaving the screen (or unmounting) must release the microphone immediately.
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      startedRef.current = '';
      endVadRef.current?.();
      cancelRecording();
      playbackRef.current?.stop();
      cacheRef.current.clear();
    };
  }, [cancelRecording]);

  return {
    phase,
    elapsedSeconds,
    transcript,
    notice,
    micDenied,
    isListening: phase === 'listening',
    isSpeaking: phase === 'assistant_speaking',
    speechActive,
    vadActive,
    dismissNotice,
    unlock,
    done,
    retry,
    replay,
    announce,
    setSuspended,
    stop,
  };
}
