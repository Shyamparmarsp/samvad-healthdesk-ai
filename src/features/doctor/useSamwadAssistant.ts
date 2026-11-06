import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDoctorAppointments,
  getDoctorReportDetail,
  getDoctorReports,
  speakDoctorSummary,
} from '../../lib/api';
import { createAudioPlayback, type AudioPlayback } from '../../lib/audio/playback';
import { filterReportsByTab } from './DoctorReportsList';
import {
  buildAppointmentsFacts,
  buildDashboardFacts,
  buildReportDetailFacts,
  buildReportsFacts,
  buildUrgentDetailFacts,
  buildUrgentReviewFacts,
  renderHindiSummary,
  type AppointmentTab,
  type ReportFilterTab,
  type SummaryFacts,
} from '../../lib/assistant-summary';
import type { ReportRow } from '../../types/report';

/**
 * The page the assistant is currently mounted on. Each doctor view passes the state a
 * human would look at: the active tab, the search text, or the selected report.
 */
export type AssistantPage =
  | { kind: 'dashboard' }
  | { kind: 'reports'; tab: ReportFilterTab; searchQuery: string }
  | { kind: 'appointments'; tab: AppointmentTab }
  | { kind: 'report_detail'; report: ReportRow }
  | { kind: 'urgent_detail'; report: ReportRow }
  | { kind: 'urgent_review' };

/**
 * The signed-in doctor. In Supabase mode RLS already scopes every read; passing the id
 * keeps the offline mock backend on exactly the same records the page shows.
 */
export type AssistantDoctorId = string | undefined;

export type AssistantStatus = 'idle' | 'loading' | 'ready' | 'error';
export type AssistantAudioState =
  | 'idle'
  | 'loading'
  /** Audio received; waiting for the browser to confirm playback actually started. */
  | 'starting'
  | 'playing'
  | 'blocked'
  | 'ended'
  | 'unavailable'
  | 'stopped';
export type AssistantErrorKind = 'data' | 'summary' | null;
/** How the panel opened. Only a user click is allowed to move keyboard focus. */
export type AssistantOpenSource = 'user' | 'auto' | null;

export interface UseSamwadAssistant {
  isOpen: boolean;
  openSource: AssistantOpenSource;
  status: AssistantStatus;
  text: string | null;
  audio: AssistantAudioState;
  errorKind: AssistantErrorKind;
  isBusy: boolean;
  open: () => void;
  close: () => void;
  retry: () => void;
  play: () => void;
  stop: () => void;
}

interface Options {
  page: AssistantPage;
  doctorId?: string;
  /** True on the dashboard only. */
  autoGreet: boolean;
  /** Incremented by the shell on every dashboard entry (login, or return to the tab). */
  greetingToken: number;
  /** Shell data finished loading successfully. */
  dataReady: boolean;
  /** Shell data failed to load: the greeting must stay silent. */
  dataFailed: boolean;
}

const GREETING_DELAY_MS = 1000;
const AUDIO_SAFETY_MS = 60_000;

/** Builds the fact set from RLS-scoped, freshly read rows. Never from UI placeholders. */
async function buildFacts(
  page: AssistantPage,
  doctorId: AssistantDoctorId,
  intent: 'greeting' | 'summary',
): Promise<SummaryFacts> {
  switch (page.kind) {
    case 'dashboard': {
      const [reports, appointments] = await Promise.all([
        getDoctorReports(doctorId),
        getDoctorAppointments(doctorId),
      ]);
      return buildDashboardFacts({ reports, appointments, intent });
    }
    case 'reports': {
      const [reports, appointments] = await Promise.all([
        getDoctorReports(doctorId),
        getDoctorAppointments(doctorId),
      ]);
      const booked = new Set(
        appointments.filter((appointment) => appointment.status === 'confirmed').map((appointment) => appointment.report_id),
      );
      const displayed = filterReportsByTab(reports, page.tab, booked, page.searchQuery);
      return buildReportsFacts({ displayed, tab: page.tab, search: page.searchQuery });
    }
    case 'appointments': {
      const appointments = await getDoctorAppointments(doctorId);
      return buildAppointmentsFacts({ appointments, tab: page.tab });
    }
    case 'report_detail': {
      // Re-read the selected report so a just-completed review is not summarised as pending.
      const fresh = await getDoctorReportDetail(page.report.id).catch(() => null);
      return buildReportDetailFacts(fresh ?? page.report);
    }
    case 'urgent_detail': {
      const [fresh, reports] = await Promise.all([
        getDoctorReportDetail(page.report.id).catch(() => null),
        getDoctorReports(doctorId),
      ]);
      return buildUrgentDetailFacts(
        fresh ?? page.report,
        reports.filter((report) => report.status === 'urgent_partial'),
      );
    }
    case 'urgent_review': {
      const reports = await getDoctorReports(doctorId);
      return buildUrgentReviewFacts(reports.filter((report) => report.status === 'urgent_partial'));
    }
  }
}

