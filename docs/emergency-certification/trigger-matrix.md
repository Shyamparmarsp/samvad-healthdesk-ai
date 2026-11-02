# English and Hindi Trigger Test Matrix

Source: `supabase/functions/_shared/safety.ts` (`EMERGENCY_RULES`). No phrase was added,
removed or rewritten during certification. Every row is exercised by
`supabase/tests/emergency-certification.ts` and the offline
`safety.certification.test.ts` suite.

Rule precedence is the declared array order:

1. `breathing_emergency`
2. `severe_chest_pain`
3. `stroke_signs`
4. `unresponsive_or_unconscious`
5. `uncontrolled_bleeding`
6. `seizure_or_convulsion`
7. `severe_allergic_reaction`
8. `poisoning_or_overdose`

## Clear triggers — English

| Rule | # | Phrase | Test id | Expected |
|---|---|---|---|---|
| `breathing_emergency` | 1 | `cannot breathe` | `M-CLEAR-EN-breathing_emergency-1` | `clear / breathing_emergency` |
| `breathing_emergency` | 2 | `cant breathe` | `M-CLEAR-EN-breathing_emergency-2` | `clear / breathing_emergency` |
| `breathing_emergency` | 3 | `can not breathe` | `M-CLEAR-EN-breathing_emergency-3` | `clear / breathing_emergency` |
| `breathing_emergency` | 4 | `not breathing` | `M-CLEAR-EN-breathing_emergency-4` | `clear / breathing_emergency` |
| `breathing_emergency` | 5 | `stopped breathing` | `M-CLEAR-EN-breathing_emergency-5` | `clear / breathing_emergency` |
| `breathing_emergency` | 6 | `severe difficulty breathing` | `M-CLEAR-EN-breathing_emergency-6` | `clear / breathing_emergency` |
| `breathing_emergency` | 7 | `struggling to breathe` | `M-CLEAR-EN-breathing_emergency-7` | `clear / breathing_emergency` |
| `breathing_emergency` | 8 | `gasping for air` | `M-CLEAR-EN-breathing_emergency-8` | `clear / breathing_emergency` |
| `severe_chest_pain` | 1 | `severe chest pain` | `M-CLEAR-EN-severe_chest_pain-1` | `clear / severe_chest_pain` |
| `severe_chest_pain` | 2 | `crushing chest pain` | `M-CLEAR-EN-severe_chest_pain-2` | `clear / severe_chest_pain` |
| `severe_chest_pain` | 3 | `heavy pressure in my chest` | `M-CLEAR-EN-severe_chest_pain-3` | `clear / severe_chest_pain` |
| `severe_chest_pain` | 4 | `crushing pressure in my chest` | `M-CLEAR-EN-severe_chest_pain-4` | `clear / severe_chest_pain` |
| `stroke_signs` | 1 | `one side of my body suddenly feels weak` | `M-CLEAR-EN-stroke_signs-1` | `clear / stroke_signs` |
| `stroke_signs` | 2 | `face is drooping` | `M-CLEAR-EN-stroke_signs-2` | `clear / stroke_signs` |
| `stroke_signs` | 3 | `suddenly cannot speak clearly` | `M-CLEAR-EN-stroke_signs-3` | `clear / stroke_signs` |
| `stroke_signs` | 4 | `cannot move my arm` | `M-CLEAR-EN-stroke_signs-4` | `clear / stroke_signs` |
| `unresponsive_or_unconscious` | 1 | `unconscious` | `M-CLEAR-EN-unresponsive_or_unconscious-1` | `clear / unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | 2 | `cannot wake them up` | `M-CLEAR-EN-unresponsive_or_unconscious-2` | `clear / unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | 3 | `not responding` | `M-CLEAR-EN-unresponsive_or_unconscious-3` | `clear / unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | 4 | `unresponsive` | `M-CLEAR-EN-unresponsive_or_unconscious-4` | `clear / unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | 5 | `passed out` | `M-CLEAR-EN-unresponsive_or_unconscious-5` | `clear / unresponsive_or_unconscious` |
| `uncontrolled_bleeding` | 1 | `bleeding will not stop` | `M-CLEAR-EN-uncontrolled_bleeding-1` | `clear / uncontrolled_bleeding` |
| `uncontrolled_bleeding` | 2 | `bleeding wont stop` | `M-CLEAR-EN-uncontrolled_bleeding-2` | `clear / uncontrolled_bleeding` |
| `uncontrolled_bleeding` | 3 | `severe bleeding` | `M-CLEAR-EN-uncontrolled_bleeding-3` | `clear / uncontrolled_bleeding` |
| `uncontrolled_bleeding` | 4 | `losing a lot of blood` | `M-CLEAR-EN-uncontrolled_bleeding-4` | `clear / uncontrolled_bleeding` |
| `seizure_or_convulsion` | 1 | `having a seizure now` | `M-CLEAR-EN-seizure_or_convulsion-1` | `clear / seizure_or_convulsion` |
| `seizure_or_convulsion` | 2 | `continuous convulsions` | `M-CLEAR-EN-seizure_or_convulsion-2` | `clear / seizure_or_convulsion` |
| `seizure_or_convulsion` | 3 | `repeated uncontrollable shaking` | `M-CLEAR-EN-seizure_or_convulsion-3` | `clear / seizure_or_convulsion` |
| `severe_allergic_reaction` | 1 | `throat or tongue swelling and trouble breathing` | `M-CLEAR-EN-severe_allergic_reaction-1` | `clear / severe_allergic_reaction` |
| `severe_allergic_reaction` | 2 | `face swelling with breathing difficulty` | `M-CLEAR-EN-severe_allergic_reaction-2` | `clear / severe_allergic_reaction` |
| `severe_allergic_reaction` | 3 | `throat is swelling and i cannot breathe` | `M-CLEAR-EN-severe_allergic_reaction-3` | `clear / severe_allergic_reaction` |
| `poisoning_or_overdose` | 1 | `swallowed poison` | `M-CLEAR-EN-poisoning_or_overdose-1` | `clear / poisoning_or_overdose` |
| `poisoning_or_overdose` | 2 | `took too much medicine` | `M-CLEAR-EN-poisoning_or_overdose-2` | `clear / poisoning_or_overdose` |
| `poisoning_or_overdose` | 3 | `overdose` | `M-CLEAR-EN-poisoning_or_overdose-3` | `clear / poisoning_or_overdose` |
| `poisoning_or_overdose` | 4 | `swallowed too many tablets` | `M-CLEAR-EN-poisoning_or_overdose-4` | `clear / poisoning_or_overdose` |

