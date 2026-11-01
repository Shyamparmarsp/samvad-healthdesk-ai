# Samvad HealthDesk AI — Evaluator Demonstration Guide

**Product Name:** Samvad HealthDesk AI  
**Demo Duration:** 5–7 minutes  
**Target Audience:** Hackathon Evaluators, Clinical Informatics Reviewers, and Technical Judges  
**Nature of Project:** Educational Prototype & Pre-visit Intake Demonstration (*Synthetic Data Only — Non-clinical*)

---

## 1. Executive Summary & Architecture Overview

Samvad HealthDesk AI is a bilingual (English / Hindi), voice-first and text-accessible pre-visit hospital intake and smart referral demonstration application. It bridges the gap between patient pre-registration and clinical intake:

```
[Patient Portal: /]
Welcome (EN/HI) ➔ Consent (Explicit Yes/No) ➔ Voice/Text Intake ➔ 
Adaptive Clarification ➔ Draft Report Review ➔ Submit to Hospital ➔ 
Optional Slot Booking

                │ (Assigned Report & Triage Data)
                ▼
[Doctor Portal: /doctor]
Evaluator Login ➔ Dashboard Stats ➔ Reports Queue ➔ 
Report Detail ➔ Mark Reviewed (Audit Stamp) ➔ Appointments Schedule
```

### Safety & Architectural Invariants
1. **Explicit On-Screen Consent:** Consent is strictly an on-screen button press; it is never inferred from conversational speech. Declining consent terminates the session instantly with zero health data stored.
2. **Deterministic Emergency Gate:** Acute danger signs (e.g. crushing chest pain, severe dyspnea) immediately abort routine intake, present plain-text national emergency advice (112), suppress routine doctor booking slots permanently, and route an `urgent_partial` report to the Emergency Triage Queue.
3. **Strict Information Model:** No AI diagnosis, probability guessing, or treatment prescription. Missing values remain explicitly labeled (`not_provided`, `unknown`, `declined`).
4. **Server-Owned State & Security:** All sessions, transcripts, reports, and bookings are governed by Supabase Row-Level Security (RLS) and PostgreSQL atomic RPCs. Patients authenticate via Supabase Anonymous Auth; doctors authenticate via email/password.

---

## 2. Preparation & Evaluator Setup

### Demo Environment Access
* **Patient Application:** Open the root URL (`/` or `http://localhost:5173/`).
* **Doctor Application:** Open `/doctor` (or click "Doctor Portal" in the top navigation bar).
* **Mode Selection:**
  * **Mock Mode (Default for standalone/offline review):** Seamlessly operates without external API keys or Supabase connection. Exercises all state machines, adaptive questions, draft reports, and booking flows using deterministic client fixtures.
  * **Real Supabase Integration Mode:** Enabled when `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` are provided. Interacts with deployed Supabase Edge Functions (`chat-turn`, `speak`) and PostgreSQL RPCs.
* **Evaluator Credentials:**
  Doctor dashboard access is restricted. Working evaluator credentials are provided confidentially via the competition submission form.
  * **General Medicine Demo Doctor:** `Dr. Aditi Rao`
  * **Emergency Medicine Demo Doctor:** `Dr. Neha Verma`

---

## 3. Step-by-Step 5–7 Minute Demonstration Script

### Act 1: Patient Welcome, Consent & Hindi Devanagari Switch (1.0 min)
1. **Open Patient Interface:** Navigate to `/`.
2. **Language Toggle:**
   * Observe the top right language selector: **English** and **हिन्दी**.
   * Click **हिन्दी**. Notice the full Devanagari typography rendered cleanly (Noto Sans Devanagari font), including localized cards, headings, and legal notices.
   * Switch back to **English** (or continue in Hindi).
3. **Initiate Intake:**
   * Click the prominent **"Start Talking"** button (or "Type Instead").
4. **Consent Gate:**
   * The system presents the formal intake consent notice:
     * Explains the AI assistant role.
     * Clarifies that this system is *not a doctor* and does not provide medical diagnoses.
     * Discloses that information is processed and compiled into a clinical report for hospital physicians.
   * *Demonstration Alternative (Decline Flow):* Click **"No, I do not consent"**. Note the immediate transition to the exit screen confirming zero data retention.
   * *Normal Flow:* Click **"Yes, I Consent"** to begin intake.

---

### Act 2: Structured Intake, Voice/Text Entry & Adaptive Questions (2.0 mins)
1. **Scripted Intake Sequence:**
   * The backend strictly orchestrates the initial 4 questions in order:
     1. **Name:** Enter `"Ramesh Kumar"`.
     2. **Age:** Enter `"45"`.
     3. **Gender:** Observe the localized quick-choice chips (`Male`, `Female`, `Other`, `Prefer not to say`). Click **"Male"**.
     4. **Primary Concern:** Enter `"Moderate headache and mild fever for 2 days"`.
