/**
 * Assistant language preference and English doctor UI.
 *
 * The preference is global per doctor, defaults to Hindi, survives page changes and
 * refreshes (localStorage) and never leaks between doctors. Doctor-facing system copy is
 * English; patient-provided report content is untouched.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  DEFAULT_ASSISTANT_LANGUAGE,
  getAssistantLanguage,
  setAssistantLanguage,
  useAssistantLanguage,
} from '../src/features/doctor/doctor-assistant-language';
import { parseSummaryLanguage, renderEnglishSummary, renderSummary } from '../src/lib/assistant-summary';
import type { SummaryFacts } from '../src/lib/assistant-summary';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
const DEVANAGARI = /[\u0900-\u097F]/;

function installStorage() {
  const store = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  return {
    store,
    restore() {
      (globalThis as { window?: unknown }).window = originalWindow;
    },
  };
}

const facts: SummaryFacts = {
  v: 1,
  context: 'dashboard',
  intent: 'greeting',
  time_of_day: 'morning',
  reports: { total: 2, today: 2, awaiting_review: 1, complete: 2, partial: 0, reviewed: 1, urgent: 0 },
  appointments: {
    today: 1,
    today_upcoming: 1,
    today_completed: 0,
    future: 0,
    past: 0,
    cancelled: 0,
    next_starts: ['2026-11-06T04:00:00.000Z'],
    next_is_today: true,
  },
};

describe('Assistant language preference', () => {
  it('1. defaults to Hindi and validates the wire value', () => {
    assert.equal(DEFAULT_ASSISTANT_LANGUAGE, 'hi');
    assert.equal(parseSummaryLanguage(undefined), 'hi');
    assert.equal(parseSummaryLanguage('fr'), 'hi');
    assert.equal(parseSummaryLanguage('en'), 'en');
  });

  it('2. remembers the choice per doctor and isolates doctors from each other', () => {
    const storage = installStorage();
    try {
      assert.equal(getAssistantLanguage('doctor-a'), 'hi', 'default');
      setAssistantLanguage('doctor-a', 'en');
      assert.equal(getAssistantLanguage('doctor-a'), 'en', 'persisted for doctor A');
      assert.equal(getAssistantLanguage('doctor-b'), 'hi', 'doctor B keeps the default');
      setAssistantLanguage('doctor-b', 'hi');
      assert.equal(getAssistantLanguage('doctor-a'), 'en', 'doctor A is unaffected by B');
      assert.equal(storage.store.get('samvad.doctor.assistantLanguage.doctor-a'), 'en', 'localStorage key is per doctor');
    } finally {
      storage.restore();
    }
  });

  it('3. a stored preference survives a fresh read (page refresh)', () => {
    const storage = installStorage();
    try {
      setAssistantLanguage('doctor-c', 'en');
      // A refresh re-executes the module; the storage value is the source of truth.
      assert.equal(storage.store.get('samvad.doctor.assistantLanguage.doctor-c'), 'en');
      assert.equal(getAssistantLanguage('doctor-c'), 'en');
    } finally {
      storage.restore();
    }
  });

  it('4. the hook is a shared external store, not per-page state', () => {
    const source = read('src/features/doctor/doctor-assistant-language.ts');
    assert.match(source, /useSyncExternalStore/);
    assert.match(source, /const listeners = new Set/);
    assert.match(source, /STORAGE_PREFIX = 'samvad\.doctor\.assistantLanguage\.'/);
    assert.equal(typeof useAssistantLanguage, 'function');
  });
});

describe('English summaries', () => {
  it('5. English rendering is English and Hindi rendering is not', () => {
    const english = renderEnglishSummary(facts);
    const hindi = renderSummary(facts, 'hi');
    assert.match(english, /Good morning, Doctor/);
    assert.doesNotMatch(english, DEVANAGARI);
    assert.match(hindi, DEVANAGARI);
    assert.notEqual(english, hindi);
  });
});

describe('English doctor-facing UI', () => {
  it('6. no Devanagari system copy remains in doctor or shared doctor UI', () => {
    for (const file of [
      'src/features/doctor/SamwadAssistant.tsx',
      'src/features/doctor/SamwadAssistantButton.tsx',
      'src/features/doctor/DoctorReportsList.tsx',
      'src/features/doctor/DoctorShell.tsx',
      'src/features/doctor/DoctorDashboardView.tsx',
      'src/features/doctor/DoctorReportDetail.tsx',
      'src/features/doctor/DoctorUrgentDetail.tsx',
      'src/features/doctor/DoctorUrgentList.tsx',
      'src/features/doctor/DoctorAppointmentsView.tsx',
      'src/features/doctor/DoctorPageHeader.tsx',
      'src/features/doctor/DoctorLogin.tsx',
      'src/features/common/ConfirmDialog.tsx',
    ]) {
      assert.doesNotMatch(read(file), DEVANAGARI, `${file} is English-only`);
    }
  });

  it('7. the assistant panel labels every state in English', () => {
    const panel = read('src/features/doctor/SamwadAssistant.tsx');
    for (const phrase of [
      'Doctor workflow assistant',
      'Preparing summary and audio…',
      'Generating audio…',
      'Starting audio…',
      'Speaking…',
      'Stop',
      'Listen',
      'Replay',
      'Retry',
      'Voice is currently unavailable. The summary can still be read.',
      'Audio playback was blocked. Select Listen to play the summary.',
      'This assistant summarizes information in your records. It does not provide medical advice.',
    ]) {
      assert.ok(panel.includes(phrase), `panel copy: ${phrase}`);
    }
  });

  it('8. the language selector sits in the header, before the close button', () => {
    const panel = read('src/features/doctor/SamwadAssistant.tsx');
    const titleIndex = panel.indexOf('samwad-assistant-title');
    const toggleIndex = panel.indexOf('aria-label="Summary language"');
    const closeIndex = panel.indexOf('aria-label="Close assistant"');

    assert.ok(titleIndex > 0 && toggleIndex > 0 && closeIndex > 0, 'all header parts exist');
    assert.ok(titleIndex < toggleIndex, 'toggle comes after the title block');
    assert.ok(toggleIndex < closeIndex, 'toggle comes before the close button');
    assert.match(panel, /role="group"\s*\n\s*aria-label="Summary language"/);
    assert.match(panel, /\(\['hi', 'en'\] as const\)/, 'Hindi is listed first (default)');
    assert.match(panel, /aria-pressed=\{selected\}/, 'selection is announced');
  });

  it('9. the delete dialog is English and keeps its destructive styling', () => {
    const list = read('src/features/doctor/DoctorReportsList.tsx');
    assert.match(list, /title="Permanently delete report\?"/);
    assert.match(list, /Do you want to permanently delete this report and its report-specific data\? This action cannot be undone\./);
    assert.match(list, /confirmLabel="Delete report"/);
    assert.match(list, /cancelLabel="Cancel"/);
    assert.match(list, /tone="danger"/);

    const dialog = read('src/features/common/ConfirmDialog.tsx');
    assert.match(dialog, /bg-red-600/, 'red destructive button is preserved');
    assert.match(dialog, /backdrop-blur-sm/, 'blur backdrop is preserved');
  });

  it('10. patient content is never translated by the doctor UI', () => {
    // The doctor views render stored report values verbatim; there is no translation layer.
    for (const file of [
      'src/features/doctor/DoctorReportDetail.tsx',
      'src/features/doctor/DoctorUrgentDetail.tsx',
      'src/features/doctor/DoctorReportsList.tsx',
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /translate|i18n|t\(['"]/, `${file} does not translate patient content`);
      assert.match(source, /report\.report|primary_concern|patient\.name/, `${file} reads stored content directly`);
    }
  });
});