## Clear triggers — Hindi (Devanagari)

| Rule | # | Phrase | Test id | Expected |
|---|---|---|---|---|
| `breathing_emergency` | 1 | `सांस नहीं आ रही` | `M-CLEAR-HI-breathing_emergency-1` | `clear / breathing_emergency` |
| `breathing_emergency` | 2 | `साँस नहीं आ रही` | `M-CLEAR-HI-breathing_emergency-2` | `clear / breathing_emergency` |
| `breathing_emergency` | 3 | `सांस लेने में बहुत तकलीफ` | `M-CLEAR-HI-breathing_emergency-3` | `clear / breathing_emergency` |
| `breathing_emergency` | 4 | `साँस लेने में बहुत तकलीफ़` | `M-CLEAR-HI-breathing_emergency-4` | `clear / breathing_emergency` |
| `breathing_emergency` | 5 | `सांस नहीं ले पा रह` | `M-CLEAR-HI-breathing_emergency-5` | `clear / breathing_emergency` |
| `severe_chest_pain` | 1 | `सीने में बहुत तेज दर्द` | `M-CLEAR-HI-severe_chest_pain-1` | `clear / severe_chest_pain` |
| `severe_chest_pain` | 2 | `छाती में तेज दबाव` | `M-CLEAR-HI-severe_chest_pain-2` | `clear / severe_chest_pain` |
| `severe_chest_pain` | 3 | `सीने में भारीपन और दर्द` | `M-CLEAR-HI-severe_chest_pain-3` | `clear / severe_chest_pain` |
| `stroke_signs` | 1 | `शरीर के एक तरफ अचानक कमजोरी` | `M-CLEAR-HI-stroke_signs-1` | `clear / stroke_signs` |
| `stroke_signs` | 2 | `चेहरा टेढ़ा हो गया` | `M-CLEAR-HI-stroke_signs-2` | `clear / stroke_signs` |
| `stroke_signs` | 3 | `अचानक बोलने में दिक्कत` | `M-CLEAR-HI-stroke_signs-3` | `clear / stroke_signs` |
| `unresponsive_or_unconscious` | 1 | `बेहोश` | `M-CLEAR-HI-unresponsive_or_unconscious-1` | `clear / unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | 2 | `होश नहीं` | `M-CLEAR-HI-unresponsive_or_unconscious-2` | `clear / unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | 3 | `जगाने पर भी जवाब नहीं दे रहे` | `M-CLEAR-HI-unresponsive_or_unconscious-3` | `clear / unresponsive_or_unconscious` |
| `uncontrolled_bleeding` | 1 | `खून बंद नहीं हो रहा` | `M-CLEAR-HI-uncontrolled_bleeding-1` | `clear / uncontrolled_bleeding` |
| `uncontrolled_bleeding` | 2 | `बहुत ज्यादा खून बह रहा है` | `M-CLEAR-HI-uncontrolled_bleeding-2` | `clear / uncontrolled_bleeding` |
| `uncontrolled_bleeding` | 3 | `खून रुक नहीं रहा` | `M-CLEAR-HI-uncontrolled_bleeding-3` | `clear / uncontrolled_bleeding` |
| `seizure_or_convulsion` | 1 | `अभी दौरा पड़ रहा है` | `M-CLEAR-HI-seizure_or_convulsion-1` | `clear / seizure_or_convulsion` |
| `seizure_or_convulsion` | 2 | `लगातार झटके आ रहे हैं` | `M-CLEAR-HI-seizure_or_convulsion-2` | `clear / seizure_or_convulsion` |
| `seizure_or_convulsion` | 3 | `बार-बार दौरे पड़ रहे हैं` | `M-CLEAR-HI-seizure_or_convulsion-3` | `clear / seizure_or_convulsion` |
| `severe_allergic_reaction` | 1 | `जीभ या गले में सूजन और सांस लेने में दिक्कत` | `M-CLEAR-HI-severe_allergic_reaction-1` | `clear / severe_allergic_reaction` |
| `severe_allergic_reaction` | 2 | `जीभ में सूजन और सांस लेने में दिक्कत` | `M-CLEAR-HI-severe_allergic_reaction-2` | `clear / severe_allergic_reaction` |
| `severe_allergic_reaction` | 3 | `चेहरे पर सूजन और सांस में परेशानी` | `M-CLEAR-HI-severe_allergic_reaction-3` | `clear / severe_allergic_reaction` |
| `poisoning_or_overdose` | 1 | `ज़हर निगल लिया` | `M-CLEAR-HI-poisoning_or_overdose-1` | `clear / poisoning_or_overdose` |
| `poisoning_or_overdose` | 2 | `जहर निगल लिया` | `M-CLEAR-HI-poisoning_or_overdose-2` | `clear / poisoning_or_overdose` |
| `poisoning_or_overdose` | 3 | `दवा की बहुत ज्यादा मात्रा` | `M-CLEAR-HI-poisoning_or_overdose-3` | `clear / poisoning_or_overdose` |
| `poisoning_or_overdose` | 4 | `गलती से बहुत सारी दवाइयाँ` | `M-CLEAR-HI-poisoning_or_overdose-4` | `clear / poisoning_or_overdose` |

