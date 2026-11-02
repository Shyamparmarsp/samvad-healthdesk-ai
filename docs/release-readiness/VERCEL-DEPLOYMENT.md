# Vercel deployment — owner procedure

**Candidate:** `release-candidate/samvad-final`
**Scope:** one Vercel project serving the Vite SPA
**Status:** configuration verified in the repository and in a local production build; **nothing was deployed**

The frontend is a static SPA. It holds no server secrets: the browser talks to Supabase
Auth, the two Edge Functions and the RLS-protected RPCs directly.

---

## 1. Build configuration (verified)

| Setting | Value | Verification |
|---|---|---|
| Framework preset | Vite | detected |
| Root directory | repository root (`./`) | `package.json` at root |
| Install command | `npm install` | `package-lock.json` committed |
| Build command | `npm run build` (`tsc && vite build`) | verified locally, 0 type errors |
| Output directory | `dist` | `vite.config.ts` default; `dist/` git-ignored |
| Node version | 20.x or 22.x | Vite 6 requires ≥18 |

Local verification of the exact command:

```bash
npm ci
npm run build
ls dist/index.html dist/assets
```

The build is deterministic and, with the two `VITE_` variables empty, produces the mock
bundle used by the offline suites. With the variables set it produces the live bundle.

## 2. SPA route fallback

`vercel.json` (committed, unchanged):

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This makes a hard refresh on `/doctor` serve `index.html` instead of a 404. The doctor
route still requires a real Supabase session; the rewrite is routing only, never
authentication.

## 3. Environment variables

Set these in Vercel → Project → Settings → Environment Variables.

| Variable | Environments | Value | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Production, Preview | `https://<ref>.supabase.co` | **Public.** Baked into the bundle. |
| `VITE_SUPABASE_KEY` | Production, Preview | publishable key (`sb_publishable_…`) or legacy anon key | **Public** client key only. |

Rules:

- **Never** put the Supabase secret key, `service_role` key, `GROQ_API_KEY`,
  `GNANI_API_KEY` or any Gnani credential in a `VITE_` variable. Everything prefixed
  `VITE_` is shipped to the browser.
- Never commit a `.env.local` or any `.env*` file; `.gitignore` excludes them and
  `.env.example` is the only committed template.
- Keep **Production** and **Preview** values separate if they point at different Supabase
  projects. A preview deployment pointed at the production project can create real demo
  sessions; use a separate project or leave preview variables empty (mock mode).
- If either variable is missing, the app runs in typed mock mode. That is acceptable for
  a UI preview but **not** for the evaluator demo, which must exercise the real stack.

## 4. Production branch and deployment trigger

| Setting | Value |
|---|---|
| Production branch | the permanent release branch chosen by the owner (do not point it at a disposable validation branch) |
| Preview deployments | enabled for all other branches |
| Automatic deployments | on push to the connected branch |

Git push alone deploys **only** the frontend. The Supabase migrations and Edge Functions
are deployed separately with the Supabase CLI (see `HOSTED-SUPABASE-SETUP.md`). Never
assume a Vercel deploy also updated the backend.

## 5. CORS origin allowlisting

After the first Vercel deployment, copy the **exact** production origin (for example
`https://samvad-healthdesk.vercel.app`, no trailing slash) into the Supabase function
secret `ALLOWED_ORIGINS`, then redeploy both functions.

- CORS is an exact allowlist; wildcards are rejected by `_shared/cors.ts`.
- CORS is not authentication. JWT verification and RLS remain in force.
- If preview deployments must work against the same Supabase project, add their exact
  origins too — never `*`.

## 6. Deployment smoke tests

Run these immediately after the first deployment, before sharing the URL.

| # | Check | Expected |
|---|---|---|
| 1 | `GET /` | welcome screen, language toggle works |
| 2 | `/doctor` in a private window | login screen, no dashboard, no report data |
| 3 | Hard refresh on `/doctor` | login screen (SPA fallback works) |
| 4 | Consent Yes | conversation starts; first question is cached audio or text |
| 5 | Full text intake → review → submit | report created; booking screen shows IST slots |
| 6 | Book a slot | confirmation shows a real IST date/time and an `APT-` reference |
| 7 | Doctor login | exactly the mapped doctor's reports appear |
| 8 | Cross-department URL guess | no report data returned (RLS) |
| 9 | Emergency phrase | 112 guidance, no slots |
| 10 | Browser console | no CORS errors, no secret values |
| 11 | `curl` a function with no JWT | `401` |
| 12 | View source / bundle search | no `service_role`, `sk-`, or provider key |

A hosted pass is required; the local suites do not substitute for it.

## 7. Rollback

| Situation | Action |
|---|---|
| Bad frontend deploy | Vercel → Deployments → previous deployment → **Promote to Production** (instant, no rebuild). |
| Bad function deploy | `npx supabase functions deploy <name>` from the previous candidate commit. |
| Broken database migration | Restore the pre-migration backup; fix forward in a new timestamped migration. |
| Need to stop public access | Vercel → Settings → pause the project; ban the two doctor accounts. |
| Roll back both layers | Promote the previous Vercel deployment **and** redeploy the previous functions; the database is the only stateful layer. |

## 8. Cost and limits

- Vercel free/Hobby tier is sufficient for a single demo SPA.
- The app performs no build-time provider calls; audio is committed under `public/audio/`.
- Daily application caps (Supabase-side) protect the provider quotas; they are not Vercel
  settings.

## 9. What remains owner-only

1. Creating the Vercel project and connecting the repository.
2. Setting the two `VITE_` variables (and keeping preview/production separation).
3. Copying the production origin into `ALLOWED_ORIGINS` and redeploying the functions.
4. Running the smoke list in §6 and recording the result.
5. Authorising the production deployment.
