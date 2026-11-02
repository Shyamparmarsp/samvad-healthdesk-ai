# Negative-Control Test Matrix

Every case below must **not** enter the emergency path (or, where noted, must ask the
fixed clarification rather than claim safety). They guard against false positives and
against the two demonstrated negation/quoting deviations that were corrected in this
branch.

Run by `supabase/tests/emergency-certification.ts` and
`supabase/functions/_shared/safety.certification.test.ts`.

## Ordinary, non-emergency statements

| Test id | Statement | Expected |
|---|---|---|
| `M-NEG-01` | `my knee hurts when I walk` | `none` |
| `M-NEG-02` | `I have a mild cough` | `none` |
| `M-NEG-03` | `I feel tired and have a headache` | `none` |
| `M-NEG-04` | `routine check-up` | `none` |
| `M-NEG-05` | `मुझे घुटने में दर्द है` | `none` |
| `M-NEG-06` | `मुझे बुखार है` | `none` |
| `M-NEG-07` | `I need a blood pressure medicine refill` | `none` |
| `M-NEG-08` | `my skin is itchy` | `none` |
| `M-NEG-09` | `no fever, mild cough` | `none` |
| `M-NEG-10` | `I have had a rash since yesterday` | `none` |

## Negated mentions of a trigger

| Test id | Statement | Expected |
|---|---|---|
| `M-NEGP-01` | `I do not have chest pain` | `none` |
| `M-NEGP-02` | `I don't have any chest pain` | `none` |
| `M-NEGP-03` | `no chest pain at all` | `none` |
| `M-NEGP-04` | `I never had severe chest pain` | `none` |
| `M-NEGP-05` | `I am not bleeding` | `none` |
| `M-NEGP-06` | `सीने में दर्द नहीं है` | `none` |
| `M-NEGP-07` | `मुझे सांस लेने में दिक्कत नहीं है` | `none` |

## Negation scoping (correction D-2)

A negation that belongs to another symptom or clause segment must not cancel a present
mention. A negation that governs the mention must still suppress it.

| Test id | Statement | Expected | Why |
|---|---|---|---|
| `M-NEGSCOPE-01` | `I cannot breathe but I have no fever` | `clear` | “no fever” is a different segment |
| `M-NEGSCOPE-02` | `I have chest pain but no fever` | `ambiguous` | clarification, not silence |
| `M-NEGSCOPE-03` | `no chest pain, but chest pain now` | `ambiguous` | later positive occurrence wins |
| `M-NEGSCOPE-04` | `I have severe chest pain and no fever` | `clear` | “and no fever” is a different segment |
| `M-NEGSCOPE-05` | `No fever but I cannot breathe` | `clear` | earlier segment negation |
| `M-NEGSCOPE-06` | `I have chest pain and no fever` | `ambiguous` | coordination boundary |
| `M-NEGSCOPE-07` | `I have chest pain with no fever` | `ambiguous` | post-phrase token is not the negation |
| `M-NEGSCOPE-08` | `I have no chest pain and no fever` | `none` | governing negation still wins |

## Quoted examples (correction D-1)

| Test id | Statement | Expected |
|---|---|---|
| `M-QUOTE-01` | `My friend told me to say "I cannot breathe"` | `none` |
| `M-QUOTE-02` | `The form says "having a seizure now"` | `none` |
| `M-QUOTE-03` | `The form says 'having a seizure now'` | `none` |
| `M-QUOTE-04` | `My friend told me to say 'I cannot breathe'` | `none` |
| `M-QUOTE-05` | `I said 'no chest pain'` | `none` |

Apostrophes that are not quotation delimiters still behave:

| Statement | Expected |
|---|---|
| `I can't breathe` | `clear` |
| `I don't have chest pain` | `none` |
| `the patient's chest pain` | `ambiguous` |

## Empty and punctuation-only input

| Test id | Input | Expected |
|---|---|---|
| `M-EMPTY-01` | whitespace / tabs / newlines | `none` |
| — | `""`, `"..."`, `"।"` | `none` |

## Control that must still be positive

These are included so the negative controls cannot be satisfied by a matcher that simply
stops triggering:

| Test id | Input | Expected |
|---|---|---|
| `M-CLAR-01` | `yes` / `नहीं` / `maybe` | `yes` / `no` / `unresolved` |
| `M-DET-01` | repeated `some chest pain` | one stable result |
| `M-ORDER-01` | `I cannot breathe and I have severe chest pain` | `clear / breathing_emergency` |

## Live negative and precedence checks

| Test id | Scenario | Expected |
|---|---|---|
| `L-NORMAL-01` | ordinary name/age/gender/concern | normal question order |
| `L-NORMAL-02` | ordinary concern | scripted adaptive question, no emergency |
| `L-NORMAL-03` | full ordinary intake | normal draft, `can_submit=true` |
| `L-AMB-01` | “I have some chest pain” | clarification, not emergency |
| `L-AMB-04` | unclear clarification | `needs_human_review`, never “safe” |
| `L-PREC-06` | “I have chest pain but no fever” | clarification |
| `L-PREC-07` | “no chest pain, but chest pain now” | clarification |
