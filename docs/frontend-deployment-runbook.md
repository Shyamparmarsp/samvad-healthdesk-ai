# Samvad HealthDesk AI — Frontend Deployment Runbook (Vercel)

**Project:** Samvad HealthDesk AI  
**Repository Layer:** Frontend (SPA)  
**Hosting Target:** Vercel  
**Author:** Antigravity  
**Date:** 2 November 2026  

---

## 1. Overview & Architecture

Samvad HealthDesk AI's frontend is a single-page application (SPA) built with:
- **Core:** React 18.3, TypeScript 5.6, Vite 6.0
- **Routing:** React Router DOM 6.28 (`/` for Patient Intake, `/doctor` for Doctor Portal)
- **Styling & Fonts:** Tailwind CSS 3.4, *Plus Jakarta Sans* & *Noto Sans Devanagari*
- **Code Splitting:** Dynamic `React.lazy` chunking for `DoctorShell` and Rollup `vendor-supabase` chunking to keep all assets under 300 kB (uncompressed) and under 85 kB (gzip).

---

## 2. Vercel Project Configuration

When importing the repository into Vercel Dashboard, configure the following project settings:

| Setting | Value | Notes |
|---|---|---|
| **Framework Preset** | `Vite` | Detected automatically by Vercel. |
| **Root Directory** | `./` | Root of the frontend workspace. |
| **Build Command** | `npm run build` | Executes `tsc && vite build`. |
| **Output Directory** | `dist` | Generated static bundle directory. |
| **Install Command** | `npm install` | Clean installation of dependencies. |
| **Node.js Version** | `20.x` or `22.x` | Modern LTS runtime. |

---

## 3. Single-Page Application (SPA) Routing Fallback

Direct URL navigation and hard browser refreshes on deep routes (e.g., navigating directly to `https://your-domain.vercel.app/doctor`) are handled via the checked-in `vercel.json` routing configuration:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This guarantees that all route requests serve `dist/index.html`, allowing React Router to hydrate the view on the client side without producing 404 errors.

---

## 4. Environment Variables Specification

The client application requires only **two** public environment variables:

| Variable Name | Required | Description | Example / Allowed Values |
|---|---|---|---|
| `VITE_SUPABASE_URL` | **Yes** (Production) | The public HTTPS endpoint of the hosted Supabase project. | `https://xyzproject.supabase.co` |
| `VITE_SUPABASE_KEY` | **Yes** (Production) | The public client key (publishable or legacy `anon` key) copied from the Supabase Dashboard. Never a secret key. | the Dashboard value, e.g. `sb_publishable_…` |

### Strict Security Invariants
- **NEVER EXPOSE SECRETS IN VERCEL:**
  - `SUPABASE_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY` must **never** be added to Vercel environment variables or browser code.
  - `GROQ_API_KEY`, `GNANI_API_KEY`, or any AI provider secrets must **never** be placed in `VITE_` variables.
  - Server-side keys belong strictly in **Supabase Function Secrets** managed via Supabase CLI (`supabase secrets set`).
- **No Hardcoded Endpoints:**
  - The client dynamically derives API endpoints using `VITE_SUPABASE_URL`.
  - When variables are unset during local testing, the application falls back safely to in-memory mock mode with zero live network calls.

---

## 5. Pre-Deployment Static Verification

Before triggering a deployment, run the following static and build verification battery:

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. Mock and Contract Suite (31 tests)
npm run test:mock

# 3. Production Build
npm run build
```

Expected build output:
- `dist/index.html` (~0.87 kB)
- `dist/assets/index-*.css` (~32.7 kB)
- `dist/assets/DoctorShell-*.js` (~43.5 kB)
- `dist/assets/vendor-supabase-*.js` (~227 kB)
- `dist/assets/index-*.js` (~291 kB)
- **Zero** chunk size warnings (`all chunks < 300 kB`).

---

## 6. Post-Deployment Verification Checklist

Once deployed to Vercel, the owner or evaluator must execute the following end-to-end verification steps:

1. **Patient Intake Route (`/`):**
   - Access `https://your-domain.vercel.app/`.
   - Verify the welcome screen renders with the *Educational Demo* indicator.
   - Switch language between *English* and *हिंदी में बात करें*; confirm Devanagari script renders cleanly without missing glyphs.
   - Click *Type Instead*; confirm versioned consent text (`2026-11-01.v1`) appears with explicit **Yes / No** buttons.
   - Click *Yes, I agree*; step through demographic questions (Name, Age, Gender, Primary Concern) and adaptive follow-ups.
   - Verify the generated draft report renders; submit the report and confirm preliminary department routing.
   - Verify routine appointment slot availability and booking confirmation.
2. **Deterministic Emergency Safety Check:**
   - On a new session, enter an acute emergency phrase (e.g., *"severe crushing chest pain and shortness of breath"*).
   - Verify intake immediately terminates and displays static plain-text **112** guidance (no clickable `tel:` links).
   - Verify routine booking slots are 100% suppressed.
3. **Doctor Portal Route (`/doctor`):**
   - Directly navigate to `https://your-domain.vercel.app/doctor` and perform a hard page refresh (`Ctrl+R` / `Cmd+Shift+R`); verify the page loads without 404.
   - Log in with evaluator credentials for Dr. Aditi Rao (`aditi.rao@hospital.demo`).
   - Verify the 4 dashboard stat cards (*Urgent Triage*, *New Reports*, *Booked Today*, *Total Reports*).
   - Open a submitted report detail:
     - Verify clinical narrative and explicit missing-value tags.
     - Verify the informational note: *"Some intake responses may be available only in the conversation history and may not appear in the structured report."*
     - Click *Expand Conversation* to inspect verbatim intake dialogue.
     - Click *Mark Reviewed* and verify the status stamps the doctor UID and review timestamp.
   - Switch to the *Urgent Triage* queue and verify read-only emergency report visibility.

---

## 7. Rollback & Troubleshooting

- **Symptoms of Missing / Misconfigured Vercel Env Vars:**
  - If `VITE_SUPABASE_URL` is missing or invalid, the client logs an informative error and falls back to mock mode.
  - Fix: Check Vercel Project Settings > Environment Variables > Redeploy without cache.
- **CORS Issues on Hosted Supabase:**
  - Verify that the Edge Functions respond with appropriate CORS headers (`Access-Control-Allow-Origin: *` or allowed origins).
- **Authentication Failures:**
  - Verify doctor Auth accounts exist in Supabase Auth and map to rows in `doctor_profiles` with valid `auth_user_id` values.

