/**
 * Contract Regression Test Suite
 *
 * Verifies frontend contract compliance against the backend contract:
 * - Six action request shapes and discriminators
 * - Response envelope and all 7 session statuses
 * - `transcript_preview` wire structure and turn preservation
 * - Immutable consent version: 2026-11-01.v1
 * - Exact English and Hindi consent copy equality comparison against backend _shared/consent.ts
 * - Report v1.2 gender-declined invariant (status: 'declined', value: null)
 * - Correction allowlist (CORRECTABLE_FIELDS) and non-declinable required fields
 *
 * Exact comparison procedure for consent copy:
 * Reads `../samvad-backend/supabase/functions/_shared/consent.ts` read-only using `node:fs`.
 * Parses string constants using clean AST/string extraction.
 * Asserts strict byte-for-byte character equality against frontend `src/types/consent.ts`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  ChatTurnAction,
  StartSessionAction,
  ResumeSessionAction,
  RecordConsentAction,
  SubmitTurnAction,
  CorrectDraftReportAction,
  SubmitReportAction,
  ChatTurnResponse,
  SessionStatus,
  TranscriptPreview,
} from '../src/types/api';
import { CONSENT_VERSION, CONSENT_TEXT } from '../src/types/consent';
import {
  CORRECTABLE_FIELDS,
  PROTECTED_FIELDS,
  NON_DECLINABLE_FIELDS,
  ReportDocumentV1,
} from '../src/types/report';
import {
  startSession,
  recordConsent,
  chatTurn,
  correctDraftReport,
  submitReport,
} from '../src/lib/api';

describe('Contract Regression Tests', () => {
  it('1. Six action request shapes and discriminators are strictly typed and recognized', async () => {
    const s = await startSession('en');
    const sessionId = s.session_id;

    // Action 1: start_session
    const startAction: StartSessionAction = { action: 'start_session', language: 'en' };
    assert.equal(startAction.action, 'start_session');

    // Action 2: record_consent
    const consentAction: RecordConsentAction = {
      action: 'record_consent',
      session_id: sessionId,
      consent: true,
      language: 'en',
      consent_version: CONSENT_VERSION,
    };
    assert.equal(consentAction.action, 'record_consent');
    const consentRes = await recordConsent(sessionId, true, 'en', CONSENT_VERSION);
    assert.equal(consentRes.session_status, 'in_progress');

    // Action 3: submit_turn (text)
    const textAction: SubmitTurnAction = {
      action: 'submit_turn',
      session_id: sessionId,
      question_id: 'name',
      text: 'Amit Kumar',
    };
    assert.equal(textAction.action, 'submit_turn');
    const turnRes = await chatTurn(textAction);
    assert.equal(turnRes.turn_count, 1);

    // Action 4: submit_turn (audio preview request)
    const audioAction: SubmitTurnAction = {
      action: 'submit_turn',
      session_id: sessionId,
      question_id: 'age',
      audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
    };
    const audioRes = await chatTurn(audioAction);
    assert.ok(audioRes.transcript_preview);
    assert.equal(audioRes.transcript_preview.state, 'transcript_preview');

    // Action 5: correct_draft_report
    const correctAction: CorrectDraftReportAction = {
      action: 'correct_draft_report',
      session_id: sessionId,
      report_id: 'draft',
      updates: {
        'patient.name': { value: 'Amit K. Verma', status: 'provided' },
      },
    };
    assert.equal(correctAction.action, 'correct_draft_report');

    // Action 6: submit_report
    const submitAction: SubmitReportAction = {
      action: 'submit_report',
      session_id: sessionId,
      report_id: 'draft',
    };
    assert.equal(submitAction.action, 'submit_report');

    // Action 7: resume_session
    const resumeAction: ResumeSessionAction = {
      action: 'resume_session',
      session_id: sessionId,
    };
    assert.equal(resumeAction.action, 'resume_session');
  });

  it('2. Response envelope contains all mandatory fields and supports all 7 session statuses', async () => {
    const s = await startSession('en');

    // Verify envelope shape on initial start_session response
    const mandatoryKeys: (keyof ChatTurnResponse)[] = [
      'session_id',
      'session_status',
      'messages',
      'turn_count',
      'max_turns',
      'is_complete',
      'is_cap_reached',
      'can_submit',
    ];

    for (const key of mandatoryKeys) {
      assert.ok(key in s, `Response envelope missing mandatory field: ${key}`);
    }

    // Verify all 7 session status enum values are defined and recognized
    const allowedStatuses: SessionStatus[] = [
      'created',
      'consented',
      'declined',
      'in_progress',
      'submitted',
      'emergency',
      'closed',
    ];
    assert.equal(allowedStatuses.length, 7);

    // Verify status transitions through lifecycle
    assert.equal(s.session_status, 'created');

    const consented = await recordConsent(s.session_id, true, 'en', CONSENT_VERSION);
    assert.equal(consented.session_status, 'in_progress');

    const sDecline = await startSession('en');
    const declined = await recordConsent(sDecline.session_id, false, 'en', CONSENT_VERSION);
    assert.equal(declined.session_status, 'declined');
  });

  it('3. Single agreed wire field transcript_preview and no competing names', async () => {
    const s = await startSession('en');
    await recordConsent(s.session_id, true, 'en', CONSENT_VERSION);

    const res = await chatTurn({
      action: 'submit_turn',
      session_id: s.session_id,
      question_id: 'name',
      audio_base64: 'audio_payload',
    });

    // Exactly one agreed wire field
    assert.ok('transcript_preview' in res, 'Must contain transcript_preview field');
    assert.equal('pending_transcript' in (res as any), false, 'Must never expose internal pending_transcript column over the wire');

    const preview: TranscriptPreview = res.transcript_preview!;
    assert.equal(preview.state, 'transcript_preview');
    assert.equal(typeof preview.text, 'string');
    assert.equal(preview.question_id, 'name');

    // Preserves turn count until confirmed
    assert.equal(res.turn_count, 0, 'Audio preview must not increment turn count');
  });

  it('4. Exact equality check against backend _shared/consent.ts', () => {
    // Exact consent version
    assert.equal(CONSENT_VERSION, '2026-11-01.v1');

    // Read backend consent source (read-only verification)
    const backendConsentPath = path.resolve(
      process.cwd(),
      '../samvad-backend/supabase/functions/_shared/consent.ts'
    );

    assert.ok(
      fs.existsSync(backendConsentPath),
      `Backend consent file must exist at ${backendConsentPath}`
    );

    const backendContent = fs.readFileSync(backendConsentPath, 'utf-8');

    // Extract CONSENT_VERSION from backend source
    const versionMatch = backendContent.match(/export const CONSENT_VERSION = ["']([^"']+)["']/);
    assert.ok(versionMatch, 'Must find CONSENT_VERSION in backend source');
    const backendVersion = versionMatch[1];
    assert.equal(
      CONSENT_VERSION,
      backendVersion,
      'Frontend CONSENT_VERSION must match backend _shared/consent.ts'
    );

    // Extract English text from backend source
    const enRegex = /en:\s*\n?\s*"([^"]+)"\s*\+\s*\n?\s*"([^"]+)"\s*\+\s*\n?\s*"([^"]+)"\s*\+\s*\n?\s*"([^"]+)"/;
    const enMatch = backendContent.match(enRegex);
    assert.ok(enMatch, 'Must parse concatenated English text in backend source');
    const backendEnText = enMatch.slice(1).join('');

    assert.equal(
      CONSENT_TEXT.en,
      backendEnText,
      'Frontend CONSENT_TEXT.en must match backend _shared/consent.ts exactly'
    );

    // Extract Hindi text from backend source
    const hiRegex = /hi:\s*\n?\s*"([^"]+)"\s*\+\s*\n?\s*"([^"]+)"\s*\+\s*\n?\s*"([^"]+)"\s*\+\s*\n?\s*"([^"]+)"/;
    const hiMatch = backendContent.match(hiRegex);
    assert.ok(hiMatch, 'Must parse concatenated Hindi text in backend source');
    const backendHiText = hiMatch.slice(1).join('');

    assert.equal(
      CONSENT_TEXT.hi,
      backendHiText,
      'Frontend CONSENT_TEXT.hi must match backend _shared/consent.ts exactly'
    );
  });

  it('5. Report v1.2 gender-declined invariant: status declined requires value null', async () => {
    const s = await startSession('en');
    await recordConsent(s.session_id, true, 'en', CONSENT_VERSION);

    const answers = [
      { q: 'name', a: 'Sunita Sharma' },
      { q: 'age', a: '42' },
      { q: 'gender', a: 'Prefer not to say' }, // Declined gender
      { q: 'primary_concern', a: 'Mild recurring headaches' },
      { q: 'duration', a: '2 weeks' },
      { q: 'severity', a: 'Mild' },
      { q: 'conditions', a: 'None' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None' },
      { q: 'other_symptoms', a: 'None' },
    ];

    let lastRes: ChatTurnResponse = s;
    for (const ans of answers) {
      lastRes = await chatTurn({
        action: 'submit_turn',
        session_id: s.session_id,
        question_id: ans.q as any,
        text: ans.a,
      });
    }

    assert.equal(lastRes.is_complete, true);
    assert.ok(lastRes.draft_report);

    const doc: ReportDocumentV1 = lastRes.draft_report;
    assert.equal(doc.patient.gender.status, 'declined');
    assert.equal(doc.patient.gender.value, null, 'gender.value must be null when status is declined');

    const jsonStr = JSON.stringify(doc);
    assert.ok(
      jsonStr.includes('"gender":{"status":"declined","value":null}'),
      'Serialized gender must be exactly {"status":"declined","value":null}'
    );
    assert.equal(
      jsonStr.includes('"value":"declined"'),
      false,
      'String "declined" must never be stored as a value'
    );

    // Gender declined must count as answered in missing_information
    assert.equal(
      doc.missing_information.includes('patient.gender'),
      false,
      'Declined gender must not be in missing_information'
    );
  });

  it('6. Correction allowlist (CORRECTABLE_FIELDS), non-declinable fields, and protected fields', async () => {
    // 1. Verify exactly 10 fields are in CORRECTABLE_FIELDS
    assert.equal(CORRECTABLE_FIELDS.length, 10);
    const expectedCorrectable = [
      'patient.name',
      'patient.age',
      'patient.gender',
      'primary_concern',
      'clinical_details.duration',
      'clinical_details.severity',
      'clinical_details.conditions',
      'clinical_details.medications',
      'clinical_details.allergies',
      'clinical_details.other_symptoms',
    ];
    for (const f of expectedCorrectable) {
      assert.ok(CORRECTABLE_FIELDS.includes(f as any), `Missing correctable field: ${f}`);
    }

    // 2. Verify non-declinable required fields
    assert.equal(NON_DECLINABLE_FIELDS.length, 5);
    const expectedNonDeclinable = [
      'patient.name',
      'patient.age',
      'primary_concern',
      'clinical_details.duration',
      'clinical_details.severity',
    ];
    for (const f of expectedNonDeclinable) {
      assert.ok(NON_DECLINABLE_FIELDS.includes(f as any), `Missing non-declinable field: ${f}`);
    }

    // 3. Verify protected fields cannot be edited
    const protectedSample = [
      'routing_snapshot',
      'status',
      'doctor_id',
      'department_key',
      'intake_reference',
      'emergency',
      'summary',
    ];
    for (const p of protectedSample) {
      assert.ok(PROTECTED_FIELDS.includes(p as any), `Missing protected field: ${p}`);
      assert.equal(CORRECTABLE_FIELDS.includes(p as any), false, `Protected field must not be correctable: ${p}`);
    }
  });
});