2. **Voice Transcription Review ("What we heard"):**
   * If using voice mode with microphone permissions granted, speaking an answer generates a transient audio capture.
   * The system displays an editable **"What we heard"** preview chip before the turn is committed. Evaluators can adjust the transcript or immediately click **Send**.
3. **Adaptive Clarification (Dynamic Follow-up):**
   * The backend identifies the chief complaint and selects relevant follow-up questions from the canonical question bank (e.g. Duration, Severity 1–10 scale, Associated symptoms).
   * Notice the localized quick-reply chips (e.g. `Mild (1-3)`, `Moderate (4-6)`, `Severe (7-10)`).
   * Answer 2–3 follow-ups (e.g. selecting `"Moderate (4-6)"` for severity and `"No nausea"`).
   * Notice that the system honors the 3-question adaptive limit and the project-wide 15-turn boundary.

---

### Act 3: Draft Report Review, In-Place Corrections & Submission (1.0 min)
1. **Draft Generation:**
   * Upon completing required fields, the system presents the **Draft Intake Preview**.
   * A clear banner indicates: *"Draft Preview — Not Yet Submitted to Hospital"*.
2. **Patient Review & Field Correction:**
   * Verify the structured breakdown: Chief Complaint, Demographics, Timeline, Symptoms, and Preliminary Department Recommendation (*General Medicine*).
   * Notice that patient-editable fields (Name, Age, Chief Complaint) can be corrected directly on-screen before submission.
   * Non-editable clinical fields (Preliminary Routing, Warning Flags) remain read-only for patient safety.
3. **Submit Action:**
   * Evaluator has two choices:
     * **"Don't Submit":** Terminates the session privately; the draft is never shared with hospital staff.
     * **"Submit to Hospital":** Explicitly commits the report, creating a submitted report record assigned to the matched department.
   * Click **"Submit to Hospital"**.

---

### Act 4: Slot Browsing, Booking & "Not Now" Option (1.0 min)
1. **Available Slot Display:**
   * After submission, the patient is presented with upcoming appointment slots for **Dr. Aditi Rao** (General Medicine).
   * Slots reflect Asia/Kolkata timezone with clear date/time tags.
2. **Booking Alternatives:**
   * **Book an Appointment:** Click an available slot (e.g. `Today 14:00 - 14:30`) and click **"Confirm Booking"**.
     * A formal booking confirmation card appears with a unique reference code (e.g. `APT-GM-101`), doctor details, and preparation guidelines.
   * **"Not Now" Flow:**
     * If the patient skips booking, the report **remains submitted and accessible** on Dr. Aditi Rao's dashboard with status `Submitted (Not Booked)`.

---

### Act 5: Doctor Portal & Clinical Governance (1.5 mins)
1. **Doctor Authentication:**
   * Navigate to `/doctor`.
   * Log in with evaluator credentials for **Dr. Aditi Rao** (Department of General Medicine).
2. **Dashboard Overview:**
   * **Stat Cards:** Inspect real-time totals: Total Intake Reports, Pending Doctor Review, Confirmed Bookings, and Urgent Cases.
   * **Report Queue Tabs:** Switch between `All`, `Urgent`, `Booked`, and `Not Booked`.
3. **Report Detail & Triage:**
   * Click on Ramesh Kumar's report.
   * Inspect the clinical format:
     * Header with reference ID, patient age/gender, and intake timestamp.
     * Summary narrative in clear medical English.
     * Explicit status tags for unasked or declined fields (`declined`, `not_provided`).
4. **"Mark Reviewed" Audit Stamp:**
   * Notice the **"Mark Reviewed"** button at the top of the report.
   * Click **"Mark Reviewed"**.
   * The status updates immediately to `Reviewed`, capturing the doctor's Auth UID and review timestamp. (For reports flagged with potential urgency, this doctor review releases the booking hold).

---

### Act 6: Deterministic Emergency Demo (1.0 min)
1. **Simulate Acute Emergency:**
   * Return to `/` and start a new session (consent: Yes).
   * At the Primary Concern question, enter a known emergency trigger phrase:
     * `"I have severe crushing chest pain and shortness of breath"`
2. **Emergency Protocol Activation:**
   * The system immediately halts standard intake.
   * An urgent alert screen is displayed with high-visibility styling:
     * **Plain-text emergency guidance:** Informs the patient to immediately call **112** (National Emergency Services) or proceed to the nearest emergency room.
     * **Safety restriction:** Plain text only — strictly *no clickable `tel:` links* (to prevent accidental browser dialing during demos) and *no false claims* that emergency personnel have been dispatched.
     * **Slot Suppression:** Routine doctor booking slots are completely suppressed.
