/**
 * Speaks owner-approved system messages (completion, report instruction, send confirmation).
 *
 * These are not questions, so they go through `speak` with an allowlisted `message_id`
 * instead of a question id. The message is spoken once per session and language, uses the
 * same unlocked playback channel as the conversation, and never blocks navigation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { speak as speakApi, type SystemMessageId } from '../../lib/api';
import { createAudioPlayback, type AudioPlayback } from '../../lib/audio/playback';

export interface SystemSpeech {
  /** Speaks once per session/message/language; later calls are no-ops. */
  speak: (messageId: SystemMessageId) => Promise<void>;
  speaking: boolean;
  /** True when the message could not be played (text is still shown on screen). */
  unavailable: boolean;
}

export function useSystemSpeech(sessionId: string, language: 'en' | 'hi'): SystemSpeech {
  const [speaking, setSpeaking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const playedRef = useRef<Set<string>>(new Set());
  const playbackRef = useRef<AudioPlayback | null>(null);

  useEffect(() => {
    return () => {
      playbackRef.current?.stop();
    };
  }, []);

  const speak = useCallback(
    async (messageId: SystemMessageId) => {
      if (!sessionId) return;
      const key = `${sessionId}:${messageId}:${language}`;
      if (playedRef.current.has(key)) return;
      playedRef.current.add(key);

      try {
        const result = await speakApi(sessionId, null, messageId);
        if (!result.audioUrl) {
          setUnavailable(true);
          return;
        }
        const playback = playbackRef.current ?? (playbackRef.current = createAudioPlayback());
        setSpeaking(true);
        const played = await playback.play(result.audioUrl);
        if (!played.ok) setUnavailable(true);
      } catch {
        setUnavailable(true);
      } finally {
        setSpeaking(false);
      }
    },
    [sessionId, language],
  );

  return { speak, speaking, unavailable };
}
