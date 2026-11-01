import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  startSession,
  recordConsent,
  chatTurn,
  resumeSession,
  correctDraftReport,
  submitReport,
  bookAppointment,
  getAvailableSlots,
  getDoctorReports,
  getDoctorReportDetail,
  setMockDailyCapExceeded,
  speak,
} from '../src/lib/api';
import { CONSENT_VERSION, CONSENT_TEXT } from '../src/types/consent';
import { en } from '../src/i18n/en';
import { hi } from '../src/i18n/hi';

describe('Patient Flow Journeys', () => {
  it('Journey 1: Consent accepted -> text intake -> report review -> corrections -> submit -> booking', async () => {
    // 1. Start Session
    const startRes = await startSession('en');
    assert.ok(startRes.session_id);
    assert.equal(startRes.session_status, 'created');
    assert.equal(startRes.turn_count, 0);

    // 2. Record Consent (accepted with exact consent version)
    const consentRes = await recordConsent(startRes.session_id, true, 'en', CONSENT_VERSION);
    assert.equal(consentRes.session_status, 'in_progress');
    assert.equal(consentRes.current_question?.id, 'name');

    // 3. Step through intake questions
    const answers = [
      { q: 'name', a: 'Deepak Chopra' },
      { q: 'age', a: '42' },
      { q: 'gender', a: 'Male' },
      { q: 'primary_concern', a: 'Severe right knee pain after jogging' },
      { q: 'duration', a: '4 days' },
      { q: 'severity', a: 'Moderate' },
      { q: 'conditions', a: 'None known' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None known' },
      { q: 'other_symptoms', a: 'Mild swelling' },
    ];

    let currentRes = consentRes;
    for (const ans of answers) {
      assert.equal(currentRes.current_question?.id, ans.q);
      currentRes = await chatTurn({
        action: 'submit_turn',
        session_id: startRes.session_id,
        question_id: ans.q as any,
        text: ans.a,
      });
    }

    // 4. Verify draft report generated upon intake completion
    assert.equal(currentRes.is_complete, true);
    assert.equal(currentRes.can_submit, true);
    assert.ok(currentRes.draft_report);
    assert.equal(currentRes.draft_report.schema_version, 1);
    assert.equal(currentRes.draft_report.patient.name.value, 'Deepak Chopra');
    assert.equal(currentRes.draft_report.patient.age.value, 42);
    assert.equal(currentRes.draft_report.patient.gender.value, 'male');
    assert.equal(currentRes.draft_report.patient.gender.status, 'provided');
    assert.equal(currentRes.draft_report.routing_snapshot.department_key, 'orthopedics');

    // 5. Correct draft report (allowlisted field updates)
    const correctRes = await correctDraftReport({
      action: 'correct_draft_report',
      session_id: startRes.session_id,
      report_id: 'draft',
      updates: {
        'patient.name': { value: 'Deepak K. Chopra', status: 'provided' },
        'clinical_details.severity': { value: 'Moderate to severe', status: 'provided' },
        'patient.gender': { value: null, status: 'declined' }, // Test Report v1.2 gender declined invariant
      },
    });

    assert.ok(correctRes.draft_report);
    assert.equal(correctRes.draft_report.patient.name.value, 'Deepak K. Chopra');
    assert.equal(correctRes.draft_report.clinical_details.severity.value, 'Moderate to severe');
    // Gender value is null when status is declined per Report v1.2
    assert.equal(correctRes.draft_report.patient.gender.status, 'declined');
    assert.equal(correctRes.draft_report.patient.gender.value, null);

    // 6. Submit Report
    const submitRes = await submitReport({
      action: 'submit_report',
      session_id: startRes.session_id,
      report_id: 'draft',
    });
    assert.equal(submitRes.session_status, 'submitted');
    assert.ok(submitRes.submitted_report);
    assert.equal(submitRes.submitted_report.status, 'submitted');
    assert.ok(submitRes.submitted_report.intake_reference.startsWith('SHD-'));

    // 7. Booking Consultation Slot
    const slots = await getAvailableSlots(submitRes.submitted_report.doctor_id, '2026-11-04');
    assert.ok(slots.length > 0);
    const freeSlot = slots.find((s) => s.is_available);
    assert.ok(freeSlot);

    const bookRes = await bookAppointment({
      report_id: submitRes.submitted_report.id,
      doctor_id: submitRes.submitted_report.doctor_id,
      slot_id: freeSlot.id,
    });
    assert.ok(bookRes.appointment);
    assert.equal(bookRes.appointment.status, 'confirmed');
    assert.ok(bookRes.reference_code.startsWith('APT-'));
  });

  it('Journey 2: Consent accepted -> intake -> submit -> Not now; report remains available to doctor', async () => {
    const startRes = await startSession('en');
    await recordConsent(startRes.session_id, true, 'en', CONSENT_VERSION);

    const answers = [
      { q: 'name', a: 'Meera Patel' },
      { q: 'age', a: '31' },
      { q: 'gender', a: 'Female' },
      { q: 'primary_concern', a: 'Persistent skin rash on arm' },
      { q: 'duration', a: '1 week' },
      { q: 'severity', a: 'Mild' },
      { q: 'conditions', a: 'None' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None' },
      { q: 'other_symptoms', a: 'None' },
    ];

    for (const ans of answers) {
      await chatTurn({
        action: 'submit_turn',
        session_id: startRes.session_id,
        question_id: ans.q as any,
        text: ans.a,
      });
    }

    const submitRes = await submitReport({
      action: 'submit_report',
      session_id: startRes.session_id,
      report_id: 'draft',
    });
    assert.equal(submitRes.session_status, 'submitted');
    const reportId = submitRes.submitted_report!.id;

    // "Not now" chosen -> no appointment created, but report remains in doctor database
    const doctorReports = await getDoctorReports();
    const foundReport = doctorReports.find((r) => r.id === reportId);
    assert.ok(foundReport, 'Submitted report must be visible to doctors even when Not Now is chosen');
    assert.equal(foundReport.status, 'submitted');
  });

  it('Journey 3: Consent declined -> no health data collected and no report created', async () => {
    const startRes = await startSession('en');
    const declineRes = await recordConsent(startRes.session_id, false, 'en', CONSENT_VERSION);

    assert.equal(declineRes.session_status, 'declined');
    assert.equal(declineRes.is_complete, false);
    assert.equal(declineRes.draft_report, undefined);
    assert.equal(declineRes.submitted_report, undefined);
  });

  it('Journey 4: Emergency positive -> urgent flow, urgent_partial report, routine booking suppressed', async () => {
    const startRes = await startSession('en');
    await recordConsent(startRes.session_id, true, 'en', CONSENT_VERSION);

    // Provide name
    await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'name',
      text: 'Sunil Kumar',
    });

    // Provide emergency trigger phrase as primary concern (e.g. crushing chest pain)
    const emgTurn = await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'primary_concern',
      text: 'I have severe crushing chest pain and cold sweat',
    });

    assert.equal(emgTurn.emergency_triggered, true);
    assert.equal(emgTurn.session_status, 'emergency');
    assert.equal(emgTurn.can_submit, false);

    // Verify Emergency doctor has NO routine slots
    const emergencySlots = await getAvailableSlots('doc-emg-03', '2026-11-04');
    assert.equal(emergencySlots.length, 0, 'Emergency doctor must have zero routine slots');
  });

  it('Journey 5: Ambiguous emergency answer -> Yes/No clarification chips', async () => {
    const startRes = await startSession('en');
    await recordConsent(startRes.session_id, true, 'en', CONSENT_VERSION);

    // Test Clarification "Yes" -> enters urgent path
    const clarifYesTurn = await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'emergency_clarification',
      text: 'Yes',
    });
    assert.equal(clarifYesTurn.emergency_triggered, true);
    assert.equal(clarifYesTurn.session_status, 'emergency');
  });

  it('Journey 6: Ambiguous statement negated -> resumes intake without assuming safety clearance', async () => {
    const startRes = await startSession('en');
    await recordConsent(startRes.session_id, true, 'en', CONSENT_VERSION);

    // Test Negation: "I do not have chest pain" must NOT trigger emergency
    const negatedTurn = await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'primary_concern',
      text: 'I have mild cough and I do not have chest pain',
    });
    assert.equal(negatedTurn.emergency_triggered, undefined);
    assert.notEqual(negatedTurn.session_status, 'emergency');

    // Test Ambiguous Emergency Clarification: Answer "No" negates only that candidate (not general clearance)
    const clarifNoTurn = await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'emergency_clarification',
      text: 'No',
    });
    assert.equal(clarifNoTurn.emergency_triggered, undefined);
    assert.notEqual(clarifNoTurn.session_status, 'emergency');
  });

  it('Journey 7: Audio capture -> transcript preview -> patient edit/confirmation -> answer submission', async () => {
    const startRes = await startSession('en');
    await recordConsent(startRes.session_id, true, 'en', CONSENT_VERSION);

    // Send audio turn
    const audioRes = await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'name',
      audio_base64: 'fake_audio_stream',
      audio_format: 'audio/wav',
    });

    // Wire contract requirement: returns transcript_preview and turn_count is NOT incremented
    assert.ok(audioRes.transcript_preview);
    assert.equal(audioRes.transcript_preview.state, 'transcript_preview');
    assert.equal(audioRes.transcript_preview.question_id, 'name');
    assert.ok(audioRes.transcript_preview.text.length > 0);
    assert.equal(audioRes.turn_count, 0, 'Turn count must not increment during transcript preview');

    // Confirm transcript (with patient correction)
    const confirmedRes = await chatTurn({
      action: 'submit_turn',
      session_id: startRes.session_id,
      question_id: 'name',
      text: 'Pooja V. Sharma',
    });
    assert.equal(confirmedRes.turn_count, 1, 'Turn count increments only upon confirmed submission');
    assert.equal(confirmedRes.transcript_preview, undefined);
  });

  it('Journey 8: 15th accepted answer -> incomplete cap preview with End only', async () => {
    const startRes = await startSession('en');
    await recordConsent(startRes.session_id, true, 'en', CONSENT_VERSION);

    // Simulate 15 turns without completing all required questions
    let turnRes = startRes;
    for (let i = 0; i < 15; i++) {
      turnRes = await chatTurn({
        action: 'submit_turn',
        session_id: startRes.session_id,
        question_id: 'primary_concern',
        text: `Repeated clarification ${i}`,
      });
    }

    assert.equal(turnRes.turn_count, 15);
    assert.equal(turnRes.is_cap_reached, true);
    assert.ok(turnRes.draft_report);
    // At cap, if incomplete, cannot submit
    assert.equal(turnRes.can_submit, false);
  });

  it('Journey 9: Exact Bilingual Copy & Consent Text (English & Hindi)', () => {
    // Exact Consent Version & Content
    assert.equal(CONSENT_VERSION, '2026-11-01.v1');
    assert.ok(CONSENT_TEXT.en.includes('Samvad HealthDesk AI is an AI intake assistant and not a doctor'));
    assert.ok(CONSENT_TEXT.hi.includes('संवाद हेल्थडेस्क AI एक AI इनटेक सहायक है'));

    // Decision D9 Copy (Demo Busy & Ambiguous Clarification)
    assert.equal(en.chat.demoBusyMessage, 'This demo has reached today’s usage limit. Please try again later.');
    assert.equal(hi.chat.demoBusyMessage, 'यह डेमो आज की उपयोग सीमा तक पहुँच गया है। कृपया बाद में फिर कोशिश करें।');
    assert.equal(en.chat.emergencyClarificationPrompt, 'Is this happening to you right now?');
    assert.equal(hi.chat.emergencyClarificationPrompt, 'क्या यह अभी आपके साथ हो रहा है?');

    // Emergency Text (Plain 112, no tap to call)
    assert.equal(en.emergency.plainEmergencyNumber, '112');
    assert.equal(hi.emergency.plainEmergencyNumber, '112');
  });

  it('Journey 10: demo_busy global cap and provider failure recovery', async () => {
    // 1. Test global daily cap trigger (demo_busy)
    setMockDailyCapExceeded(true);
    const busyRes = await startSession('en');
    assert.equal(busyRes.demo_busy, true);
    assert.equal(busyRes.session_id, '');
    assert.equal(busyRes.can_submit, false);

    // Reset daily cap for remaining tests
    setMockDailyCapExceeded(false);
    const normalRes = await startSession('en');
    assert.equal(normalRes.demo_busy, undefined);
    assert.ok(normalRes.session_id.length > 0);

    // 2. Test Timbre failure recovery (returns undefined audioUrl, question still available as text)
    const speakRes = await speak(normalRes.session_id, 'name');
    assert.equal(speakRes.audioUrl, undefined, 'When Timbre TTS fails or is unavailable, audioUrl is gracefully undefined');

    // 3. Test Groq failure recovery (deterministic summary fallback)
    await recordConsent(normalRes.session_id, true, 'en', CONSENT_VERSION);
    const answers = [
      { q: 'name', a: 'Vijay Malhotra' },
      { q: 'age', a: '50' },
      { q: 'gender', a: 'Male' },
      { q: 'primary_concern', a: 'Joint stiffness in morning' },
      { q: 'duration', a: '1 month' },
      { q: 'severity', a: 'Moderate' },
      { q: 'conditions', a: 'None' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None' },
      { q: 'other_symptoms', a: 'None' },
    ];
    let turnRes = normalRes;
    for (const ans of answers) {
      turnRes = await chatTurn({
        action: 'submit_turn',
        session_id: normalRes.session_id,
        question_id: ans.q as any,
        text: ans.a,
      });
    }

    assert.equal(turnRes.is_complete, true);
    assert.ok(turnRes.draft_report);
    assert.equal(turnRes.draft_report.summary?.source, 'template', 'When Groq fails or is in mock mode, template summary is deterministically generated');
  });

  it('Journey 11: Incomplete intake triggers adaptive question selection, choice input, and resume preservation', async () => {
    const start = await startSession('en');
    const sid = start.session_id;
    await recordConsent(sid, true, 'en', CONSENT_VERSION);

    // Provide 10 core questions with unstated/invalid gender ('banana')
    const coreAnswers = [
      { q: 'name', a: 'Meera Patel' },
      { q: 'age', a: '45' },
      { q: 'gender', a: 'banana' },
      { q: 'primary_concern', a: 'Severe right knee swelling and pain when walking' },
      { q: 'duration', a: '2 weeks' },
      { q: 'severity', a: 'Moderate' },
      { q: 'conditions', a: 'None' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None' },
      { q: 'other_symptoms', a: 'None' },
    ];

    let lastTurn: any = null;
    for (const ans of coreAnswers) {
      lastTurn = await chatTurn({
        action: 'submit_turn',
        session_id: sid,
        question_id: ans.q as any,
        text: ans.a,
      });
    }

    // Turn 10 finished; report is incomplete -> triggers Orthopedics adaptive question
    assert.equal(lastTurn.turn_count, 10);
    assert.ok(lastTurn.current_question, 'Must offer adaptive question');
    assert.equal(lastTurn.current_question.id, 'ORTH-001');

    // Resume session check: adaptive question survives resumeSession
    const resumed = await resumeSession(sid);
    assert.equal(resumed.current_question?.id, 'ORTH-001');
    assert.equal(resumed.turn_count, 10);

    // Answer 1st adaptive question
    const turn11 = await chatTurn({
      action: 'submit_turn',
      session_id: sid,
      question_id: 'ORTH-001',
      text: 'Right knee joint',
    });
    assert.equal(turn11.turn_count, 11);
    assert.equal(turn11.current_question?.id, 'ORTH-002');
    assert.ok(turn11.current_question?.options && turn11.current_question.options.length > 0);

    // Answer 2nd adaptive question via choice option
    const choiceAnswer = turn11.current_question.options[0]; // e.g. 'Suddenly'
    const turn12 = await chatTurn({
      action: 'submit_turn',
      session_id: sid,
      question_id: 'ORTH-002',
      text: choiceAnswer,
    });
    assert.equal(turn12.turn_count, 12);
    assert.equal(turn12.current_question?.id, 'ORTH-003');

    // Answer 3rd adaptive question
    const turn13 = await chatTurn({
      action: 'submit_turn',
      session_id: sid,
      question_id: 'ORTH-003',
      text: 'No',
    });

    // Max 3 adaptive questions answered -> completes intake and generates draft report
    assert.equal(turn13.turn_count, 13);
    assert.ok(turn13.draft_report);
    assert.equal(turn13.draft_report.routing_snapshot.department_key, 'orthopedics');
    assert.equal(turn13.draft_report.routing_snapshot.doctor_name, 'Dr. Kabir Mehta');
  });
});