/**
 * Assistant controller.
 *
 * Guarantees:
 *   - a stale response can never overwrite a newer summary (single in-flight request id);
 *   - the greeting fires once per dashboard entry, 1s after the data is ready;
 *   - one audio channel per mounted page, so two summaries can never overlap;
 *   - if the data request fails, no greeting is spoken.
 */
export function useSamwadAssistant(options: Options): UseSamwadAssistant {
  const { page, doctorId, autoGreet, greetingToken, dataReady, dataFailed } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [openSource, setOpenSource] = useState<AssistantOpenSource>(null);
  const [status, setStatus] = useState<AssistantStatus>('idle');
  const [text, setText] = useState<string | null>(null);
  const [audio, setAudio] = useState<AssistantAudioState>('idle');
  const [errorKind, setErrorKind] = useState<AssistantErrorKind>(null);

  const pageRef = useRef(page);
  pageRef.current = page;
  /** Synchronously true while a summary request is in flight. */
  const busyRef = useRef(false);
  const doctorIdRef = useRef(doctorId);
  doctorIdRef.current = doctorId;

  const requestRef = useRef(0);
  const factsRef = useRef<SummaryFacts | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playbackRef = useRef<AudioPlayback | null>(null);
  const greetedTokenRef = useRef(0);
  const hasRequestedRef = useRef(false);

  const getPlayback = (): AudioPlayback => {
    if (!playbackRef.current) {
      playbackRef.current = createAudioPlayback({ safetyMs: AUDIO_SAFETY_MS });
    }
    return playbackRef.current;
  };

  const releaseAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  /**
   * Requests the server-generated summary and plays it.
   *
   * The Edge Function phrases the facts with Groq Qwen, validates the answer, and returns
   * the accepted Hindi sentence alongside the audio. The panel shows exactly that
   * sentence, so an unvalidated model answer is never displayed and the spoken and visible
   * text are identical. `requestId` makes a stale response a no-op.
   */
  const requestSummary = useCallback(
    async (facts: SummaryFacts, requestId: number) => {
      setAudio('loading');
      let result: { audioUrl?: string; text?: string };
      try {
        result = await speakDoctorSummary(facts);
      } catch {
        if (requestId !== requestRef.current) return;
        setStatus('error');
        setErrorKind('summary');
        setAudio('idle');
        return;
      }
      if (requestId !== requestRef.current) {
        if (result.audioUrl) URL.revokeObjectURL(result.audioUrl);
        return;
      }

      const summary = result.text?.trim() ? result.text : null;
      if (!summary && !result.audioUrl) {
        setStatus('error');
        setErrorKind('summary');
        setAudio('idle');
        return;
      }

      // A server that returned audio without its accepted sentence would make the screen
      // and the voice disagree, so the deterministic sentence is shown only as a last
      // resort (never for a validated Qwen answer, which always arrives in `text`).
      setText(summary ?? renderHindiSummary(facts));
      setStatus('ready');

      if (!result.audioUrl) {
        // Hindi text stays on screen; the provider simply has no audio for this summary.
        setAudio('unavailable');
        return;
      }

      releaseAudioUrl();
      audioUrlRef.current = result.audioUrl;
      // "Speaking" is only claimed once play() resolves (audio really started).
      setAudio('starting');
      const played = await getPlayback().play(result.audioUrl, {
        onStart: () => {
          if (requestId === requestRef.current) setAudio('playing');
        },
      });
      if (requestId !== requestRef.current) return;
      if (played.ok) setAudio('ended');
      else if (played.reason === 'blocked') setAudio('blocked');
      else if (played.reason === 'cancelled') setAudio('stopped');
      else setAudio('unavailable');
    },
    [releaseAudioUrl],
  );

  const runSummary = useCallback(
    async (intent: 'greeting' | 'summary', gate?: Promise<void>) => {
      const requestId = ++requestRef.current;
      hasRequestedRef.current = true;
      busyRef.current = true;
      setIsOpen(true);
      setOpenSource((current) => current ?? 'auto');
      setStatus('loading');
      setErrorKind(null);
      setAudio('idle');
      setText(null);
      releaseAudioUrl();

      try {
        // Wait for the in-gesture audio unlock to start before cancelling the previous
        // sentence. Cancelling it first aborts the silent clip and, in the old code, left
        // the element muted so the new summary played silently.
        if (gate) await gate;
        if (requestId !== requestRef.current) return;
        playbackRef.current?.stop();

        let facts: SummaryFacts;
        try {
          facts = await buildFacts(pageRef.current, doctorIdRef.current, intent);
        } catch {
          if (requestId !== requestRef.current) return;
          setStatus('error');
          setErrorKind('data');
          return;
        }
        if (requestId !== requestRef.current) return;

        factsRef.current = facts;
        await requestSummary(facts, requestId);
      } finally {
        if (requestId === requestRef.current) busyRef.current = false;
      }
    },
    [releaseAudioUrl, requestSummary],
  );

  /**
   * The doctor's click. It always starts a fresh summary for the current page, even when
   * the panel is already open, and it unlocks audio synchronously inside the gesture so
   * the later `play()` is allowed.
   */
  const open = useCallback(() => {
    // A summary is already being generated: show it instead of buying a second TTS call
    // or starting overlapping audio.
    if (busyRef.current) {
      setIsOpen(true);
      return;
    }

    const playback = getPlayback();
    const gate = playback.unlock();
    setIsOpen(true);
    setOpenSource('user');
    void runSummary('summary', gate);
  }, [runSummary]);

  const close = useCallback(() => {
    playbackRef.current?.stop();
    setAudio((current) =>
      current === 'playing' || current === 'starting' || current === 'loading' ? 'stopped' : current,
    );
    setIsOpen(false);
    setOpenSource(null);
  }, []);

  const retry = useCallback(() => {
    const gate = getPlayback().unlock();
    void runSummary('summary', gate);
  }, [runSummary]);

  /**
   * Replay. Runs inside the button's own gesture, so the unlock always completes before
   * playback starts and the retry never plays a silently muted element.
   */
  const play = useCallback(() => {
    const playback = getPlayback();
    const requestId = requestRef.current;
    setAudio('loading');
    void playback.unlock().then(async () => {
      if (requestId !== requestRef.current) return;
      if (audioUrlRef.current) {
        setAudio('starting');
        const result = await playback.play(audioUrlRef.current, {
          onStart: () => {
            if (requestId === requestRef.current) setAudio('playing');
          },
        });
        if (requestId !== requestRef.current) return;
        if (result.ok) setAudio('ended');
        else if (result.reason === 'blocked') setAudio('blocked');
        else if (result.reason === 'cancelled') setAudio('stopped');
        else setAudio('unavailable');
        return;
      }
      const facts = factsRef.current;
      if (facts) await requestSummary(facts, requestId);
    });
  }, [requestSummary]);

  const stop = useCallback(() => {
    playbackRef.current?.stop();
    setAudio('stopped');
  }, []);

  /** Automatic dashboard briefing: once per entry, 1s after the dashboard data is ready. */
  useEffect(() => {
    if (!autoGreet || greetingToken <= 0) return;
    if (!dataReady || dataFailed) return;
    if (greetedTokenRef.current === greetingToken) return;
    if (hasRequestedRef.current && status !== 'idle') return;

    const timer = setTimeout(() => {
      greetedTokenRef.current = greetingToken;
      void runSummary('greeting');
    }, GREETING_DELAY_MS);
    return () => clearTimeout(timer);
    // `status` is deliberately not a dependency: incidental state updates must not
    // reschedule the briefing. The guard above only reads it at entry time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGreet, greetingToken, dataReady, dataFailed, runSummary]);

  useEffect(() => {
    return () => {
      playbackRef.current?.stop();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  return {
    isOpen,
    openSource,
    status,
    text,
    audio,
    errorKind,
    isBusy: status === 'loading' || audio === 'loading',
    open,
    close,
    retry,
    play,
    stop,
  };
}
