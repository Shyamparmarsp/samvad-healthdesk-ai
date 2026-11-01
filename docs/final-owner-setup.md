# Final Owner Setup and Production Deployment Guide
**Product**: Samvad HealthDesk AI — AI-Powered Hospital Intake & Smart Referral System  
**Release Candidate Branch**: `release/samvad-rc1`

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
| `GNANI_API_KEY` | Gnani Prisma / Timbre Access Key | Used server-side for STT transcription and TTS audio synthesis. |
| `GNANI_TOKEN` | Gnani Authentication Token | Used server-side for Gnani REST endpoints. |
| `ALLOWED_ORIGINS` | CORS Origin Allowlist | Comma-separated list of permitted origins, e.g. `https://samvad-healthdesk.vercel.app,http://localhost:5173`. Edge Functions validate origin headers against this allowlist. |

---

## 3. Vercel Origin & CORS Configuration

1. In the Vercel Dashboard, deploy the frontend connected to `release/samvad-rc1`.
2. Copy your production deployment URL (e.g. `https://samvad-healthdesk.vercel.app`).
3. Add this URL to `ALLOWED_ORIGINS` in your Supabase Function Secrets:
   ```bash
   supabase secrets set ALLOWED_ORIGINS="https://samvad-healthdesk.vercel.app"
   ```
4. Verify that preflight `OPTIONS` requests from your browser return:
   - `Access-Control-Allow-Origin: https://samvad-healthdesk.vercel.app`
   - `Access-Control-Allow-Methods: POST, OPTIONS`
   - `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`

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

1. Apply migrations from `supabase/migrations/` using `supabase db push` or through the Supabase Dashboard SQL Editor.
2. Apply `supabase/seed.sql` to populate fictional doctor schedules, department rosters, and emergency rules.
3. Verify project-wide daily usage caps in `daily_usage_limits`:
   ```sql
   -- View current application guardrails
   SELECT * FROM public.daily_usage_limits;
   
   -- Recommended initial limits:
   -- sessions: 500, groq: 1500, prisma: 500, timbre: 500
   ```

---

## 6. Deployment Commands

### Deploy Backend Edge Functions
From `samvad-backend/`:
```bash
supabase functions deploy chat-turn --no-verify-jwt=false
supabase functions deploy speak --no-verify-jwt=false
```

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

