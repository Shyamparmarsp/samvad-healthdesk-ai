# Doctor Onboarding

Two fictional doctor identities exist in the seed: **General Medicine — Dr. Aditi Rao** and
**Emergency — Dr. Neha Verma**. This procedure connects two real Supabase Auth users to
those records. It never creates users, never touches `auth.users` and never handles
passwords.

## 1. Create the Auth users (owner)

Supabase Dashboard → **Authentication → Users → Add user**, with email + password, for:

| Department | Display name |
|---|---|
| General Medicine | Dr. Aditi Rao |
| Emergency | Dr. Neha Verma |

Confirm both emails. Copy each user's **UID**. Never insert into `auth.users` with SQL —
that bypasses GoTrue and produces identities the API cannot authenticate.

## 2. Validate and map (dry run first)

```bash
export LOCAL_URL=https://<project-ref>.supabase.co      # or http://127.0.0.1:54321
export LOCAL_SERVICE_KEY=<secret key>                    # never a VITE_ variable
export DOCTOR_GM_UID=<aditi-uid>
export DOCTOR_EM_UID=<neha-uid>

deno run --allow-net --allow-env scripts/map-doctor-profiles.ts          # dry run
deno run --allow-net --allow-env scripts/map-doctor-profiles.ts --confirm # apply
```

The utility:

- rejects a non-UUID or identical UIDs before any write;
- reads the seeded doctors and requires exactly one per department;
- reports `unchanged` for an existing identical mapping (safe to re-run);
- refuses on a conflict (this Auth user already mapped to another doctor, or this doctor
  already mapped to another Auth user) and writes nothing;
- writes only `doctor_profiles(user_id, doctor_id)`;
- prints no credential and no password;
- verifies the final state and fails if either identity is not mapped.

Equivalent SQL path (owner-approved named file): put the UIDs into
`supabase/seed-doctor-profiles.sql` and apply it with `psql -v ON_ERROR_STOP=1 -f …`.

## 3. Verify before deploying

```sql
select dp.user_id, d.display_name, d.department_key
from public.doctor_profiles dp
join public.doctors d on d.id = dp.doctor_id
order by d.department_key;
```

Expected: exactly two rows — `general_medicine` and `emergency` — and no other rows.
`select count(*) from public.doctor_profiles;` must be 2.

Machine check: `deno run --allow-net --allow-env --allow-read --allow-run --allow-write scripts/verify-db-release.ts`
→ `Doctor profiles mapped — PASS`.

## 4. Common failures

| Symptom | Cause | Recovery |
|---|---|---|
| `Unauthorized` from the script | secret key missing or wrong | export `LOCAL_SERVICE_KEY`; never use the publishable key |
| `expected exactly one general_medicine doctor` | `seed.sql` not applied | apply the seed, then re-run |
| `CONFLICT` on the doctor | doctor already mapped to another user | remove the stale `doctor_profiles` row deliberately |
| Doctor portal shows no reports | mapping missing, or the report is a draft | re-run the verification query |

Credentials are shared with evaluators privately. The login screen states that and
displays no password.
