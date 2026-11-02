/**
 * Patient navigation invariants (D-02, D-10, D-11, D-37, D-39).
 *
 * The patient flow is a single state machine. Navigation is the one place where a
 * safety state can be lost, so the rules live here as pure functions and are covered
 * by regression tests instead of being re-implemented inside the shell.
 */

export type PatientScreen =
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

/**
 * Screens that terminate the flow for this session.
 *
 * `emergency` is terminal because the 112 guidance must never be dismissed by
 * navigation, and routine intake must never resume on an emergency session.
 * The two confirmation screens are terminal because the report is already submitted
 * and (optionally) booked; returning to a bookable grid would allow a duplicate
 * booking attempt. `session_ended` and `consent_declined` carry no data forward.
 */
export const TERMINAL_PATIENT_SCREENS: readonly PatientScreen[] = [
  'emergency',
  'confirmed_booking',
  'confirmed_report_only',
  'session_ended',
  'consent_declined',
] as const;

export function isTerminalPatientScreen(screen: PatientScreen): boolean {
  return TERMINAL_PATIENT_SCREENS.includes(screen);
}

/** Deterministic predecessor used when no history entry exists. */
export const FALLBACK_PATIENT_SCREEN: Readonly<Record<PatientScreen, PatientScreen>> = {
  welcome: 'welcome',
  consent: 'welcome',
  consent_declined: 'welcome',
  session_ended: 'welcome',
  emergency: 'welcome',
  conversation: 'consent',
  what_we_heard: 'conversation',
  review: 'conversation',
  booking: 'review',
  confirmed_booking: 'booking',
  confirmed_report_only: 'booking',
};

export type BackDecision =
  | { action: 'navigate'; target: PatientScreen; reason: 'history' | 'fallback' }
  | { action: 'blocked'; reason: 'terminal' | 'would_leak_submitted_report' };

export interface BackNavigationInput {
  currentScreen: PatientScreen;
  history: readonly PatientScreen[];
  /** True when the session already has a submitted report. */
  hasSubmittedReport?: boolean;
  /** True when the patient already holds a confirmed appointment. */
  hasAppointment?: boolean;
}

/**
 * Decide what Back does.
 *
 * - Terminal screens never navigate; this is the emergency/confirmation guard.
 * - A submitted report never returns to the editable draft screen.
 * - Otherwise the previous history entry is used, then the deterministic fallback.
 */
export function resolveBackNavigation(input: BackNavigationInput): BackDecision {
  const { currentScreen, history, hasSubmittedReport, hasAppointment } = input;

  if (isTerminalPatientScreen(currentScreen)) {
    return { action: 'blocked', reason: 'terminal' };
  }

  // A confirmed appointment cannot be reached from a non-confirmation screen, but if
  // the shell ever offers Back there it must not re-open a bookable grid.
  if (hasAppointment && currentScreen === 'booking') {
    return { action: 'blocked', reason: 'would_leak_submitted_report' };
  }

  const candidate = history.length > 0 ? history[history.length - 1] : undefined;
  const target = candidate && candidate !== currentScreen ? candidate : FALLBACK_PATIENT_SCREEN[currentScreen];

  if (target === currentScreen) {
    return { action: 'blocked', reason: 'terminal' };
  }

  // `review` is allowed as a Back target after submission, but the review screen is
  // then rendered read-only via reviewModeFor() so the draft editor cannot reappear.
  void hasSubmittedReport;
  return { action: 'navigate', target, reason: candidate ? 'history' : 'fallback' };
}

/**
 * Whether the review screen must render as a read-only submitted summary.
 * D-37: returning from booking must not re-open the draft editor.
 */
export function reviewModeFor(hasSubmittedReport: boolean | undefined): 'draft' | 'submitted' {
  return hasSubmittedReport ? 'submitted' : 'draft';
}

/**
 * Whether the conversation screen is in the documented dead-end state
 * (D-39): no question, no completion, no cap and nothing processing.
 */
export function isConversationDeadEnd(input: {
  hasCurrentQuestion: boolean;
  isComplete?: boolean;
  isCapReached?: boolean;
  isProcessing?: boolean;
  demoBusy?: boolean;
  sessionStatus?: string;
}): boolean {
  if (input.hasCurrentQuestion) return false;
  if (input.isComplete) return false;
  if (input.isCapReached) return false;
  if (input.isProcessing) return false;
  if (input.demoBusy) return false;
  if (input.sessionStatus === 'emergency') return false;
  if (input.sessionStatus === 'ended' || input.sessionStatus === 'declined') return false;
  return input.sessionStatus === 'in_progress' || input.sessionStatus === 'consented';
}
