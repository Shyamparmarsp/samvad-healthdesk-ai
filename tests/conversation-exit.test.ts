import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationView } from '../src/features/patient/ConversationView';
import { EmergencyView } from '../src/features/patient/EmergencyView';

const QUESTION = { id: 'name', text: 'What is your full name?' };

function renderConversation(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(ConversationView, {
      messages: [],
      currentQuestion: QUESTION,
      turnCount: 1,
      maxTurns: 15,
      onSendText: () => {},
      onReplayAudio: () => {},
      onBack: () => {},
      isProcessing: false,
      ...extra,
    } as never),
  );
}

describe('Conversation Back/Exit control', () => {
  it('1. the header exposes a persistent top-left exit control', () => {
    const html = renderConversation();
    assert.ok(html.includes('aria-label="Go back"'), 'exit control is present');
  });

  it('2. the confirmation dialog appears only when requested', () => {
    assert.equal(renderConversation().includes('role="dialog"'), false, 'closed by default');

    const open = renderConversation({
      exitDialogOpen: true,
      onRequestExit: () => {},
      onCancelExit: () => {},
      onConfirmExit: () => {},
    });
    assert.ok(open.includes('role="dialog"'), 'dialog opens');
    assert.ok(open.includes('aria-modal="true"'), 'modal semantics');
    assert.ok(open.includes('Leave session?'), 'title copy');
    assert.ok(open.includes('Continue session'), 'safe action');
    assert.ok(open.includes('Leave session'), 'leave action');
    // Truthful copy: answers persist, nothing was sent to the hospital.
    assert.ok(open.includes('saved'), 'copy states the answers are saved');
    assert.ok(open.includes('No report has been sent to the hospital'), 'no false submission claim');
    assert.equal(open.includes('saved as a draft'), false, 'does not promise a draft report');
  });

  it('3. the dialog is a labelled, described modal', () => {
    const html = renderConversation({
      exitDialogOpen: true,
      onRequestExit: () => {},
      onCancelExit: () => {},
      onConfirmExit: () => {},
    });
    assert.ok(html.includes('aria-labelledby="confirm-dialog-title"'), 'labelled by its title');
    assert.ok(html.includes('aria-describedby="confirm-dialog-description"'), 'described by its text');
  });
});

describe('Emergency guidance is never hidden by navigation', () => {
  it('4. the emergency screen shows 112 guidance and no ordinary back control', () => {
    const html = renderToStaticMarkup(React.createElement(EmergencyView, { onEndDemo: () => {} }));
    assert.ok(html.includes('112'), '112 guidance is visible');
    assert.equal(html.includes('aria-label="Go back"'), false, 'no back action on the emergency screen');
    assert.ok(/emergency/i.test(html), 'emergency context is stated');
  });
});
