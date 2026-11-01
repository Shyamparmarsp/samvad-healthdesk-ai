/**
 * Versioned consent copy.
 *
 * The database must preserve the exact wording and version the patient accepted, so the
 * text lives here as a single constant and is written verbatim to
 * `consent_records.consent_text` together with `consent_version`.
 *
 * Content requirements (AGENTS.md): explain the AI-assistant purpose, state that it is
 * not a doctor and cannot diagnose, state that the information is processed to prepare a
 * preliminary report, and state that the report is shared with the hospital's doctor if
 * the patient submits it. The patient can stop at any time.
 *
 * The Hindi text is a draft and must be reviewed by the owner before M3 acceptance.
 * Changing either string requires a new CONSENT_VERSION.
 */

export const CONSENT_VERSION = "2026-11-01.v1";

export const CONSENT_TEXT: Readonly<Record<"en" | "hi", string>> = {
  en:
    "I understand that Samvad HealthDesk AI is an AI intake assistant and not a doctor, " +
    "and that it cannot diagnose or treat me. I agree that the health information I give " +
    "will be processed to prepare a preliminary report, and that this report will be " +
    "shared with the hospital's doctor only if I submit it. I can stop at any time.",
  hi:
    "मैं समझता/समझती हूँ कि संवाद हेल्थडेस्क AI एक AI इनटेक सहायक है, डॉक्टर नहीं है, और " +
    "यह मेरा निदान या इलाज नहीं कर सकता। मैं सहमत हूँ कि मेरी दी गई स्वास्थ्य जानकारी से " +
    "एक प्रारंभिक रिपोर्ट तैयार की जाएगी, और यह रिपोर्ट केवल तब अस्पताल के डॉक्टर के साथ " +
    "साझा की जाएगी जब मैं इसे सबमिट करूँगा/करूँगी। मैं किसी भी समय रुक सकता/सकती हूँ।",
};

export const CONSENT_HINDI_NEEDS_OWNER_REVIEW = true;

export interface ConsentRecordFields {
  consent_text: string;
  consent_version: string;
  language: "en" | "hi";
}

/**
 * Builds the exact record to persist. The client never supplies the text, only the
 * version it displayed; a mismatch is rejected by the caller so the stored copy can
 * never disagree with what the patient actually saw.
 */
export function buildConsentRecord(
  language: "en" | "hi",
  clientVersion: string,
): ConsentRecordFields | null {
  if (clientVersion !== CONSENT_VERSION) return null;
  return {
    consent_text: CONSENT_TEXT[language],
    consent_version: CONSENT_VERSION,
    language,
  };
}
