/**
 * Conversation driver for the local API suite.
 *
 * Drives the real chat-turn machine through src/lib/api.ts exactly as the browser does:
 * one `submit_turn` per current question, scripted and adaptive, no direct database
 * writes.
 */

import type { ChatTurnResponse, CurrentQuestion } from '../../src/types/api';

export type Api = typeof import('../../src/lib/api');

export interface IntakeState {
  response: ChatTurnResponse;
  questions: string[];
}

const BANK_ID = /^(GM|ORTH|SURG|DERM|CARD)-\d{3}$/;

export function isBankQuestion(id: string): boolean {
  return BANK_ID.test(id);
}

/**
 * A plausible answer for a question the test does not script explicitly.
 * Choice questions use the first localised option, free-text bank questions get a
 * neutral sentence that never contains an emergency phrase.
 */
export function defaultAnswer(question: CurrentQuestion): string {
  if (question.options && question.options.length > 0) return question.options[0];
  return 'no other symptoms';
}

/**
 * Answers `scripted` by question id, then keeps answering with defaults until the
 * intake reports completion, the turn cap, or an emergency.
 *
 * `stopAfter` bounds the loop so a state-machine regression cannot spin forever.
 */
export async function driveIntake(
  api: Api,
  sessionId: string,
  scripted: Record<string, string>,
  options: { maxTurns?: number } = {},
): Promise<IntakeState> {
  const maxTurns = options.maxTurns ?? 20;
  const questions: string[] = [];
  let response = await api.resumeSession(sessionId);

  for (let step = 0; step < maxTurns; step += 1) {
    const question = response.current_question;
    if (!question) break;
    questions.push(question.id);

    const answer = scripted[question.id] ?? defaultAnswer(question);
    response = await api.chatTurn({
      action: 'submit_turn',
      session_id: sessionId,
      question_id: question.id,
      text: answer,
    });

    if (response.emergency_triggered) break;
    if (response.is_complete || response.is_cap_reached) break;
  }

  return { response, questions };
}

/** Fully answered scripted intake (name → other_symptoms). */
export const COMPLETE_ANSWERS: Record<string, string> = {
  name: 'Asha API Test',
  age: '34',
  gender: 'Prefer not to say',
  primary_concern: 'recurring evening fever with body ache',
  duration: 'about three weeks',
  severity: 'moderate',
  conditions: 'none',
  medications: 'none',
  allergies: 'none known',
  other_symptoms: 'no other symptoms',
};
