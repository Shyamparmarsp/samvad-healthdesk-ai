# Final Owner Setup and Production Deployment Guide
**Product**: Samvad HealthDesk AI — AI-Powered Hospital Intake & Smart Referral System  
**Release Candidate Branch**: `release/samvad-rc1`

> **Document map — which file to follow.**
> - This file: the narrative walkthrough, in deployment order.
> - `docs/release/DEPLOYMENT-CHECKLIST.md`: the same steps as a verification table, plus
>   the **ordered migration list**, backup/rollback and post-deploy smoke commands.
> - `docs/release/OWNER-ACTIONS.md`: the classified list of decisions and actions only
>   you can take (READY / BLOCKED / NOT TESTED).
> - `docs/release/RELEASE-CANDIDATE.md`: what was actually tested, by evidence layer.
> - `docs/release/SECURITY-FINDINGS.md`: security results and the one open approval item.
> - `docs/cors-verification.md`: measured CORS behaviour. Read it before relying on
>   `ALLOWED_ORIGINS`.
>
> Where this file and the checklists disagree, the checklists win (they are generated
> from the verified code). Nothing here has been executed remotely by the agent.

---

## 1. Frontend Environment Variables (Vercel / Production Build)

Set the following environment variables in the Vercel Project Settings (`Settings` → `Environment Variables`) or in your local `.env`:

| Variable Name | Required | Allowed Value | Notes |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Yes | `https://<project-ref>.supabase.co` | Supabase Project URL found in Supabase Dashboard → Settings → API. |
| `VITE_SUPABASE_KEY` | Yes | Public Anon / Publishable Key | **NEVER use the service_role secret key.** Browser code only needs anonymous/authenticated access via RLS. |

> [!IMPORTANT]
> If either variable is empty, the frontend runs in typed offline mock mode. When both are supplied, the frontend connects to real Supabase Auth, PostgreSQL, RLS, and Edge Functions.

---

## 2. Supabase Function Secrets (Edge Functions)

Configure the following secrets in the Supabase Dashboard under `Edge Functions` → `Secrets` (or using `supabase secrets set`):

| Secret Key | Description | Example / Notes |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | Groq API Key | Used server-side for adaptive extraction and question selection. |
| `GNANI_API_KEY` | Gnani API key | The **only** Gnani credential the code reads. Used server-side for both Prisma (STT) and Timbre (TTS). There is no separate token variable — verified by grepping `Deno.env.get` across `supabase/functions/`. |
| `ALLOWED_ORIGINS` | CORS origin allowlist | Comma-separated exact origins, no wildcard, e.g. `<your-frontend-domain>,http://localhost:5173`. Set it for correctness, but see the note in §3: **the platform overwrites the response origin with `*`, so this is not an authorization control**. |

---

## 3. Vercel Origin & CORS Configuration

1. In the Vercel Dashboard, deploy the frontend connected to `release/samvad-rc1`.
2. Copy the production URL **from your own deployment** (this repo does not contain it).
3. Add that exact origin, with no trailing slash and no wildcard:
   ```bash
   supabase secrets set ALLOWED_ORIGINS="https://<your-frontend-domain>"
   ```

**Measured behaviour — do not over-claim.** A `curl -X OPTIONS` probe against the local
platform returns `Access-Control-Allow-Origin: *` from both the edge runtime and Kong,
regardless of what `_shared/cors.ts` sets (`docs/cors-verification.md`). So:

- `ALLOWED_ORIGINS` is still worth setting, and the function still refuses unknown
  origins at the header level it controls.
- It is **not** what protects the data. JWT verification (`verify_jwt` stays enabled),
  `auth.uid()` ownership checks and RLS are the controls.
- Never weaken JWT/RLS/ownership to satisfy a CORS policy.
- Hosted-platform behaviour was **not** verified in this release. If you need a hard
  origin guarantee, enforce it in front of Supabase (CDN/proxy) and test it.

---

## 4. Doctor Auth Accounts & Profiles Setup

The evaluator access flow uses fictional doctors. Create two evaluators in Supabase Dashboard:

### Step 4.1: Create Auth Users
Go to `Supabase Dashboard` → `Authentication` → `Users` → `Add user` → `Create user`:
1. **General Medicine Doctor**:
   - Email: `dr.aditi.rao@samvad.hospital` (or your private evaluator email)
   - Password: (choose a strong password, share privately with evaluators)
   - Confirm Email: **Yes** (auto-confirm)
