import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationView } from '../src/features/patient/ConversationView';
import type { ChatMessage } from '../src/types/api';

const messages: ChatMessage[] = [
  {
    id: 'm1',
    session_id: 's1',
    role: 'patient',
    content: 'nhi',
    question_id: 'medications',
    created_at: new Date().toISOString(),
    turn_index: 8,
  },
  {
    id: 'm2',
    session_id: 's1',
    role: 'patient',
    content: 'nhi',
    question_id: 'allergies',
    created_at: new Date().toISOString(),
    turn_index: 9,
  },
];

function render(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(ConversationView, {
      messages: [],
      currentQuestion: { id: 'name', text: 'What is your full name?' },
      turnCount: 10,
      maxTurns: 15,
      onSendText: () => {},
      onReplayAudio: () => {},
      onBack: () => {},
      isProcessing: false,
      sessionStatus: 'in_progress',
      ...extra,
    } as never),
  );
}

const countOccurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('Conversation completion experience', () => {
  it('1. a completed-but-unasked intake no longer says the session cannot continue', () => {
    const html = render({
      messages,
      currentQuestion: undefined,
      canFinish: true,
      onFinish: () => {},
      onEndSession: () => {},
      onRequestExit: () => {},
    });
    assert.equal(html.includes('This session cannot continue'), false, 'dead-end copy removed');
    assert.ok(html.includes('Your pre-visit summary is ready'), 'completion copy shown');
    assert.ok(
      html.includes('Please review it and select Send to Doctor'),
      'report-section instruction shown',
    );
  });

  it('2. exactly one Finish & Send action is rendered', () => {
    const html = render({
      messages,
      currentQuestion: undefined,
      canFinish: true,
      onFinish: () => {},
      onEndSession: () => {},
      onRequestExit: () => {},
    });
    assert.equal(
      countOccurrences(html, 'Finish &amp; Send to Doctor'),
      1,
      'no duplicated primary action',
    );
    assert.equal(countOccurrences(html, 'End session'), 1, 'one privacy action');
  });

  it('3. with fewer than three answers the honest dead end is kept', () => {
    const html = render({
      messages,
      currentQuestion: undefined,
      canFinish: false,
      onEndSession: () => {},
      onRequestExit: () => {},
    });
    assert.ok(html.includes('This session cannot continue'), 'still honest without a report');
    assert.equal(html.includes('Your pre-visit summary is ready'), false);
  });

  it('4. the early-finish action is offered while questions continue', () => {
    const html = render({ canFinish: true, onFinish: () => {}, onRequestExit: () => {} });
    assert.equal(countOccurrences(html, 'Finish &amp; Send to Doctor'), 1);
    assert.ok(html.includes('You have enough for a pre-visit summary'), 'patient keeps control');
  });

  it('5. two identical answers are shown under the questions they answered', () => {
    const html = render({
      messages,
      currentQuestion: { id: 'other_symptoms', text: 'Any other symptoms?' },
      turnCount: 10,
      questionTexts: {
        medications: { en: 'Are you taking any medicines?', hi: 'क्या आप कोई दवा ले रहे हैं?' },
        allergies: { en: 'Do you have any allergies?', hi: 'क्या आपको कोई एलर्जी है?' },
      },
    });
    assert.ok(html.includes('data-history-question="medications"'), 'medications question rendered');
    assert.ok(html.includes('data-history-question="allergies"'), 'allergies question rendered');
    assert.equal(countOccurrences(html, '>nhi<'), 2, 'both answers remain visible');
  });

  it('6. the transcript does not repeat the optimistic transcript bubble', () => {
    const html = render({
      messages: [{ ...messages[0], content: 'Synthetic answer' }],
      currentQuestion: { id: 'age', text: 'How old are you?' },
      pendingTranscript: 'Synthetic answer',
    });
    assert.equal(
      countOccurrences(html, 'Synthetic answer'),
      1,
      'a stored answer is not rendered twice',
    );
  });
});