## Ambiguous triggers — fixed Yes/No clarification

| Rule | Language | Phrase | Test id | Expected |
|---|---|---|---|---|
| `breathing_emergency` | EN | `difficulty breathing` | `M-AMB-breathing_emergency-1` | `ambiguous including breathing_emergency` |
| `breathing_emergency` | EN | `hard to breathe` | `M-AMB-breathing_emergency-2` | `ambiguous including breathing_emergency` |
| `breathing_emergency` | EN | `short of breath` | `M-AMB-breathing_emergency-3` | `ambiguous including breathing_emergency` |
| `breathing_emergency` | EN | `breathless` | `M-AMB-breathing_emergency-4` | `ambiguous including breathing_emergency` |
| `breathing_emergency` | HI | `सांस लेने में दिक्कत` | `M-AMB-breathing_emergency-5` | `ambiguous including breathing_emergency` |
| `breathing_emergency` | HI | `सांस फूल रही` | `M-AMB-breathing_emergency-6` | `ambiguous including breathing_emergency` |
| `breathing_emergency` | HI | `सांस में परेशानी` | `M-AMB-breathing_emergency-7` | `ambiguous including breathing_emergency` |
| `severe_chest_pain` | EN | `chest pain` | `M-AMB-severe_chest_pain-1` | `ambiguous including severe_chest_pain` |
| `severe_chest_pain` | EN | `chest pressure` | `M-AMB-severe_chest_pain-2` | `ambiguous including severe_chest_pain` |
| `severe_chest_pain` | EN | `pressure in my chest` | `M-AMB-severe_chest_pain-3` | `ambiguous including severe_chest_pain` |
| `severe_chest_pain` | EN | `pain in my chest` | `M-AMB-severe_chest_pain-4` | `ambiguous including severe_chest_pain` |
| `severe_chest_pain` | HI | `सीने में दर्द` | `M-AMB-severe_chest_pain-5` | `ambiguous including severe_chest_pain` |
| `severe_chest_pain` | HI | `छाती में दबाव` | `M-AMB-severe_chest_pain-6` | `ambiguous including severe_chest_pain` |
| `severe_chest_pain` | HI | `सीने में भारीपन` | `M-AMB-severe_chest_pain-7` | `ambiguous including severe_chest_pain` |
| `stroke_signs` | EN | `weakness on one side` | `M-AMB-stroke_signs-1` | `ambiguous including stroke_signs` |
| `stroke_signs` | EN | `slurred speech` | `M-AMB-stroke_signs-2` | `ambiguous including stroke_signs` |
| `stroke_signs` | EN | `face drooping` | `M-AMB-stroke_signs-3` | `ambiguous including stroke_signs` |
| `stroke_signs` | HI | `एक तरफ कमजोरी` | `M-AMB-stroke_signs-4` | `ambiguous including stroke_signs` |
| `stroke_signs` | HI | `बोलने में दिक्कत` | `M-AMB-stroke_signs-5` | `ambiguous including stroke_signs` |
| `stroke_signs` | HI | `चेहरा टेढ़ा` | `M-AMB-stroke_signs-6` | `ambiguous including stroke_signs` |
| `unresponsive_or_unconscious` | EN | `not waking up` | `M-AMB-unresponsive_or_unconscious-1` | `ambiguous including unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | EN | `very drowsy` | `M-AMB-unresponsive_or_unconscious-2` | `ambiguous including unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | EN | `fainted` | `M-AMB-unresponsive_or_unconscious-3` | `ambiguous including unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | HI | `जवाब नहीं दे रहे` | `M-AMB-unresponsive_or_unconscious-4` | `ambiguous including unresponsive_or_unconscious` |
| `unresponsive_or_unconscious` | HI | `बहुत नींद आ रही` | `M-AMB-unresponsive_or_unconscious-5` | `ambiguous including unresponsive_or_unconscious` |
| `uncontrolled_bleeding` | EN | `bleeding` | `M-AMB-uncontrolled_bleeding-1` | `ambiguous including uncontrolled_bleeding` |
| `uncontrolled_bleeding` | EN | `lots of blood` | `M-AMB-uncontrolled_bleeding-2` | `ambiguous including uncontrolled_bleeding` |
| `uncontrolled_bleeding` | HI | `खून बह रहा` | `M-AMB-uncontrolled_bleeding-3` | `ambiguous including uncontrolled_bleeding` |
| `uncontrolled_bleeding` | HI | `खून आ रहा` | `M-AMB-uncontrolled_bleeding-4` | `ambiguous including uncontrolled_bleeding` |
| `seizure_or_convulsion` | EN | `seizure` | `M-AMB-seizure_or_convulsion-1` | `ambiguous including seizure_or_convulsion` |
| `seizure_or_convulsion` | EN | `convulsion` | `M-AMB-seizure_or_convulsion-2` | `ambiguous including seizure_or_convulsion` |
| `seizure_or_convulsion` | EN | `fits` | `M-AMB-seizure_or_convulsion-3` | `ambiguous including seizure_or_convulsion` |
| `seizure_or_convulsion` | HI | `दौरा` | `M-AMB-seizure_or_convulsion-4` | `ambiguous including seizure_or_convulsion` |
| `seizure_or_convulsion` | HI | `झटके` | `M-AMB-seizure_or_convulsion-5` | `ambiguous including seizure_or_convulsion` |
| `seizure_or_convulsion` | HI | `मिर्गी का दौरा` | `M-AMB-seizure_or_convulsion-6` | `ambiguous including seizure_or_convulsion` |
| `severe_allergic_reaction` | EN | `throat swelling` | `M-AMB-severe_allergic_reaction-1` | `ambiguous including severe_allergic_reaction` |
| `severe_allergic_reaction` | EN | `tongue swelling` | `M-AMB-severe_allergic_reaction-2` | `ambiguous including severe_allergic_reaction` |
| `severe_allergic_reaction` | EN | `face swelling` | `M-AMB-severe_allergic_reaction-3` | `ambiguous including severe_allergic_reaction` |
| `severe_allergic_reaction` | HI | `गले में सूजन` | `M-AMB-severe_allergic_reaction-4` | `ambiguous including severe_allergic_reaction` |
| `severe_allergic_reaction` | HI | `जीभ में सूजन` | `M-AMB-severe_allergic_reaction-5` | `ambiguous including severe_allergic_reaction` |
| `severe_allergic_reaction` | HI | `चेहरे पर सूजन` | `M-AMB-severe_allergic_reaction-6` | `ambiguous including severe_allergic_reaction` |
| `poisoning_or_overdose` | EN | `took extra tablets` | `M-AMB-poisoning_or_overdose-1` | `ambiguous including poisoning_or_overdose` |
| `poisoning_or_overdose` | EN | `swallowed something` | `M-AMB-poisoning_or_overdose-2` | `ambiguous including poisoning_or_overdose` |
| `poisoning_or_overdose` | HI | `ज्यादा दवा ले ली` | `M-AMB-poisoning_or_overdose-3` | `ambiguous including poisoning_or_overdose` |

The live harness exercises one representative ambiguous phrase per language
(`L-AMB-01` … `L-AMB-06`); the full list above is covered by the offline suite.

## Tier C Romanised variants (opt-in only)

Disabled by default. Enabled only with `includeRomanized: true`, and only if a real
`hi-IN` transcript is verified to return Roman text.

| Rule | Phrase | Default | Enabled | Test id |
|---|---|---|---|---|
| `breathing_emergency` | `saans nahi aa rahi` | `none` | `clear / breathing_emergency` | `M-ROM-breathing_emergency-1` |
| `breathing_emergency` | `saans lene mein bahut takleef` | `none` | `clear / breathing_emergency` | `M-ROM-breathing_emergency-2` |
| `severe_chest_pain` | `seene mein tez dard` | `none` | `clear / severe_chest_pain` | `M-ROM-severe_chest_pain-1` |
| `severe_chest_pain` | `seene mein dard` | `none` | `clear / severe_chest_pain` | `M-ROM-severe_chest_pain-2` |
| `stroke_signs` | `chehra tedha ho gaya` | `none` | `clear / stroke_signs` | `M-ROM-stroke_signs-1` |
| `stroke_signs` | `ek taraf kamzori` | `none` | `clear / stroke_signs` | `M-ROM-stroke_signs-2` |
| `unresponsive_or_unconscious` | `behosh` | `none` | `clear / unresponsive_or_unconscious` | `M-ROM-unresponsive_or_unconscious-1` |
| `unresponsive_or_unconscious` | `hosh nahi` | `none` | `clear / unresponsive_or_unconscious` | `M-ROM-unresponsive_or_unconscious-2` |
| `uncontrolled_bleeding` | `khoon band nahi ho raha` | `none` | `clear / uncontrolled_bleeding` | `M-ROM-uncontrolled_bleeding-1` |
| `seizure_or_convulsion` | `daura pad raha hai` | `none` | `clear / seizure_or_convulsion` | `M-ROM-seizure_or_convulsion-1` |
| `poisoning_or_overdose` | `zaher nigal liya` | `none` | `clear / poisoning_or_overdose` | `M-ROM-poisoning_or_overdose-1` |

## Counts

| Category | Count |
|---|---|
| Clear English | 35 |
| Clear Hindi | 27 |
| Ambiguous English | 24 |
| Ambiguous Hindi | 20 |
| Romanised (opt-in) | 11 |
| Rules | 8 |

## Case, whitespace, punctuation and orthography

| Test id | Input | Expected |
|---|---|---|
| `M-NORM-01` | `CANNOT BREATHE` | `clear` |
| `M-NORM-02` | `   I    cannot     breathe   ` | `clear` |
| `M-NORM-03` | `I cannot breathe!!!` | `clear` |
| `M-NORM-04` | `cannot-breathe` | `clear` |
| `M-NORM-05` | `I can't breathe` | `clear` |
| `M-NORM-06` | `I can’t breathe` | `clear` |
| `M-NORM-07` | `SEVERE   CHEST   PAIN?` | `clear` |
| `M-NORM-08` | `साँस लेने में बहुत तकलीफ़` | `clear` |

Normalisation lower-cases, unifies quotes/apostrophes, removes punctuation-only
differences and collapses whitespace while preserving Devanagari letters and marks.