2. **Emergency Doctor**:
   - Email: `dr.neha.verma@samvad.hospital` (or your private emergency evaluator email)
   - Password: (choose a strong password, share privately with evaluators)
   - Confirm Email: **Yes** (auto-confirm)

### Step 4.2: Map to `doctor_profiles`
Copy the newly generated Auth UIDs from the dashboard and execute in the Supabase SQL Editor:
```sql
-- Map Dr. Aditi Rao (General Medicine)
INSERT INTO public.doctor_profiles (
  user_id,
  doctor_id,
  department_key,
  name,
  department_name,
  is_active
) VALUES (
  '<AUTH_UID_FOR_ADITI_RAO>',
  '00000000-0000-0000-0000-000000000001',
  'general_medicine',
  'Dr. Aditi Rao',
  'General Medicine',
  true
) ON CONFLICT (user_id) DO UPDATE SET is_active = true;

-- Map Dr. Neha Verma (Emergency)
INSERT INTO public.doctor_profiles (
  user_id,
  doctor_id,
  department_key,
  name,
  department_name,
  is_active
) VALUES (
  '<AUTH_UID_FOR_NEHA_VERMA>',
  '00000000-0000-0000-0000-000000000006',
  'emergency',
  'Dr. Neha Verma',
  'Emergency',
  true
) ON CONFLICT (user_id) DO UPDATE SET is_active = true;
```

---

## 5. Database Migrations, Seeds and Daily Usage Caps

1. Apply migrations from `supabase/migrations/` with **`supabase db push` only**, so the
   migration ledger records each version. Applying files by hand in the SQL Editor leaves
   the ledger unrecorded and makes later `db push` runs unsafe. The exact order (10 files)
   is in `docs/release/DEPLOYMENT-CHECKLIST.md` §2.
2. Apply `supabase/seed.sql` to populate fictional doctor schedules, department rosters, and emergency rules.
3. Verify project-wide daily usage caps in `daily_usage_limits`:
   ```sql
   -- View current application guardrails
   SELECT * FROM public.daily_usage_limits;
   
   -- Approved application defaults (AGENTS.md D5): 100 / 300 / 150 / 120.
   -- These are application guardrails, NOT provider quotas. Raising them is an owner
   -- decision that consumes real provider credit: see docs/release/OWNER-ACTIONS.md A4.
   ```

---

## 6. Deployment Commands

### Deploy Backend Edge Functions
From `samvad-backend/`:
```bash
supabase functions deploy chat-turn
supabase functions deploy speak
```

Do **not** pass `--no-verify-jwt`. JWT verification is enabled by default and must stay
enabled; the flag disables it. Verify afterwards that an unauthenticated POST returns 401
(see `docs/release/DEPLOYMENT-CHECKLIST.md` §6).

### Deploy Frontend
From `samvad-integration/` on `release/samvad-rc1`:
```bash
# Verify build passes
npm run build

# Deploy to Vercel
vercel --prod
```

---

## 7. Verification Checklist (Post-Deployment Smoke Test)

1. **Anonymous Patient Intake**:
   - Open `/` in an incognito window.
   - Verify welcome screen renders with bilingual toggle (English / Hindi).
   - Click "Type Instead", confirm consent, answer scripted questions (Name, Age, Gender, Concern).
   - Confirm that Draft Preview badge displays in review screen.
   - Click "Submit to hospital".
   - Select an available slot and confirm booking. Note reference code `APT-...`.
2. **Doctor Review & Visibility**:
   - Navigate to `/doctor`.
   - Log in as Dr. Aditi Rao.
   - Verify stat cards ("Urgent Triage", "New Reports", "Booked Appointments").
   - Click the patient report, expand verbatim conversation log, and click "Mark Reviewed".
   - Verify timestamp updates and button transitions to "Reviewed".
3. **Emergency Safeguard**:
   - Open a fresh patient intake, enter a severe trigger phrase: `"Severe chest pain radiating to my left arm"`.
   - Verify routine booking is blocked and plain-text 112 guidance is displayed without tap-to-call.
   - Log in as Dr. Neha Verma (`/doctor`) and confirm patient report appears in the Urgent Triage queue with `status: urgent_partial`.

