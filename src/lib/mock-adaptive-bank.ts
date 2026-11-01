/**
 * Representative Mock Adaptive Questions Fixture (Frontend Mock-Mode Only)
 *
 * OWNERSHIP BOUNDARY:
 * - The backend is the canonical owner of the complete 150-question bank (M4-S10..S13).
 * - In real Supabase mode, the frontend receives question ID, localized text, answer type,
 *   and localized options directly over the wire from the `chat-turn` Edge Function response.
 *   Real-mode patients never load question content from this frontend fixture.
 * - This file contains only a small representative subset (15 questions: 3 per department)
 *   used exclusively by in-memory mock mode and UI interaction testing.
 */

import { AnswerType, QuestionId } from '../types/api';
import { DepartmentKey } from '../types/report';

export interface MockAdaptiveQuestion {
  id: QuestionId;
  department: DepartmentKey;
  topic: string;
  en: string;
  hi: string;
  field: string;
  answerType: AnswerType;
  optionsEn?: string[];
  optionsHi?: string[];
}

export const MOCK_ADAPTIVE_QUESTIONS: MockAdaptiveQuestion[] = [
  // Orthopedics
  {
    id: 'ORTH-001',
    department: 'orthopedics',
    topic: 'joint-site',
    en: 'Which joint or bone is hurting the most?',
    hi: 'किस जोड़ या हड्डी में सबसे ज़्यादा दर्द है?',
    field: 'clinical_details.other_symptoms',
    answerType: 'free_text',
  },
  {
    id: 'ORTH-002',
    department: 'orthopedics',
    topic: 'pain-onset',
    en: 'Did the pain start suddenly or build up gradually?',
    hi: 'दर्द अचानक शुरू हुआ या धीरे-धीरे बढ़ा?',
    field: 'clinical_details.duration',
    answerType: 'single_choice',
    optionsEn: ['Suddenly', 'Gradually', 'Comes and goes'],
    optionsHi: ['अचानक', 'धीरे-धीरे', 'आता-जाता'],
  },
  {
    id: 'ORTH-003',
    department: 'orthopedics',
    topic: 'injury',
    en: 'Did you have a fall or injury recently?',
    hi: 'क्या हाल में कोई चोट या गिरना हुआ था?',
    field: 'clinical_details.conditions',
    answerType: 'yes_no',
    optionsEn: ['Yes', 'No'],
    optionsHi: ['हाँ', 'नहीं'],
  },

  // General Medicine
  {
    id: 'GM-001',
    department: 'general_medicine',
    topic: 'fever',
    en: 'When did the fever start?',
    hi: 'बुखार कब शुरू हुआ?',
    field: 'clinical_details.duration',
    answerType: 'free_text',
  },
  {
    id: 'GM-002',
    department: 'general_medicine',
    topic: 'fever-pattern',
    en: 'Is the fever constant or does it come and go?',
    hi: 'बुखार लगातार रहता है या आता-जाता है?',
    field: 'clinical_details.duration',
    answerType: 'single_choice',
    optionsEn: ['Constant', 'Comes and goes', 'Occasional'],
    optionsHi: ['लगातार', 'रुक-रुक कर', 'कभी-कभी'],
  },
  {
    id: 'GM-004',
    department: 'general_medicine',
    topic: 'cough',
    en: 'Do you have a cough?',
    hi: 'क्या आपको खांसी है?',
    field: 'clinical_details.other_symptoms',
    answerType: 'yes_no',
    optionsEn: ['Yes', 'No'],
    optionsHi: ['हाँ', 'नहीं'],
  },

  // Dermatology
  {
    id: 'DERM-001',
    department: 'dermatology',
    topic: 'rash-site',
    en: 'Where on your body did the rash first appear?',
    hi: 'शरीर में दाने या चकत्ते सबसे पहले कहाँ निकले?',
    field: 'clinical_details.other_symptoms',
    answerType: 'free_text',
  },
  {
    id: 'DERM-003',
    department: 'dermatology',
    topic: 'itching',
    en: 'How severe is the itching?',
    hi: 'खुजली कितनी तेज़ होती है?',
    field: 'clinical_details.severity',
    answerType: 'single_choice',
    optionsEn: ['Mild', 'Moderate', 'Severe'],
    optionsHi: ['हल्का', 'मध्यम', 'तेज़'],
  },
  {
    id: 'DERM-004',
    department: 'dermatology',
    topic: 'night-itching',
    en: 'Does the itching get worse at night?',
    hi: 'क्या रात में खुजली ज़्यादा बढ़ जाती है?',
    field: 'clinical_details.severity',
    answerType: 'yes_no',
    optionsEn: ['Yes', 'No'],
    optionsHi: ['हाँ', 'नहीं'],
  },

  // Cardiology
  {
    id: 'CARD-001',
    department: 'cardiology',
    topic: 'chest-location',
    en: 'Where in your chest do you feel the discomfort?',
    hi: 'सीने में किस जगह भारीपन या तकलीफ होती है?',
    field: 'clinical_details.other_symptoms',
    answerType: 'free_text',
  },
  {
    id: 'CARD-002',
    department: 'cardiology',
    topic: 'chest-character',
    en: 'Does it feel like pressure, heaviness, burning or sharp?',
    hi: 'दबाव, भारीपन, जलन या तीखा दर्द कैसा लगता है?',
    field: 'clinical_details.severity',
    answerType: 'single_choice',
    optionsEn: ['Pressure', 'Heaviness', 'Sharp pain', 'Burning'],
    optionsHi: ['दबाव', 'भारीपन', 'तीखा दर्द', 'जलन'],
  },
  {
    id: 'CARD-003',
    department: 'cardiology',
    topic: 'exertion',
    en: 'Does it come on with walking, climbing or exercise?',
    hi: 'चलने, सीढ़ी चढ़ने या मेहनत करने पर होती है?',
    field: 'clinical_details.severity',
    answerType: 'yes_no',
    optionsEn: ['Yes', 'No'],
    optionsHi: ['हाँ', 'नहीं'],
  },

  // General Surgery
  {
    id: 'SURG-001',
    department: 'general_surgery',
    topic: 'lump-location',
    en: 'Where is the swelling or lump located?',
    hi: 'गांठ या सूजन शरीर में कहाँ है?',
    field: 'clinical_details.other_symptoms',
    answerType: 'free_text',
  },
  {
    id: 'SURG-008',
    department: 'general_surgery',
    topic: 'abdo-character',
    en: 'Is the belly pain sharp, dull or cramping?',
    hi: 'पेट का दर्द तीखा है, हल्का है या मरोड़ जैसा?',
    field: 'clinical_details.severity',
    answerType: 'single_choice',
    optionsEn: ['Sharp pain', 'Dull pain', 'Cramping'],
    optionsHi: ['तीखा दर्द', 'हल्का दर्द', 'मरोड़ जैसा'],
  },
  {
    id: 'SURG-005',
    department: 'general_surgery',
    topic: 'hernia-cough',
    en: 'Does the swelling increase when you cough or stand?',
    hi: 'खांसने या खड़े होने पर सूजन बढ़ती है?',
    field: 'clinical_details.other_symptoms',
    answerType: 'yes_no',
    optionsEn: ['Yes', 'No'],
    optionsHi: ['हाँ', 'नहीं'],
  },
];

export function getMockAdaptiveQuestion(id: string): MockAdaptiveQuestion | undefined {
  return MOCK_ADAPTIVE_QUESTIONS.find((q) => q.id === id);
}

export function getMockCandidates(department: DepartmentKey, askedIds: string[] = []): MockAdaptiveQuestion[] {
  const asked = new Set(askedIds);
  return MOCK_ADAPTIVE_QUESTIONS.filter(
    (q) => q.department === department && !asked.has(q.id),
  );
}
