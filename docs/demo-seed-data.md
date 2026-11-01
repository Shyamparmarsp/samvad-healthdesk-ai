# Demo Seed Data and Doctor Access

All names, hospital details, schedules and appointments are synthetic placeholders for the demonstration. They do not represent real clinicians or availability. Use these exact doctor names everywhere in the UI.

## Departments and fictional doctors

| Department key | Display name | Fictional doctor | Booking behaviour |
|---|---|---|---|
| `general_medicine` | General Medicine | Dr. Aditi Rao | Routine slots enabled |
| `orthopedics` | Orthopedics | Dr. Kabir Mehta | Routine slots enabled |
| `emergency` | Emergency | Dr. Neha Verma | Urgent-only; no slots |
| `general_surgery` | General Surgery | Dr. Ishaan Patel | Routine slots enabled |
| `dermatology` | Dermatology | Dr. Sara Khan | Routine slots enabled |
| `cardiology` | Cardiology | Dr. Arjun Nair | Routine slots enabled |

These doctors are demo identities, not claims about real practitioners. Create a corresponding `doctor_profiles` row mapping the Supabase Auth user ID to the doctor record. Doctor avatars are initials, not photos.

## Routing behaviour

- Groq can propose only one of the configured non-emergency department keys.
- Backend validates the key and performs the department-to-doctor mapping.
- Ambiguous routine cases use the configured General Medicine fallback and remain marked preliminary.
- A deterministic emergency rule maps to `emergency`, creates an `urgent_partial` report and suppresses booking.
- A supplementary LLM `possible_urgent` flag marks the report for urgent human review; it must not create an unsupported diagnosis.

## Report visibility

- A doctor sees submitted reports assigned to them.
- The General Medicine demo doctor and the Emergency doctor can also read reports in the Emergency department (read-only apart from Mark Reviewed). This is so a judge logged in as the demo doctor can see the urgent path.
- Unsubmitted drafts are never visible to doctors, except `urgent_partial` reports.

## Synthetic clinic schedule

For the five non-emergency doctors:

- Hospital timezone: `Asia/Kolkata`. Display and book in that timezone.
- Weekdays only.
- Clinic hours 09:00–17:00, 30-minute slots, so the first slot starts at 09:00 and the last starts at 16:30. No slot starts at 17:00 or later.
- 13:00–14:00 lunch break (no slots starting 13:00 or 13:30).
- Generate slots relative to the current date for the next 14 days so the demo data does not expire. A date outside that window shows "No free slots".

The Emergency doctor has no routine slots.

## Optional sample reports

If time remains in M4, seed a small number of synthetic submitted reports (including one `urgent_partial`) so the doctor dashboard is not empty when a judge first logs in. This is optional; the acceptance path creates real reports.

## Doctor Auth identities and evaluator access

After the database schema and fictional seed are applied in M1-S7, the owner manually creates two Supabase Auth users through the Dashboard:

1. General Medicine — Dr. Aditi Rao
2. Emergency — Dr. Neha Verma

Never insert rows directly into Supabase-managed `auth.users`. During M1-S8, create a reviewed, project-specific SQL mapping file for the two `doctor_profiles` rows using the Auth UIDs supplied by the owner. The owner applies that named mapping SQL only after reviewing and approving it. The agent receives each account email and Auth UID only; never share either password with an agent.

M3-S9 uses both mapped identities to test assigned-report access, draft invisibility and the documented Emergency cross-visibility. M4-S3 verifies the existing users/mappings and owner-tested login/logout; it does not create or remap users.

## Public README, Figma and evaluator credential policy

Never put a working doctor password in the public README, Figma card, screenshots, source code, Git history, logs, public social posts or this document. The doctor login screen's card must display exactly:

```text
Evaluator access
Credentials are shared privately with reviewers.
Not displayed in public project materials.
```

The registration terms mention a participant workspace, but the current programme page FAQ and challenge blog say there is no participant dashboard and the submission form is emailed. The owner follows the current email instructions and inspects the actual link received for this registration. Share a restricted evaluator credential only if the route explicitly provides a private/reviewer-only field or organisers confirm an approved private channel. The public official pages inspected do not confirm the existence of such a field. If no secure route is available, ask the organisers before providing credentials. Do not assume the form supports it. Keep the repository private unless the actual form or current written terms explicitly require public source code.
