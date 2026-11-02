/**
 * Deterministic demo emergency matcher.
 *
 * Implements docs/demo-emergency-rules.md. The eight rule identifiers are fixed by that
 * document; the phrase lists below are demo matcher strings, not clinical criteria.
 *
 * Scope rules enforced here:
 *   - Only the patient's current answer is evaluated. This function accepts a single
 *     string; it never receives assistant text, prior turns or the question itself.
 *   - Quoted examples are removed before matching, so quoting a phrase does not trigger.
 *   - A negated mention does not trigger that candidate.
 *   - A weaker mention produces an ambiguity, which the caller must resolve with the
 *     fixed Yes/No clarification. Ambiguity is never silently treated as safe.
 *   - Detection is deterministic and bounded; no model output is consulted.
 *
 * This is a demonstration matcher. It is not clinically validated and must never be
 * presented as triage.
 */

export type EmergencyRuleId =
  | "breathing_emergency"
  | "severe_chest_pain"
  | "stroke_signs"
  | "unresponsive_or_unconscious"
  | "uncontrolled_bleeding"
  | "seizure_or_convulsion"
  | "severe_allergic_reaction"
  | "poisoning_or_overdose";

export interface EmergencyRule {
  id: EmergencyRuleId;
  /** Phrases that trigger the urgent path directly. */
  clear: readonly string[];
  clearHi: readonly string[];
  /** Weaker mentions that require the Yes/No clarification. */
  ambiguous: readonly string[];
  ambiguousHi: readonly string[];
  /** Optional Tier C Romanised variants; only enabled when the provider emits Roman. */
  romanized: readonly string[];
}

/** Declared order also defines priority when several rules match at once. */
export const EMERGENCY_RULES: readonly EmergencyRule[] = [
  {
    id: "breathing_emergency",
    clear: [
      "cannot breathe",
      "cant breathe",
      "can not breathe",
      "not breathing",
      "stopped breathing",
      "severe difficulty breathing",
      "struggling to breathe",
      "gasping for air",
    ],
    clearHi: [
      "सांस नहीं आ रही",
      "साँस नहीं आ रही",
      "सांस लेने में बहुत तकलीफ",
      "साँस लेने में बहुत तकलीफ़",
      "सांस नहीं ले पा रह",
    ],
    ambiguous: ["difficulty breathing", "hard to breathe", "short of breath", "breathless"],
    ambiguousHi: ["सांस लेने में दिक्कत", "सांस फूल रही", "सांस में परेशानी"],
    romanized: ["saans nahi aa rahi", "saans lene mein bahut takleef"],
  },
  {
    id: "severe_chest_pain",
    clear: [
      "severe chest pain",
      "crushing chest pain",
      "heavy pressure in my chest",
      "crushing pressure in my chest",
    ],
    clearHi: ["सीने में बहुत तेज दर्द", "छाती में तेज दबाव", "सीने में भारीपन और दर्द"],
    ambiguous: ["chest pain", "chest pressure", "pressure in my chest", "pain in my chest"],
    ambiguousHi: ["सीने में दर्द", "छाती में दबाव", "सीने में भारीपन"],
    romanized: ["seene mein tez dard", "seene mein dard"],
  },
  {
    id: "stroke_signs",
    clear: [
      "one side of my body suddenly feels weak",
      "face is drooping",
      "suddenly cannot speak clearly",
      "cannot move my arm",
    ],
    clearHi: ["शरीर के एक तरफ अचानक कमजोरी", "चेहरा टेढ़ा हो गया", "अचानक बोलने में दिक्कत"],
    ambiguous: ["weakness on one side", "slurred speech", "face drooping"],
    ambiguousHi: ["एक तरफ कमजोरी", "बोलने में दिक्कत", "चेहरा टेढ़ा"],
    romanized: ["chehra tedha ho gaya", "ek taraf kamzori"],
  },
  {
    id: "unresponsive_or_unconscious",
    clear: ["unconscious", "cannot wake them up", "not responding", "unresponsive", "passed out"],
    clearHi: ["बेहोश", "होश नहीं", "जगाने पर भी जवाब नहीं दे रहे"],
    ambiguous: ["not waking up", "very drowsy", "fainted"],
    ambiguousHi: ["जवाब नहीं दे रहे", "बहुत नींद आ रही"],
    romanized: ["behosh", "hosh nahi"],
  },
  {
    id: "uncontrolled_bleeding",
    clear: ["bleeding will not stop", "bleeding wont stop", "severe bleeding", "losing a lot of blood"],
    clearHi: ["खून बंद नहीं हो रहा", "बहुत ज्यादा खून बह रहा है", "खून रुक नहीं रहा"],
    ambiguous: ["bleeding", "lots of blood"],
    ambiguousHi: ["खून बह रहा", "खून आ रहा"],
    romanized: ["khoon band nahi ho raha"],
  },
  {
    id: "seizure_or_convulsion",
    clear: ["having a seizure now", "continuous convulsions", "repeated uncontrollable shaking"],
    clearHi: ["अभी दौरा पड़ रहा है", "लगातार झटके आ रहे हैं", "बार-बार दौरे पड़ रहे हैं"],
    ambiguous: ["seizure", "convulsion", "fits"],
    ambiguousHi: ["दौरा", "झटके", "मिर्गी का दौरा"],
    romanized: ["daura pad raha hai"],
  },
  {
    id: "severe_allergic_reaction",
    clear: [
      "throat or tongue swelling and trouble breathing",
      "face swelling with breathing difficulty",
      "throat is swelling and i cannot breathe",
    ],
    clearHi: [
      "जीभ या गले में सूजन और सांस लेने में दिक्कत",
      "जीभ में सूजन और सांस लेने में दिक्कत",
      "चेहरे पर सूजन और सांस में परेशानी",
    ],
    ambiguous: ["throat swelling", "tongue swelling", "face swelling"],
    ambiguousHi: ["गले में सूजन", "जीभ में सूजन", "चेहरे पर सूजन"],
    romanized: [],
  },
  {
    id: "poisoning_or_overdose",
    clear: ["swallowed poison", "took too much medicine", "overdose", "swallowed too many tablets"],
    clearHi: ["ज़हर निगल लिया", "जहर निगल लिया", "दवा की बहुत ज्यादा मात्रा", "गलती से बहुत सारी दवाइयाँ"],
    ambiguous: ["took extra tablets", "swallowed something"],
    ambiguousHi: ["ज्यादा दवा ले ली"],
    romanized: ["zaher nigal liya"],
  },
];

