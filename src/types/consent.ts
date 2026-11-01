/**
 * Versioned consent copy — aligned with backend contract.
 * Source: supabase/functions/_shared/consent.ts
 */

export const CONSENT_VERSION = '2026-11-01.v1';

export const CONSENT_TEXT: Readonly<Record<'en' | 'hi', string>> = {
  en:
    'I understand that Samvad HealthDesk AI is an AI intake assistant and not a doctor, ' +
    'and that it cannot diagnose or treat me. I agree that the health information I give ' +
    'will be processed to prepare a preliminary report, and that this report will be ' +
    "shared with the hospital's doctor only if I submit it. I can stop at any time.",
  hi:
    'मैं समझता/समझती हूँ कि संवाद हेल्थडेस्क AI एक AI इनटेक सहायक है, डॉक्टर नहीं है, और ' +
    'यह मेरा निदान या इलाज नहीं कर सकता। मैं सहमत हूँ कि मेरी दी गई स्वास्थ्य जानकारी से ' +
    'एक प्रारंभिक रिपोर्ट तैयार की जाएगी, और यह रिपोर्ट केवल तब अस्पताल के डॉक्टर के साथ ' +
    'साझा की जाएगी जब मैं इसे सबमिट करूँगा/करूँगी। मैं किसी भी समय रुक सकता/सकती हूँ।',
};

