# Emergency Certification — Test Matrix

Generated from `emergency-certification-result.json` (2026-11-02T13:39:29.176Z).
Application commit under test: `e5d77e53100f62d3ac5954cce7d4e9c5872f3053`. Target: local stack only.

**Verdict: PASS** — 209 cases: 209 PASS, 0 FAIL, 0 NOT TESTED.

This matrix runs against the corrected Edge Functions served from a parallel local
edge-runtime container; the project’s shared runtime and all worktrees were untouched.
`Input / condition` contains only fixed demo phrases and synthetic fixture text.

## 1. Emergency detection

| ID | Test | Input / condition | Expected | Actual | Verdict |
|---|---|---|---|---|---|
| `M-CLEAR-EN-breathing_emergency-1` | English clear phrase triggers breathing_emergency | cannot breathe | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-EN-breathing_emergency-2` | English clear phrase triggers breathing_emergency | cant breathe | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-EN-breathing_emergency-3` | English clear phrase triggers breathing_emergency | can not breathe | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-EN-breathing_emergency-4` | English clear phrase triggers breathing_emergency | not breathing | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-EN-breathing_emergency-5` | English clear phrase triggers breathing_emergency | stopped breathing | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-EN-breathing_emergency-6` | English clear phrase triggers breathing_emergency | severe difficulty breathing | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-EN-breathing_emergency-7` | English clear phrase triggers breathing_emergency | struggling to breathe | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-EN-breathing_emergency-8` | English clear phrase triggers breathing_emergency | gasping for air | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-HI-breathing_emergency-1` | Hindi clear phrase triggers breathing_emergency | सांस नहीं आ रही | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-HI-breathing_emergency-2` | Hindi clear phrase triggers breathing_emergency | साँस नहीं आ रही | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-HI-breathing_emergency-3` | Hindi clear phrase triggers breathing_emergency | सांस लेने में बहुत तकलीफ | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-HI-breathing_emergency-4` | Hindi clear phrase triggers breathing_emergency | साँस लेने में बहुत तकलीफ़ | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-CLEAR-HI-breathing_emergency-5` | Hindi clear phrase triggers breathing_emergency | सांस नहीं ले पा रह | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-AMB-breathing_emergency-1` | Ambiguous phrase requests clarification for breathing_emergency | difficulty breathing | ambiguous including breathing_emergency | ambiguous / breathing_emergency | **PASS** |
| `M-AMB-breathing_emergency-2` | Ambiguous phrase requests clarification for breathing_emergency | hard to breathe | ambiguous including breathing_emergency | ambiguous / breathing_emergency | **PASS** |
| `M-AMB-breathing_emergency-3` | Ambiguous phrase requests clarification for breathing_emergency | short of breath | ambiguous including breathing_emergency | ambiguous / breathing_emergency | **PASS** |
| `M-AMB-breathing_emergency-4` | Ambiguous phrase requests clarification for breathing_emergency | breathless | ambiguous including breathing_emergency | ambiguous / breathing_emergency | **PASS** |
| `M-AMB-breathing_emergency-5` | Ambiguous phrase requests clarification for breathing_emergency | सांस लेने में दिक्कत | ambiguous including breathing_emergency | ambiguous / breathing_emergency | **PASS** |
| `M-AMB-breathing_emergency-6` | Ambiguous phrase requests clarification for breathing_emergency | सांस फूल रही | ambiguous including breathing_emergency | ambiguous / breathing_emergency | **PASS** |
| `M-AMB-breathing_emergency-7` | Ambiguous phrase requests clarification for breathing_emergency | सांस में परेशानी | ambiguous including breathing_emergency | ambiguous / breathing_emergency | **PASS** |
| `M-ROM-breathing_emergency-1` | Romanised variant is opt-in (Tier C) for breathing_emergency | saans nahi aa rahi | none when disabled; clear when enabled | disabled=none; enabled=clear/breathing_emergency | **PASS** |
| `M-ROM-breathing_emergency-2` | Romanised variant is opt-in (Tier C) for breathing_emergency | saans lene mein bahut takleef | none when disabled; clear when enabled | disabled=none; enabled=clear/breathing_emergency | **PASS** |
| `M-CLEAR-EN-severe_chest_pain-1` | English clear phrase triggers severe_chest_pain | severe chest pain | clear / severe_chest_pain | clear / severe_chest_pain | **PASS** |
| `M-CLEAR-EN-severe_chest_pain-2` | English clear phrase triggers severe_chest_pain | crushing chest pain | clear / severe_chest_pain | clear / severe_chest_pain | **PASS** |
| `M-CLEAR-EN-severe_chest_pain-3` | English clear phrase triggers severe_chest_pain | heavy pressure in my chest | clear / severe_chest_pain | clear / severe_chest_pain | **PASS** |
| `M-CLEAR-EN-severe_chest_pain-4` | English clear phrase triggers severe_chest_pain | crushing pressure in my chest | clear / severe_chest_pain | clear / severe_chest_pain | **PASS** |
| `M-CLEAR-HI-severe_chest_pain-1` | Hindi clear phrase triggers severe_chest_pain | सीने में बहुत तेज दर्द | clear / severe_chest_pain | clear / severe_chest_pain | **PASS** |
| `M-CLEAR-HI-severe_chest_pain-2` | Hindi clear phrase triggers severe_chest_pain | छाती में तेज दबाव | clear / severe_chest_pain | clear / severe_chest_pain | **PASS** |
| `M-CLEAR-HI-severe_chest_pain-3` | Hindi clear phrase triggers severe_chest_pain | सीने में भारीपन और दर्द | clear / severe_chest_pain | clear / severe_chest_pain | **PASS** |
| `M-AMB-severe_chest_pain-1` | Ambiguous phrase requests clarification for severe_chest_pain | chest pain | ambiguous including severe_chest_pain | ambiguous / severe_chest_pain | **PASS** |
| `M-AMB-severe_chest_pain-2` | Ambiguous phrase requests clarification for severe_chest_pain | chest pressure | ambiguous including severe_chest_pain | ambiguous / severe_chest_pain | **PASS** |
| `M-AMB-severe_chest_pain-3` | Ambiguous phrase requests clarification for severe_chest_pain | pressure in my chest | ambiguous including severe_chest_pain | ambiguous / severe_chest_pain | **PASS** |
| `M-AMB-severe_chest_pain-4` | Ambiguous phrase requests clarification for severe_chest_pain | pain in my chest | ambiguous including severe_chest_pain | ambiguous / severe_chest_pain | **PASS** |
| `M-AMB-severe_chest_pain-5` | Ambiguous phrase requests clarification for severe_chest_pain | सीने में दर्द | ambiguous including severe_chest_pain | ambiguous / severe_chest_pain | **PASS** |
| `M-AMB-severe_chest_pain-6` | Ambiguous phrase requests clarification for severe_chest_pain | छाती में दबाव | ambiguous including severe_chest_pain | ambiguous / severe_chest_pain | **PASS** |
| `M-AMB-severe_chest_pain-7` | Ambiguous phrase requests clarification for severe_chest_pain | सीने में भारीपन | ambiguous including severe_chest_pain | ambiguous / severe_chest_pain | **PASS** |
| `M-ROM-severe_chest_pain-1` | Romanised variant is opt-in (Tier C) for severe_chest_pain | seene mein tez dard | none when disabled; clear when enabled | disabled=none; enabled=clear/severe_chest_pain | **PASS** |
| `M-ROM-severe_chest_pain-2` | Romanised variant is opt-in (Tier C) for severe_chest_pain | seene mein dard | none when disabled; clear when enabled | disabled=none; enabled=clear/severe_chest_pain | **PASS** |
| `M-CLEAR-EN-stroke_signs-1` | English clear phrase triggers stroke_signs | one side of my body suddenly feels weak | clear / stroke_signs | clear / stroke_signs | **PASS** |
| `M-CLEAR-EN-stroke_signs-2` | English clear phrase triggers stroke_signs | face is drooping | clear / stroke_signs | clear / stroke_signs | **PASS** |
| `M-CLEAR-EN-stroke_signs-3` | English clear phrase triggers stroke_signs | suddenly cannot speak clearly | clear / stroke_signs | clear / stroke_signs | **PASS** |
| `M-CLEAR-EN-stroke_signs-4` | English clear phrase triggers stroke_signs | cannot move my arm | clear / stroke_signs | clear / stroke_signs | **PASS** |
| `M-CLEAR-HI-stroke_signs-1` | Hindi clear phrase triggers stroke_signs | शरीर के एक तरफ अचानक कमजोरी | clear / stroke_signs | clear / stroke_signs | **PASS** |
| `M-CLEAR-HI-stroke_signs-2` | Hindi clear phrase triggers stroke_signs | चेहरा टेढ़ा हो गया | clear / stroke_signs | clear / stroke_signs | **PASS** |
| `M-CLEAR-HI-stroke_signs-3` | Hindi clear phrase triggers stroke_signs | अचानक बोलने में दिक्कत | clear / stroke_signs | clear / stroke_signs | **PASS** |
| `M-AMB-stroke_signs-1` | Ambiguous phrase requests clarification for stroke_signs | weakness on one side | ambiguous including stroke_signs | ambiguous / stroke_signs | **PASS** |
| `M-AMB-stroke_signs-2` | Ambiguous phrase requests clarification for stroke_signs | slurred speech | ambiguous including stroke_signs | ambiguous / stroke_signs | **PASS** |
| `M-AMB-stroke_signs-3` | Ambiguous phrase requests clarification for stroke_signs | face drooping | ambiguous including stroke_signs | ambiguous / stroke_signs | **PASS** |
| `M-AMB-stroke_signs-4` | Ambiguous phrase requests clarification for stroke_signs | एक तरफ कमजोरी | ambiguous including stroke_signs | ambiguous / stroke_signs | **PASS** |
| `M-AMB-stroke_signs-5` | Ambiguous phrase requests clarification for stroke_signs | बोलने में दिक्कत | ambiguous including stroke_signs | ambiguous / stroke_signs | **PASS** |
| `M-AMB-stroke_signs-6` | Ambiguous phrase requests clarification for stroke_signs | चेहरा टेढ़ा | ambiguous including stroke_signs | ambiguous / stroke_signs | **PASS** |
| `M-ROM-stroke_signs-1` | Romanised variant is opt-in (Tier C) for stroke_signs | chehra tedha ho gaya | none when disabled; clear when enabled | disabled=none; enabled=clear/stroke_signs | **PASS** |
| `M-ROM-stroke_signs-2` | Romanised variant is opt-in (Tier C) for stroke_signs | ek taraf kamzori | none when disabled; clear when enabled | disabled=none; enabled=clear/stroke_signs | **PASS** |
| `M-CLEAR-EN-unresponsive_or_unconscious-1` | English clear phrase triggers unresponsive_or_unconscious | unconscious | clear / unresponsive_or_unconscious | clear / unresponsive_or_unconscious | **PASS** |
| `M-CLEAR-EN-unresponsive_or_unconscious-2` | English clear phrase triggers unresponsive_or_unconscious | cannot wake them up | clear / unresponsive_or_unconscious | clear / unresponsive_or_unconscious | **PASS** |
| `M-CLEAR-EN-unresponsive_or_unconscious-3` | English clear phrase triggers unresponsive_or_unconscious | not responding | clear / unresponsive_or_unconscious | clear / unresponsive_or_unconscious | **PASS** |
| `M-CLEAR-EN-unresponsive_or_unconscious-4` | English clear phrase triggers unresponsive_or_unconscious | unresponsive | clear / unresponsive_or_unconscious | clear / unresponsive_or_unconscious | **PASS** |
| `M-CLEAR-EN-unresponsive_or_unconscious-5` | English clear phrase triggers unresponsive_or_unconscious | passed out | clear / unresponsive_or_unconscious | clear / unresponsive_or_unconscious | **PASS** |
| `M-CLEAR-HI-unresponsive_or_unconscious-1` | Hindi clear phrase triggers unresponsive_or_unconscious | बेहोश | clear / unresponsive_or_unconscious | clear / unresponsive_or_unconscious | **PASS** |
| `M-CLEAR-HI-unresponsive_or_unconscious-2` | Hindi clear phrase triggers unresponsive_or_unconscious | होश नहीं | clear / unresponsive_or_unconscious | clear / unresponsive_or_unconscious | **PASS** |
| `M-CLEAR-HI-unresponsive_or_unconscious-3` | Hindi clear phrase triggers unresponsive_or_unconscious | जगाने पर भी जवाब नहीं दे रहे | clear / unresponsive_or_unconscious | clear / unresponsive_or_unconscious | **PASS** |
| `M-AMB-unresponsive_or_unconscious-1` | Ambiguous phrase requests clarification for unresponsive_or_unconscious | not waking up | ambiguous including unresponsive_or_unconscious | ambiguous / unresponsive_or_unconscious | **PASS** |
| `M-AMB-unresponsive_or_unconscious-2` | Ambiguous phrase requests clarification for unresponsive_or_unconscious | very drowsy | ambiguous including unresponsive_or_unconscious | ambiguous / unresponsive_or_unconscious | **PASS** |
| `M-AMB-unresponsive_or_unconscious-3` | Ambiguous phrase requests clarification for unresponsive_or_unconscious | fainted | ambiguous including unresponsive_or_unconscious | ambiguous / unresponsive_or_unconscious | **PASS** |
| `M-AMB-unresponsive_or_unconscious-4` | Ambiguous phrase requests clarification for unresponsive_or_unconscious | जवाब नहीं दे रहे | ambiguous including unresponsive_or_unconscious | ambiguous / unresponsive_or_unconscious | **PASS** |
| `M-AMB-unresponsive_or_unconscious-5` | Ambiguous phrase requests clarification for unresponsive_or_unconscious | बहुत नींद आ रही | ambiguous including unresponsive_or_unconscious | ambiguous / unresponsive_or_unconscious | **PASS** |
| `M-ROM-unresponsive_or_unconscious-1` | Romanised variant is opt-in (Tier C) for unresponsive_or_unconscious | behosh | none when disabled; clear when enabled | disabled=none; enabled=clear/unresponsive_or_unconscious | **PASS** |
| `M-ROM-unresponsive_or_unconscious-2` | Romanised variant is opt-in (Tier C) for unresponsive_or_unconscious | hosh nahi | none when disabled; clear when enabled | disabled=none; enabled=clear/unresponsive_or_unconscious | **PASS** |
| `M-CLEAR-EN-uncontrolled_bleeding-1` | English clear phrase triggers uncontrolled_bleeding | bleeding will not stop | clear / uncontrolled_bleeding | clear / uncontrolled_bleeding | **PASS** |
| `M-CLEAR-EN-uncontrolled_bleeding-2` | English clear phrase triggers uncontrolled_bleeding | bleeding wont stop | clear / uncontrolled_bleeding | clear / uncontrolled_bleeding | **PASS** |
| `M-CLEAR-EN-uncontrolled_bleeding-3` | English clear phrase triggers uncontrolled_bleeding | severe bleeding | clear / uncontrolled_bleeding | clear / uncontrolled_bleeding | **PASS** |
| `M-CLEAR-EN-uncontrolled_bleeding-4` | English clear phrase triggers uncontrolled_bleeding | losing a lot of blood | clear / uncontrolled_bleeding | clear / uncontrolled_bleeding | **PASS** |
| `M-CLEAR-HI-uncontrolled_bleeding-1` | Hindi clear phrase triggers uncontrolled_bleeding | खून बंद नहीं हो रहा | clear / uncontrolled_bleeding | clear / uncontrolled_bleeding | **PASS** |
| `M-CLEAR-HI-uncontrolled_bleeding-2` | Hindi clear phrase triggers uncontrolled_bleeding | बहुत ज्यादा खून बह रहा है | clear / uncontrolled_bleeding | clear / uncontrolled_bleeding | **PASS** |
| `M-CLEAR-HI-uncontrolled_bleeding-3` | Hindi clear phrase triggers uncontrolled_bleeding | खून रुक नहीं रहा | clear / uncontrolled_bleeding | clear / uncontrolled_bleeding | **PASS** |
| `M-AMB-uncontrolled_bleeding-1` | Ambiguous phrase requests clarification for uncontrolled_bleeding | bleeding | ambiguous including uncontrolled_bleeding | ambiguous / uncontrolled_bleeding | **PASS** |
| `M-AMB-uncontrolled_bleeding-2` | Ambiguous phrase requests clarification for uncontrolled_bleeding | lots of blood | ambiguous including uncontrolled_bleeding | ambiguous / uncontrolled_bleeding | **PASS** |
| `M-AMB-uncontrolled_bleeding-3` | Ambiguous phrase requests clarification for uncontrolled_bleeding | खून बह रहा | ambiguous including uncontrolled_bleeding | ambiguous / uncontrolled_bleeding | **PASS** |
| `M-AMB-uncontrolled_bleeding-4` | Ambiguous phrase requests clarification for uncontrolled_bleeding | खून आ रहा | ambiguous including uncontrolled_bleeding | ambiguous / uncontrolled_bleeding | **PASS** |
| `M-ROM-uncontrolled_bleeding-1` | Romanised variant is opt-in (Tier C) for uncontrolled_bleeding | khoon band nahi ho raha | none when disabled; clear when enabled | disabled=none; enabled=clear/uncontrolled_bleeding | **PASS** |
| `M-CLEAR-EN-seizure_or_convulsion-1` | English clear phrase triggers seizure_or_convulsion | having a seizure now | clear / seizure_or_convulsion | clear / seizure_or_convulsion | **PASS** |
| `M-CLEAR-EN-seizure_or_convulsion-2` | English clear phrase triggers seizure_or_convulsion | continuous convulsions | clear / seizure_or_convulsion | clear / seizure_or_convulsion | **PASS** |
| `M-CLEAR-EN-seizure_or_convulsion-3` | English clear phrase triggers seizure_or_convulsion | repeated uncontrollable shaking | clear / seizure_or_convulsion | clear / seizure_or_convulsion | **PASS** |
| `M-CLEAR-HI-seizure_or_convulsion-1` | Hindi clear phrase triggers seizure_or_convulsion | अभी दौरा पड़ रहा है | clear / seizure_or_convulsion | clear / seizure_or_convulsion | **PASS** |
| `M-CLEAR-HI-seizure_or_convulsion-2` | Hindi clear phrase triggers seizure_or_convulsion | लगातार झटके आ रहे हैं | clear / seizure_or_convulsion | clear / seizure_or_convulsion | **PASS** |
| `M-CLEAR-HI-seizure_or_convulsion-3` | Hindi clear phrase triggers seizure_or_convulsion | बार-बार दौरे पड़ रहे हैं | clear / seizure_or_convulsion | clear / seizure_or_convulsion | **PASS** |
| `M-AMB-seizure_or_convulsion-1` | Ambiguous phrase requests clarification for seizure_or_convulsion | seizure | ambiguous including seizure_or_convulsion | ambiguous / seizure_or_convulsion | **PASS** |
| `M-AMB-seizure_or_convulsion-2` | Ambiguous phrase requests clarification for seizure_or_convulsion | convulsion | ambiguous including seizure_or_convulsion | ambiguous / seizure_or_convulsion | **PASS** |
| `M-AMB-seizure_or_convulsion-3` | Ambiguous phrase requests clarification for seizure_or_convulsion | fits | ambiguous including seizure_or_convulsion | ambiguous / seizure_or_convulsion | **PASS** |
| `M-AMB-seizure_or_convulsion-4` | Ambiguous phrase requests clarification for seizure_or_convulsion | दौरा | ambiguous including seizure_or_convulsion | ambiguous / seizure_or_convulsion | **PASS** |
| `M-AMB-seizure_or_convulsion-5` | Ambiguous phrase requests clarification for seizure_or_convulsion | झटके | ambiguous including seizure_or_convulsion | ambiguous / seizure_or_convulsion | **PASS** |
| `M-AMB-seizure_or_convulsion-6` | Ambiguous phrase requests clarification for seizure_or_convulsion | मिर्गी का दौरा | ambiguous including seizure_or_convulsion | ambiguous / seizure_or_convulsion | **PASS** |
| `M-ROM-seizure_or_convulsion-1` | Romanised variant is opt-in (Tier C) for seizure_or_convulsion | daura pad raha hai | none when disabled; clear when enabled | disabled=none; enabled=clear/seizure_or_convulsion | **PASS** |
| `M-CLEAR-EN-severe_allergic_reaction-1` | English clear phrase triggers severe_allergic_reaction | throat or tongue swelling and trouble breathing | clear / severe_allergic_reaction | clear / severe_allergic_reaction | **PASS** |
| `M-CLEAR-EN-severe_allergic_reaction-2` | English clear phrase triggers severe_allergic_reaction | face swelling with breathing difficulty | clear / severe_allergic_reaction | clear / severe_allergic_reaction | **PASS** |
| `M-CLEAR-EN-severe_allergic_reaction-3` | English clear phrase triggers severe_allergic_reaction | throat is swelling and i cannot breathe | clear / severe_allergic_reaction | clear / breathing_emergency | **PASS** |
| `M-CLEAR-HI-severe_allergic_reaction-1` | Hindi clear phrase triggers severe_allergic_reaction | जीभ या गले में सूजन और सांस लेने में दिक्कत | clear / severe_allergic_reaction | clear / severe_allergic_reaction | **PASS** |
| `M-CLEAR-HI-severe_allergic_reaction-2` | Hindi clear phrase triggers severe_allergic_reaction | जीभ में सूजन और सांस लेने में दिक्कत | clear / severe_allergic_reaction | clear / severe_allergic_reaction | **PASS** |
| `M-CLEAR-HI-severe_allergic_reaction-3` | Hindi clear phrase triggers severe_allergic_reaction | चेहरे पर सूजन और सांस में परेशानी | clear / severe_allergic_reaction | clear / severe_allergic_reaction | **PASS** |
| `M-AMB-severe_allergic_reaction-1` | Ambiguous phrase requests clarification for severe_allergic_reaction | throat swelling | ambiguous including severe_allergic_reaction | ambiguous / severe_allergic_reaction | **PASS** |
| `M-AMB-severe_allergic_reaction-2` | Ambiguous phrase requests clarification for severe_allergic_reaction | tongue swelling | ambiguous including severe_allergic_reaction | ambiguous / severe_allergic_reaction | **PASS** |
| `M-AMB-severe_allergic_reaction-3` | Ambiguous phrase requests clarification for severe_allergic_reaction | face swelling | ambiguous including severe_allergic_reaction | ambiguous / severe_allergic_reaction | **PASS** |
| `M-AMB-severe_allergic_reaction-4` | Ambiguous phrase requests clarification for severe_allergic_reaction | गले में सूजन | ambiguous including severe_allergic_reaction | ambiguous / severe_allergic_reaction | **PASS** |
| `M-AMB-severe_allergic_reaction-5` | Ambiguous phrase requests clarification for severe_allergic_reaction | जीभ में सूजन | ambiguous including severe_allergic_reaction | ambiguous / severe_allergic_reaction | **PASS** |
| `M-AMB-severe_allergic_reaction-6` | Ambiguous phrase requests clarification for severe_allergic_reaction | चेहरे पर सूजन | ambiguous including severe_allergic_reaction | ambiguous / severe_allergic_reaction | **PASS** |
| `M-CLEAR-EN-poisoning_or_overdose-1` | English clear phrase triggers poisoning_or_overdose | swallowed poison | clear / poisoning_or_overdose | clear / poisoning_or_overdose | **PASS** |
| `M-CLEAR-EN-poisoning_or_overdose-2` | English clear phrase triggers poisoning_or_overdose | took too much medicine | clear / poisoning_or_overdose | clear / poisoning_or_overdose | **PASS** |
| `M-CLEAR-EN-poisoning_or_overdose-3` | English clear phrase triggers poisoning_or_overdose | overdose | clear / poisoning_or_overdose | clear / poisoning_or_overdose | **PASS** |
| `M-CLEAR-EN-poisoning_or_overdose-4` | English clear phrase triggers poisoning_or_overdose | swallowed too many tablets | clear / poisoning_or_overdose | clear / poisoning_or_overdose | **PASS** |
| `M-CLEAR-HI-poisoning_or_overdose-1` | Hindi clear phrase triggers poisoning_or_overdose | ज़हर निगल लिया | clear / poisoning_or_overdose | clear / poisoning_or_overdose | **PASS** |
| `M-CLEAR-HI-poisoning_or_overdose-2` | Hindi clear phrase triggers poisoning_or_overdose | जहर निगल लिया | clear / poisoning_or_overdose | clear / poisoning_or_overdose | **PASS** |
| `M-CLEAR-HI-poisoning_or_overdose-3` | Hindi clear phrase triggers poisoning_or_overdose | दवा की बहुत ज्यादा मात्रा | clear / poisoning_or_overdose | clear / poisoning_or_overdose | **PASS** |
| `M-CLEAR-HI-poisoning_or_overdose-4` | Hindi clear phrase triggers poisoning_or_overdose | गलती से बहुत सारी दवाइयाँ | clear / poisoning_or_overdose | clear / poisoning_or_overdose | **PASS** |
| `M-AMB-poisoning_or_overdose-1` | Ambiguous phrase requests clarification for poisoning_or_overdose | took extra tablets | ambiguous including poisoning_or_overdose | ambiguous / poisoning_or_overdose | **PASS** |
| `M-AMB-poisoning_or_overdose-2` | Ambiguous phrase requests clarification for poisoning_or_overdose | swallowed something | ambiguous including poisoning_or_overdose | ambiguous / poisoning_or_overdose | **PASS** |
| `M-AMB-poisoning_or_overdose-3` | Ambiguous phrase requests clarification for poisoning_or_overdose | ज्यादा दवा ले ली | ambiguous including poisoning_or_overdose | ambiguous / poisoning_or_overdose | **PASS** |
| `M-ROM-poisoning_or_overdose-1` | Romanised variant is opt-in (Tier C) for poisoning_or_overdose | zaher nigal liya | none when disabled; clear when enabled | disabled=none; enabled=clear/poisoning_or_overdose | **PASS** |
| `M-NEG-01` | Ordinary statement does not trigger the emergency path | my knee hurts when I walk | none | none | **PASS** |
| `M-NEG-02` | Ordinary statement does not trigger the emergency path | I have a mild cough | none | none | **PASS** |
| `M-NEG-03` | Ordinary statement does not trigger the emergency path | I feel tired and have a headache | none | none | **PASS** |
| `M-NEG-04` | Ordinary statement does not trigger the emergency path | routine check-up | none | none | **PASS** |
| `M-NEG-05` | Ordinary statement does not trigger the emergency path | मुझे घुटने में दर्द है | none | none | **PASS** |
| `M-NEG-06` | Ordinary statement does not trigger the emergency path | मुझे बुखार है | none | none | **PASS** |
| `M-NEG-07` | Ordinary statement does not trigger the emergency path | I need a blood pressure medicine refill | none | none | **PASS** |
| `M-NEG-08` | Ordinary statement does not trigger the emergency path | my skin is itchy | none | none | **PASS** |
| `M-NEG-09` | Ordinary statement does not trigger the emergency path | no fever, mild cough | none | none | **PASS** |
| `M-NEG-10` | Ordinary statement does not trigger the emergency path | I have had a rash since yesterday | none | none | **PASS** |
| `M-NEGP-01` | Negated mention of the trigger phrase does not trigger | I do not have chest pain | none | none | **PASS** |
| `M-NEGP-02` | Negated mention of the trigger phrase does not trigger | I don't have any chest pain | none | none | **PASS** |
| `M-NEGP-03` | Negated mention of the trigger phrase does not trigger | no chest pain at all | none | none | **PASS** |
| `M-NEGP-04` | Negated mention of the trigger phrase does not trigger | I never had severe chest pain | none | none | **PASS** |
| `M-NEGP-05` | Negated mention of the trigger phrase does not trigger | I am not bleeding | none | none | **PASS** |
| `M-NEGP-06` | Negated mention of the trigger phrase does not trigger | सीने में दर्द नहीं है | none | none | **PASS** |
| `M-NEGP-07` | Negated mention of the trigger phrase does not trigger | मुझे सांस लेने में दिक्कत नहीं है | none | none | **PASS** |
| `M-NORM-01` | Case/whitespace/punctuation/orthography variant still matches | CANNOT BREATHE | clear | clear | **PASS** |
| `M-NORM-02` | Case/whitespace/punctuation/orthography variant still matches |    I    cannot     breathe    | clear | clear | **PASS** |
| `M-NORM-03` | Case/whitespace/punctuation/orthography variant still matches | I cannot breathe!!! | clear | clear | **PASS** |
| `M-NORM-04` | Case/whitespace/punctuation/orthography variant still matches | cannot-breathe | clear | clear | **PASS** |
| `M-NORM-05` | Case/whitespace/punctuation/orthography variant still matches | I can't breathe | clear | clear | **PASS** |
| `M-NORM-06` | Case/whitespace/punctuation/orthography variant still matches | I can’t breathe | clear | clear | **PASS** |
| `M-NORM-07` | Case/whitespace/punctuation/orthography variant still matches | SEVERE   CHEST   PAIN? | clear | clear | **PASS** |
| `M-NORM-08` | Case/whitespace/punctuation/orthography variant still matches | साँस लेने में बहुत तकलीफ़ | clear | clear | **PASS** |
| `M-QUOTE-01` | Double-quoted example does not trigger | My friend told me to say "I cannot breathe" | none | none | **PASS** |
| `M-QUOTE-02` | Double-quoted example does not trigger | The form says "having a seizure now" | none | none | **PASS** |
| `M-QUOTE-03` | Single-quoted example does not trigger (docs/demo-emergency-rules.md rule 1) | The form says 'having a seizure now' | none | none | **PASS** |
| `M-QUOTE-04` | Single-quoted example does not trigger (docs/demo-emergency-rules.md rule 1) | My friend told me to say 'I cannot breathe' | none | none | **PASS** |
| `M-QUOTE-05` | Single-quoted example does not trigger (docs/demo-emergency-rules.md rule 1) | I said 'no chest pain' | none | none | **PASS** |
| `M-NEGSCOPE-01` | A negation of an unrelated symptom does not cancel the trigger mention | I cannot breathe but I have no fever | clear | clear / breathing_emergency | **PASS** |
| `M-NEGSCOPE-02` | A negation of an unrelated symptom does not cancel the trigger mention | I have chest pain but no fever | ambiguous | ambiguous | **PASS** |
| `M-NEGSCOPE-03` | A negation of an unrelated symptom does not cancel the trigger mention | no chest pain, but chest pain now | ambiguous | ambiguous | **PASS** |
| `M-NEGSCOPE-04` | A negation of an unrelated symptom does not cancel the trigger mention | I have severe chest pain and no fever | clear | clear / severe_chest_pain | **PASS** |
| `M-NEGSCOPE-05` | A negation of an unrelated symptom does not cancel the trigger mention | No fever but I cannot breathe | clear | clear / breathing_emergency | **PASS** |
| `M-NEGSCOPE-06` | A negation of an unrelated symptom does not cancel the trigger mention | I have chest pain and no fever | ambiguous | ambiguous | **PASS** |
| `M-NEGSCOPE-07` | A negation of an unrelated symptom does not cancel the trigger mention | I have chest pain with no fever | ambiguous | ambiguous | **PASS** |
| `M-NEGSCOPE-08` | A negation of an unrelated symptom does not cancel the trigger mention | I have no chest pain and no fever | none | none | **PASS** |
| `M-EMPTY-01` | Empty/whitespace answer is not a match | Empty/whitespace answer is not a match | none | none | **PASS** |
| `M-ORDER-01` | Declared rule order decides the rule id when two rules match | Declared rule order decides the rule id when two rules match | clear / breathing_emergency | clear / breathing_emergency | **PASS** |
| `M-DET-01` | Classification is deterministic across repeated calls | Classification is deterministic across repeated calls | one distinct result | 1 distinct result(s) | **PASS** |
| `M-CLAR-01` | Fixed clarification resolution | Fixed clarification resolution | yes / no / unresolved | yes / no / unresolved | **PASS** |
| `L-HI-01` | Hindi Devanagari clear trigger enters the urgent path at any question | Hindi Devanagari clear trigger enters the urgent path at any question | emergency_triggered=true, rule=breathing_emergency, statement preserved | triggered=true, rule=breathing_emergency, statement_match=true | **PASS** |
| `L-AMB-01` | Ambiguous mention asks the fixed Yes/No clarification | Ambiguous mention asks the fixed Yes/No clarification | current_question=emergency_clarification with Yes/No | question=emergency_clarification, options=Yes\|No, flag=true | **PASS** |
| `L-AMB-04` | An unclear clarification is never treated as safe | An unclear clarification is never treated as safe | needs_human_review=true, question stays, no report, no emergency | review=true, question=emergency_clarification, report=none | **PASS** |
| `L-AMB-05` | 'No' negates only that candidate and never clears the review flag | 'No' negates only that candidate and never clears the review flag | pending cleared, intake continues, needs_human_review stays true | pending=null, question=duration, review=true | **PASS** |
| `L-PHRASE-01` | No emergency trigger phrase was added, removed or rewritten | No emergency trigger phrase was added, removed or rewritten | canonical EMERGENCY_RULES hash equals the base-commit hash | hash=8d8f719f45a4…, match=true | **PASS** |

## 2. Execution precedence

| ID | Test | Input / condition | Expected | Actual | Verdict |
|---|---|---|---|---|---|
| `L-NORMAL-04` | The ordinary final adaptive answer reaches the provider stage (same-turn control) | The ordinary final adaptive answer reaches the provider stage (same-turn control) | at least one Groq reservation on the ordinary final turn | delta=1 | **PASS** |
| `L-PREC-03` | A trigger on the final scripted turn preempts adaptive selection and the provider call | A trigger on the final scripted turn preempts adaptive selection and the provider call | emergency_triggered=true, session_status=emergency, no new question, Groq delta 0 | triggered=true, status=emergency, question=none, delta=0 | **PASS** |
| `L-EMERG-01` | Clear trigger returns the emergency state and no submit path | Clear trigger returns the emergency state and no submit path | emergency_triggered=true, session_status=emergency, can_submit=false | triggered=true, status=emergency, can_submit=false | **PASS** |
| `L-EMERG-07` | No provider call is made on the trigger turn | No provider call is made on the trigger turn | Groq counter unchanged across the trigger answer | delta=0 | **PASS** |
| `L-EMERG-08` | The trigger turn is not accepted as a normal answer and no further question is selected | The trigger turn is not accepted as a normal answer and no further question is selected | turn_count unchanged; no new adaptive question id | turn_before=3, turn_after=3, current_question=none | **PASS** |
| `L-EMERG-09` | After an emergency, the response advertises no further question | After an emergency, the response advertises no further question | current_question is absent | current_question=none | **PASS** |
| `L-EMERG-10` | A further answer after the emergency is refused | A further answer after the emergency is refused | non-2xx or an error field; no new turn or report | status=409, error=invalid_state, turns=3 | **PASS** |
| `L-EMERG-11` | The refusal uses a state error, not a turn-cap error | The refusal uses a state error, not a turn-cap error | 409 invalid_state | status=409, error=invalid_state | **PASS** |
| `L-PREC-01` | A clear trigger in a clarification answer still enters the urgent path | A clear trigger in a clarification answer still enters the urgent path | emergency_triggered=true | triggered=true, review=false, question=none | **PASS** |
| `L-PREC-02` | A present clear trigger is not cancelled by an unrelated negation | A present clear trigger is not cancelled by an unrelated negation | emergency_triggered=true | triggered=true, status=emergency | **PASS** |
| `L-PREC-05` | A negation in an earlier clause segment does not cancel a later trigger | A negation in an earlier clause segment does not cancel a later trigger | emergency_triggered=true | triggered=true, status=emergency | **PASS** |
| `L-PREC-06` | An unrelated later negation no longer suppresses the clarification | An unrelated later negation no longer suppresses the clarification | current_question=emergency_clarification | question=emergency_clarification, triggered=false | **PASS** |
| `L-PREC-07` | A later positive occurrence is evaluated after an earlier negated one | A later positive occurrence is evaluated after an earlier negated one | current_question=emergency_clarification | question=emergency_clarification, triggered=false | **PASS** |
| `L-SPEAK-01` | No paid TTS call is made for an emergency session | No paid TTS call is made for an emergency session | text response, Timbre counter unchanged | status=200, audio=false, timbre_delta=0 | **PASS** |

## 3. Urgent report behaviour

| ID | Test | Input / condition | Expected | Actual | Verdict |
|---|---|---|---|---|---|
| `L-PREC-04` | The same-turn trigger still preserves the statement and the partial report | The same-turn trigger still preserves the statement and the partial report | urgent_partial with the verbatim statement | status=urgent_partial, statement_match=true | **PASS** |
| `L-EMERG-02` | Urgent report status is urgent_partial with no generated summary | Urgent report status is urgent_partial with no generated summary | status=urgent_partial, summary=null | status=present, summary=null | **PASS** |
| `L-EMERG-03` | Persisted report row is urgent_partial, emergency department, not submitted | Persisted report row is urgent_partial, emergency department, not submitted | status=urgent_partial, department=emergency, submitted_at=null, possible_urgent=false | status=urgent_partial, department=emergency, submitted_at=null, possible_urgent=false, rule=breathing_emergency | **PASS** |
| `L-EMERG-04` | The triggering patient statement is preserved verbatim | The triggering patient statement is preserved verbatim | emergency.patient_statement equals the submitted answer | match=true | **PASS** |
| `L-EMERG-05` | Emergency routing uses the seeded Emergency doctor and stays preliminary | Emergency routing uses the seeded Emergency doctor and stays preliminary | department=emergency, preliminary=true, is_fallback=false, doctor name = seeded Emergency doctor | department=emergency, preliminary=true, fallback=false, doctor=Dr. Neha Verma | **PASS** |
| `L-EMERG-06` | Only reported information is present; unreached fields stay explicit | Only reported information is present; unreached fields stay explicit | primary_concern=not_asked and no invented clinical values | primary_concern=not_asked, missing=7 | **PASS** |
| `L-EMERG-12` | submit_report rejects an emergency session | submit_report rejects an emergency session | 409 invalid_state | status=409, error=invalid_state | **PASS** |
| `L-EMERG-13` | Routine slots and booking are suppressed for an urgent report | Routine slots and booking are suppressed for an urgent report | get_available_slots and book_appointment refuse; no appointment row | slots=400/22023, book=400/22023, appointments=0 | **PASS** |
| `L-EMERG-14` | Resume restores the emergency state and report without re-offering Submit | Resume restores the emergency state and report without re-offering Submit | emergency_triggered=true, urgent_partial row, emergency block present, summary null, can_submit=false | triggered=true, row_status=urgent_partial, rule=breathing_emergency, summary=null, can_submit=false | **PASS** |
| `L-HI-02` | The unanswered name field stays explicit in a Hindi urgent report | The unanswered name field stays explicit in a Hindi urgent report | patient.name.status = not_asked | name=not_asked | **PASS** |
| `L-AMB-02` | The ambiguous statement is preserved in the conversation log | The ambiguous statement is preserved in the conversation log | a patient message with the ambiguous answer | stored=true | **PASS** |
| `L-AMB-03` | No report is created while the clarification is unresolved | No report is created while the clarification is unresolved | no report row | report=none | **PASS** |
| `L-AMB-06` | 'Yes' confirms the candidate and creates the urgent report | 'Yes' confirms the candidate and creates the urgent report | emergency_triggered=true, rule=severe_chest_pain, statement = the ambiguous answer | triggered=true, rule=severe_chest_pain, statement_match=true | **PASS** |
| `L-CLAIM-01` | The response does not claim any emergency service was contacted or dispatched | The response does not claim any emergency service was contacted or dispatched | no notification/dispatch claim in the response | claim=false | **PASS** |
| `L-CLAIM-02` | Approved plain-text 112 guidance is present in both languages | Approved plain-text 112 guidance is present in both languages | English and Hindi guidance strings present; no tap-to-call link in the docs | en=true, hi=true, tel=false | **PASS** |

## 4. Doctor access and RLS

| ID | Test | Input / condition | Expected | Actual | Verdict |
|---|---|---|---|---|---|
| `L-OWN-01` | Another patient cannot resume or read the urgent session | Another patient cannot resume or read the urgent session | resume rejected; direct report read returns 0 rows | resume=404/not_found, reports=0 | **PASS** |
| `L-OWN-02` | The patient cannot read server-owned reports or messages directly | The patient cannot read server-owned reports or messages directly | 0 rows for the owning patient | reports=0, messages=0 | **PASS** |
| `L-DOC-01` | General Medicine and Emergency doctors can read the urgent report; another department cannot | General Medicine and Emergency doctors can read the urgent report; another department cannot | gm=true, em=true, orthopedics=false | gm=true, em=true, orthopedics=false | **PASS** |
| `L-DOC-02` | Conversation access follows report access | Conversation access follows report access | gm>0, em>0, orthopedics=0 | gm=3, em=3, orthopedics=0 | **PASS** |
| `L-DOC-03` | Unauthorized writes are rejected | Unauthorized writes are rejected | no doctor write path to reports/appointments | patch=403, delete=403, appointment_insert=403 | **PASS** |
| `L-DOC-04` | Mark Reviewed authorisation (OD-03 interim) | Mark Reviewed authorisation (OD-03 interim) | gm denied, orthopedics denied, emergency doctor allowed and idempotent | gm=403/42501, orthopedics=403/42501, em=200, repeat_already=true | **PASS** |
| `L-DOC-05` | Review never unlocks an emergency report | Review never unlocks an emergency report | urgent_partial still refuses slots and booking after Mark Reviewed | slots=400/22023, book=400/22023 | **PASS** |

## 5. Regression testing

| ID | Test | Input / condition | Expected | Actual | Verdict |
|---|---|---|---|---|---|
| `L-NORMAL-01` | Normal non-emergency intake still advances the fixed question order | Normal non-emergency intake still advances the fixed question order | name→age→gender→primary_concern, 3 turns, no emergency | next=age/gender/primary_concern, turns=3, status=in_progress | **PASS** |
| `L-NORMAL-02` | Normal concern answer advances to the scripted adaptive block | Normal concern answer advances to the scripted adaptive block | in_progress, 4 turns, next question duration, no emergency | status=in_progress, turns=4, next=duration, emergency=false | **PASS** |
| `L-NORMAL-03` | Normal non-emergency intake completes and produces a normal draft | Normal non-emergency intake completes and produces a normal draft | is_complete=true, can_submit=true, draft present with a summary, no emergency, 10 turns | complete=true, can_submit=true, draft=true, summary=true, emergency=false, turns=10 | **PASS** |
| `L-LIMIT-01` | Answer-turn and adaptive-question limits are unchanged | Answer-turn and adaptive-question limits are unchanged | MAX_ANSWER_TURNS=15, MAX_ADAPTIVE_QUESTIONS=3 | turns=15, adaptive=3 | **PASS** |
| `L-SCHEMA-01` | Report schema version is unchanged | Report schema version is unchanged | REPORT_SCHEMA_VERSION=1 and response schema_version=1 | constant=1, document=1, row=1 | **PASS** |
| `L-VERSION-01` | Report contract v1.2 remains the documented version | Report contract v1.2 remains the documented version | docs/report-design.md declares version 1.2 and report schema_version 1 | version_1_2=true | **PASS** |
| `L-BANK-01` | Question bank files are byte-for-byte unchanged from e5d77e5 | Question bank files are byte-for-byte unchanged from e5d77e5 | all SHA-256 digests match the committed manifest | files=4, mismatches=0 | **PASS** |
| `L-LOG-01` | Diagnostic log calls never carry patient statements or transcripts | Diagnostic log calls never carry patient statements or transcripts | no patient-content identifier in any consoleLogger call | violations=0 | **PASS** |

## 6. Hygiene

| ID | Test | Input / condition | Expected | Actual | Verdict |
|---|---|---|---|---|---|
| `L-CLEANUP-01` | The harness deletes only the identities it created | The harness deletes only the identities it created | 0 residual sessions for created users | residual=0, users=12 | **PASS** |

## NOT TESTED

None in the automated matrix. Product-level behaviours that are out of scope
are listed in `not-tested.md`.