export type EmergencyMatch =
  | { kind: "clear"; ruleId: EmergencyRuleId }
  | { kind: "ambiguous"; ruleIds: EmergencyRuleId[] }
  | { kind: "none" };

export interface MatchOptions {
  /** Tier C: enable only when provider-notes confirms Romanised Hindi output. */
  includeRomanized?: boolean;
}

const NEGATION_TOKENS = new Set([
  "no",
  "not",
  "dont",
  "doesnt",
  "didnt",
  "isnt",
  "arent",
  "wasnt",
  "werent",
  "never",
  "without",
  "denies",
  "deny",
  "नहीं",
  "मत",
  "बिना",
]);

/** Lower-cases, unifies quotes and apostrophes, collapses whitespace. */
export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc']/g, "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}\p{M}\s.,;:!?।"]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Removes quoted spans so a quoted example can never trigger a rule. */
export function stripQuoted(input: string): string {
  let output = input;
  output = output.replace(/"[^"]{0,300}"/g, " ");
  // A single quote delimits a quotation only at a word boundary. This keeps the
  // apostrophes in contractions ("don't", "patient's") intact while removing
  // 'quoted examples' that the patient is repeating rather than reporting.
  output = output.replace(/(^|[\s([{])'[^']{1,300}'(?=[\s)\]},.!?;:]|$)/g, "$1 ");
  output = output.replace(/“[^”]{0,300}”/g, " ");
  output = output.replace(/(^|[\s([{])‘[^’]{1,300}’(?=[\s)\]},.!?;:]|$)/g, "$1 ");
  return output.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return value.split(/[^\p{L}\p{N}\p{M}]+/u).filter((token) => token.length > 0);
}

/**
 * Clause and coordination boundaries. A negation on the other side of a contrast or
 * coordination ("but", "and", "लेकिन") belongs to a different statement and must not
 * cancel the mention. Sentence punctuation is also a boundary.
 */
const BOUNDARY = /[.,;!?।]|\b(?:and|but|however|although|though|yet)\b|(?:और|लेकिन|मगर)/giu;

function clauseAround(text: string, start: number, end: number): { clause: string; offset: number } {
  BOUNDARY.lastIndex = 0;
  let clauseStart = 0;
  let match: RegExpExecArray | null;
  while ((match = BOUNDARY.exec(text)) !== null) {
    const position = match.index;
    if (position < start) {
      clauseStart = position + match[0].length;
      continue;
    }
    if (position >= end) {
      return { clause: text.slice(clauseStart, position), offset: clauseStart };
    }
    // A boundary inside the phrase itself (e.g. the word "and" in an approved
    // phrase) does not split the phrase; the phrase match is computed on full text.
  }
  return { clause: text.slice(clauseStart), offset: clauseStart };
}

/** How many tokens before/after the mention a governing negation may appear. */
const NEGATION_BEFORE_TOKENS = 6;
const NEGATION_AFTER_TOKENS = 1;

/**
 * True when a negation token governs the phrase inside the same clause segment.
 *
 * Before: up to six tokens, which covers English auxiliaries ("I do not really have
 * chest pain") without reaching a negation that belongs to another clause segment.
 * After: only the immediately following token, which covers Hindi post-verbal negation
 * ("सीने में दर्द नहीं है") without treating "chest pain but no fever" as negated.
 */
export function isNegated(clause: string, phraseStart: number, phraseEnd: number): boolean {
  const beforeTokens = tokenize(clause.slice(0, phraseStart)).slice(-NEGATION_BEFORE_TOKENS);
  const afterTokens = tokenize(clause.slice(phraseEnd)).slice(0, NEGATION_AFTER_TOKENS);
  return (
    beforeTokens.some((token) => NEGATION_TOKENS.has(token)) ||
    afterTokens.some((token) => NEGATION_TOKENS.has(token))
  );
}

interface PhraseHit {
  start: number;
  end: number;
  negated: boolean;
}

/**
 * Every occurrence of a phrase, each with its own negation context. Checking only the
 * first occurrence would let an earlier negated mention hide a later positive one
 * ("no chest pain, but chest pain now").
 */
function findPhraseHits(text: string, phrase: string): PhraseHit[] {
  const hits: PhraseHit[] = [];
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(phrase, from);
    if (index < 0) break;
    const end = index + phrase.length;
    const { clause, offset } = clauseAround(text, index, end);
    hits.push({
      start: index,
      end,
      negated: isNegated(clause, index - offset, end - offset),
    });
    from = index + 1;
  }
  return hits;
}

/**
 * Classifies one patient answer.
 *
 * The caller must pass the patient-confirmed text for the current turn only. Passing
 * conversation history, an assistant question or a transcript the patient has not
 * confirmed is a caller defect and cannot be detected here.
 */
export function classifyAnswer(answer: string, options: MatchOptions = {}): EmergencyMatch {
  const normalized = stripQuoted(normalizeAnswer(stripQuoted(answer)));
  if (normalized.length === 0) return { kind: "none" };

  const ambiguousHits: EmergencyRuleId[] = [];
  let sawAmbiguous = false;

  for (const rule of EMERGENCY_RULES) {
    const clearPhrases = options.includeRomanized
      ? [...rule.clear, ...rule.clearHi, ...rule.romanized]
      : [...rule.clear, ...rule.clearHi];

    for (const phrase of clearPhrases) {
      const hits = findPhraseHits(normalized, normalizeAnswer(phrase));
      if (hits.some((hit) => !hit.negated)) {
        return { kind: "clear", ruleId: rule.id };
      }
    }
  }

  for (const rule of EMERGENCY_RULES) {
    const weakPhrases = [...rule.ambiguous, ...rule.ambiguousHi];
    for (const phrase of weakPhrases) {
      const hits = findPhraseHits(normalized, normalizeAnswer(phrase));
      if (hits.some((hit) => !hit.negated)) {
        sawAmbiguous = true;
        if (!ambiguousHits.includes(rule.id)) ambiguousHits.push(rule.id);
      }
    }
  }

  if (sawAmbiguous && ambiguousHits.length > 0) {
    return { kind: "ambiguous", ruleIds: ambiguousHits };
  }
  return { kind: "none" };
}

/**
 * Resolves the fixed clarification answer.
 * "yes" confirms the candidate; anything unusable is treated as unresolved, never safe.
 */
export function resolveClarification(answer: string): "yes" | "no" | "unresolved" {
  const normalized = normalizeAnswer(answer);
  if (normalized.length === 0) return "unresolved";
  const tokens = tokenize(normalized);
  if (tokens.length === 0) return "unresolved";

  const yes = new Set(["yes", "yeah", "yep", "y", "haan", "han", "ha", "हाँ", "हां", "जी"]);
  const no = new Set(["no", "nope", "n", "nahi", "nahin", "नहीं", "ना"]);

  if (tokens.some((token) => yes.has(token))) return "yes";
  if (tokens.some((token) => no.has(token))) return "no";
  return "unresolved";
}