3. **Emergency Doctor View:**
   * Navigate to `/doctor` and log in as **Dr. Neha Verma** (Emergency Department).
   * Click on the **Emergency Triage Queue** tab.
   * An `urgent_partial` report is immediately visible with the exact triggered rule (`Severe crushing chest pain`) and red badge indicator, ready for hospital emergency team awareness.

---

## 4. Evaluator Verification Checklist

| Dimension | Verification Item | Expected Behavior |
| :--- | :--- | :--- |
| **Bilingual UI** | Toggle English ↔ Hindi | Seamless translation; Devanagari script renders properly without layout breaks |
| **Consent** | Decline consent button | Immediate session teardown; no clinical database records created |
| **Voice / Text** | Audio capture & transcript editing | "What we heard" chip allows text editing before submission |
| **Adaptive Rules** | Follow-up question limit | Maximum 3 adaptive questions; respect 15-turn session cap |
| **Report Submission** | Patient draft review | Patient can edit personal details, but cannot edit doctor routing or flags |
| **Doctor Dashboard** | Dr. Aditi Rao view | Filter by Booked / Not Booked; Mark Reviewed writes review audit stamp |
| **Emergency Safety** | Severe chest pain phrase | Immediate emergency advice (112); routine slots suppressed; `urgent_partial` report generated |
| **Non-Diagnostic** | Clinical report content | Facts presented as patient-reported; zero probabilistic diagnoses or treatment suggestions |

---

## 5. Known Limitations & Clinical Governance Disclaimers

> [!CAUTION]
> **Non-Clinical Demonstration Prototype**
> - **Synthetic Data Only:** Fictional doctor personas (Dr. Aditi Rao, Dr. Neha Verma) and synthetic patient records only. Real personal health information (PHI) must never be entered.
> - **Zero Diagnostic Authority:** This system does not diagnose diseases, calculate morbidity/mortality risk scores, recommend pharmaceutical dosages, or create therapeutic care plans. All medical evaluation belongs solely to qualified licensed physicians.
> - **Demo Emergency Triggers:** Emergency keyword matching rules are illustrative demonstration filters. They are **not** clinically validated triage algorithms (such as Manchester Triage System or ESI).
> - **No Emergency Dispatch:** Presenting plain-text 112 advice does **not** dial emergency services, send SMS alerts, or summon first responders.
> - **Hindi Language Disclaimer:** Hindi translations and Devanagari prompts are approved for demonstration purposes only. Comprehensive clinical certification by certified medical linguists is required prior to any clinical deployment.
> - **Daily Application Limits:** Project-wide caps in Asia/Kolkata timezone (100 sessions, 300 Groq calls, 150 Prisma STT calls, 120 Timbre TTS calls) are enforced to safeguard API credits.

---

## 6. Bilingual Hindi Walkthrough Journey (वैकल्पिक हिन्दी डेमो यात्रा)

For evaluators reviewing Hindi language capabilities:

1. **आरंभ (Welcome):**
   * मुख्य पृष्ठ (`/`) पर भाषा विकल्प में **"हिन्दी"** चुनें।
   * **"बोलकर बात करें"** या **"लिखकर बताएं"** पर क्लिक करें।
2. **सहमति (Consent Gate):**
   * स्क्रीन पर एआई इनटेक सहमति पत्र पढ़ें।
   * **"हाँ, मैं सहमत हूँ"** पर क्लिक करें।
3. **प्रारंभिक जानकारी (Demographics):**
   * **नाम:** `"राजेश कुमार"` दर्ज करें।
   * **उम्र:** `"35"` दर्ज करें।
   * **लिंग:** ऑन-स्क्रीन चिप **"पुरुष"** चुनें।
   * **मुख्य समस्या:** `"पेट में तेज दर्द और मरोड़ जैसा लग रहा है"` दर्ज करें।
4. **अतिरिक्त स्पष्टीकरण (Adaptive Follow-up):**
   * **अवधि:** `"3 दिन"` दर्ज करें।
   * **तीव्रता:** **"मध्यम"** चिप चुनें।
   * **पुरानी बीमारी:** **"कोई नहीं"** चिप चुनें।
   * **दवाइयाँ:** **"कोई नहीं"** चिप चुनें।
5. **ड्राफ्ट रिपोर्ट समीक्षा (Review):**
   * **"अपनी इनटेक रिपोर्ट की समीक्षा करें"** स्क्रीन पर विवरण जाँचें।
   * **"अस्पताल को भेजें"** बटन दबाएँ।
6. **अपॉइंटमेंट बुकिंग (Booking):**
   * उपलब्ध समय स्लॉट चुनें और **"अपॉइंटमेंट बुक करें"** पर क्लिक करें (या **"अभी नहीं"** चुनें)।
   * संदर्भ संख्या (`APT-...`) वाली पुष्टि रसीद स्क्रीन देखें।

---

*Samvad HealthDesk AI — Demonstrating Safe, Governed, and Empathetic Pre-Visit Patient Intake.*
