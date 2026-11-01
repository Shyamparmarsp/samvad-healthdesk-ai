# Demo Emergency Rules — Not Clinically Validated

> **Critical disclaimer:** This is a starter phrase list for a student demonstration only. It is **not clinically validated**, is not a medical triage protocol, and must not be used for real patients. Phrase matching can miss emergencies and can also produce false positives. A lack of a match does not mean a person is safe. Qualified clinicians must review and replace these rules before any real-world use.

## Demo response text

**English:**

> Your answer may indicate an urgent situation. This demonstration cannot assess or treat emergencies. Please call **112** now or go to the nearest emergency department. Do not wait for a routine appointment.

**Hindi:**

> आपके जवाब से आपातकालीन स्थिति की संभावना हो सकती है। यह डेमो आपात स्थिति का आकलन या इलाज नहीं कर सकता। कृपया अभी **112** पर कॉल करें या नज़दीकी अस्पताल के इमरजेंसी विभाग में जाएँ। सामान्य अपॉइंटमेंट का इंतज़ार न करें।

Show this text with a large plain-text "112" and the heading "This may be urgent" (Hindi equivalent for Hindi sessions). Do not add a tap-to-call link or button. 112 is India's Emergency Response Support System number. The demo only displays this guidance; it does not place a call, dispatch an ambulance or notify a real emergency service.

## Starter phrase categories

These are illustrative positive phrases to test the demo matcher. Include common spelling/transliteration variations where practical. Do not rely on one exact phrase only.

| Rule ID | English examples | Hindi examples | Demo behaviour |
|---|---|---|---|
| `breathing_emergency` | "I cannot breathe", "severe difficulty breathing", "struggling to breathe" | "सांस नहीं आ रही", "साँस लेने में बहुत तकलीफ़", "सांस लेने में दिक्कत हो रही है" | Stop routine intake; show 112 guidance; urgent partial report. |
| `severe_chest_pain` | "severe chest pain", "heavy pressure in my chest", "crushing chest pain" | "सीने में बहुत तेज दर्द", "छाती में तेज दबाव", "सीने में भारीपन और दर्द" | Same urgent path. |
| `stroke_signs` | "one side of my body suddenly feels weak", "face is drooping", "suddenly cannot speak clearly" | "शरीर के एक तरफ अचानक कमजोरी", "चेहरा टेढ़ा हो गया", "अचानक बोलने में दिक्कत" | Same urgent path. |
| `unresponsive_or_unconscious` | "unconscious", "cannot wake them up", "not responding" | "बेहोश हैं", "होश नहीं है", "जगाने पर भी जवाब नहीं दे रहे" | Same urgent path. |
| `uncontrolled_bleeding` | "bleeding will not stop", "severe bleeding", "losing a lot of blood" | "खून बंद नहीं हो रहा", "बहुत ज्यादा खून बह रहा है" | Same urgent path. |
| `seizure_or_convulsion` | "having a seizure now", "continuous convulsions", "repeated uncontrollable shaking" | "अभी दौरा पड़ रहा है", "लगातार झटके आ रहे हैं", "बार-बार दौरे पड़ रहे हैं" | Same urgent path. |
| `severe_allergic_reaction` | "throat or tongue swelling and trouble breathing", "face swelling with breathing difficulty" | "जीभ या गले में सूजन और सांस लेने में दिक्कत", "चेहरे पर सूजन और सांस में परेशानी" | Same urgent path. |
| `poisoning_or_overdose` | "swallowed poison", "took too much medicine", "overdose" | "ज़हर निगल लिया", "दवा की बहुत ज्यादा मात्रा ले ली", "गलती से बहुत सारी दवाइयाँ खा लीं" | Same urgent path. |

## Matching rules

1. Only evaluate the patient's own current answer (spoken transcript or typed text), not an agent question, cached prompt, quoted example or another speaker's text.
2. Do not use naive substring matching alone. Handle common negation such as "I do not have chest pain" / "सीने में दर्द नहीं है". A negated mention must not automatically trigger the rule.
3. If a phrase is ambiguous, ask the fixed question **“Is this happening to you right now?”** with Yes/No chips (Hindi draft: **“क्या यह अभी आपके साथ हो रहा है?”**, buttons **“हाँ” / “नहीं”**; owner must review the Hindi before release). A “Yes” confirms the current demo trigger and enters the urgent path. A “No” negates only that specific candidate; it is not a general safety clearance. Continue routine intake only if no other deterministic rule or review flag remains. If the answer is unclear, free-form without a reliable resolution, or absent, flag `needs_human_review`; do not silently label the person safe and do not permit routine booking while the flag is unresolved.
4. A clear positive match triggers the demo emergency path. Save the triggering phrase/rule identifier for the report, stop routine questions, show the guidance above, route to the seeded Emergency doctor dashboard and suppress all routine slots.
5. Do not treat Groq's `possible_urgent: true` as a deterministic emergency diagnosis. It is a supplementary flag for doctor review. It must never be used to claim `possible_urgent: false` means the patient is safe.
6. If Groq suggests possible urgency without a deterministic rule, flag the report for urgent human review (chip "Needs review" or "Urgent review") and do not automatically book a routine slot until a doctor has used **Mark Reviewed** on it. Do not display the 112 emergency message solely because the model emitted this flag unless the deterministic demo rule or an explicit user-reported emergency warrants it.
7. Do not ask the LLM to diagnose, score disease probability or decide that emergency care is unnecessary.
8. Before finalizing the Hindi rules, test whether Gnani Prisma `hi-IN` returns Devanagari or Roman (Hinglish) text. If it can return Roman text, add Romanized variants of the Hindi phrases (for example "saans nahi aa rahi", "seene mein tez dard") to the matcher. Do not claim Hinglish coverage until tested.

## Emergency workflow in this demo

- Consent must have been explicitly granted before health information is collected.
- On a clear deterministic trigger, stop routine intake immediately.
- Save an `urgent_partial` report from answers received so far; do not wait for the normal report completion or patient booking.
- Assign the report to the seeded Emergency doctor profile. The Emergency doctor and the General Medicine demo doctor can both read it (read-only for the General Medicine doctor beyond Mark Reviewed). The doctor sees it when the dashboard is loaded/refreshed; no realtime alert exists.
- Do not create or show appointment slots for the Emergency department.
- Do not claim a doctor has been notified or that emergency help has been dispatched.
