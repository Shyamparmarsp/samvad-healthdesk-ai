# Security Policy

## Scope & Educational Disclaimer

**Samvad HealthDesk AI** is an **educational demonstration** using synthetic patient data, fictional clinicians, and fictional appointment schedules only. It is **not** a clinical product and must **never** be used with real patient data or protected health information (PHI).

## Reporting a Security Vulnerability

If you discover a security issue, misconfiguration, or vulnerability in this repository:

1. **Do not** open a public GitHub issue, pull request, or discussion containing exploit steps, credentials, private user data, or environment secrets.
2. Report it privately using **GitHub Private Vulnerability Reporting** (`Security` tab → `Report a vulnerability` on this repository), or contact the repository owner privately via their GitHub profile.
3. Include a clear description of the issue, affected files or endpoints, reproduction steps using synthetic test data only, and potential impact.

## Implemented Architecture Safeguards

- **Server-owned persistence:** Patient `sessions`, `consent_records`, `messages`, `reports`, and `daily_usage_*` tables allow no direct browser writes; mutations flow through authenticated Supabase Edge Functions (`chat-turn`, `speak`) or narrow, allowlisted PostgreSQL RPCs (`get_available_slots`, `book_appointment`, `mark_report_reviewed`, `get_doctor_appointments`, `delete_doctor_report`).
- **Identity & RLS:** User IDs are derived from verified JWT claims (`auth.uid()`), with Row Level Security enabled across public tables.
- **No client-side provider secrets:** API keys (`GROQ_API_KEY`, `GNANI_API_KEY`) and elevated database credentials remain server-side in Supabase Function Secrets and are never placed in `VITE_*` variables or committed to Git.
- **Evaluator credentials:** Doctor login credentials are never stored in source code, screenshots, or documentation and are shared only through private review channels.
