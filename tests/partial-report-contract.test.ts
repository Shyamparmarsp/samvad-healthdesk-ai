/**
 * Partial-report contract guard.
 *
 * The owner asked for "generate a report after one answer and send it to the doctor".
 * Before release we must know exactly what report schema v1.2 can and cannot represent.
 * These tests pin the facts, so the release decision is based on evidence rather than
 * opinion:
 *
 *   - a partial field map produces a schema-valid document whose unanswered fields keep an
 *     explicit missing status (`not_asked` / `not_provided`), never "none";
 *   - `declined` (the patient said no) stays distinct from `not_asked` (never asked);
 *   - `missing_information` lists what is unanswered;
 *   - completion is a separate gate: one answer is not complete, so `submit_report`
 *     refuses to send it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer, parseAnswer } from '../supabase/functions/_shared/conversation';
import {
  buildReportDocument,
  emptyFieldMap,
  isComplete,
  missingInformation,
  templateSummary,
  validateReportDocument,
} from '../supabase/functions/_shared/report';
import type { RoutingSnapshot } from '../supabase/functions/_shared/contract';

const ROUTING: RoutingSnapshot = {
  department_key: 'general_medicine',
  department_name: 'General Medicine',
  doctor_id: 'doc-gm',
  doctor_name: 'Dr. Aditi Rao',
  is_fallback: true,
  preliminary: true,
};

function answerOne() {
  const parsed = parseAnswer('name', 'Synthetic Patient');
  assert.ok(parsed);
  return applyAnswer(emptyFieldMap(), parsed!);
}

describe('Partial intake represents honestly in report schema v1.2', () => {
  it('1. one accepted answer is not a complete intake', () => {
    const fields = answerOne();
    assert.equal(isComplete(fields), false, 'completion gate stays closed');
  });

  it('2. unanswered fields keep an explicit missing status, never a finding', () => {
    const fields = answerOne();
    const doc = buildReportDocument({
      language: 'en',
      fields,
      routing: ROUTING,
      status: 'draft',
      summary: templateSummary(fields),
    });

    assert.equal(doc.patient.name.status, 'provided');
    assert.equal(doc.clinical_details.allergies.status, 'not_asked', 'never asked stays not_asked');
    assert.equal(doc.clinical_details.allergies.value, null, 'no value is invented');
    assert.equal(doc.clinical_details.medications.status, 'not_asked');
    assert.equal(doc.clinical_details.conditions.status, 'not_asked');
    assert.equal(doc.clinical_details.other_symptoms.status, 'not_asked');
    assert.equal(doc.clinical_details.duration.status, 'not_asked');
    assert.equal(doc.primary_concern.status, 'not_asked');

    // The document is still structurally valid — the *status values* carry the truth.
    assert.deepEqual(validateReportDocument(doc), [], 'schema-valid document');
  });

  it('3. a declined answer is never the same as an unanswered one', () => {
    let fields = answerOne();
    const declined = parseAnswer('allergies', 'prefer not to say');
    assert.ok(declined);
    fields = applyAnswer(fields, declined!);

    assert.equal(fields['clinical_details.allergies'].status, 'declined');
    assert.equal(fields['clinical_details.medications'].status, 'not_asked');

    const doc = buildReportDocument({
      language: 'en',
      fields,
      routing: ROUTING,
      status: 'draft',
      summary: templateSummary(fields),
    });
    assert.equal(doc.clinical_details.allergies.status, 'declined');
    assert.equal(doc.clinical_details.allergies.value, null, 'declined carries no value');
    assert.notEqual(doc.clinical_details.allergies.status, doc.clinical_details.medications.status);
  });

  it('4. missing_information lists every unanswered field', () => {
    const fields = answerOne();
    const missing = missingInformation(fields);
    assert.ok(missing.includes('patient.age'));
    assert.ok(missing.includes('primary_concern'));
    assert.ok(missing.includes('clinical_details.allergies'));
    assert.ok(!missing.includes('patient.name'), 'the provided field is not listed');
  });

  it('5. a name-only partial has no reportable summary (normal reports require one)', () => {
    // docs/report-design.md §7: a normal draft/submitted report has a summary object with
    // text/source/generated_from. Only urgent_partial may carry summary: null.
    const summary = templateSummary(answerOne());
    assert.equal(summary, null, 'nothing beyond the name is reportable');

    const doc = buildReportDocument({
      language: 'en',
      fields: answerOne(),
      routing: ROUTING,
      status: 'draft',
      summary: templateSummary(answerOne()),
    });
    assert.equal(doc.summary, null, 'a normal report with summary: null breaks the contract');
  });

  it('6. a summary built from real answers never turns absence into a negative finding', () => {
    let fields = answerOne();
    const concern = parseAnswer('primary_concern', 'knee pain when walking');
    assert.ok(concern);
    fields = applyAnswer(fields, concern!);

    const summary = templateSummary(fields);
    assert.ok(summary, 'a reportable answer produces a summary');
    const text = summary!.text.toLowerCase();
    for (const forbidden of ['no allergies', 'no medications', 'denies', 'negative for', 'normal']) {
      assert.equal(text.includes(forbidden), false, `summary must not claim "${forbidden}"`);
    }
    assert.ok(text.includes('knee pain when walking'), 'the provided answer is restated');
  });
});
