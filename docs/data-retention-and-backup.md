# Data Retention, Account Disablement and Backup

**Owner policy (approved 2 November 2026):** patient data, appointments and backups are kept
until **30 days after the official competition/demo period**, then deleted. The owner starts
and confirms every deletion. No agent-run deletion, remote cleanup or hosted-data change is
authorised or implemented.

This file is the procedure of record for retention, disabling the demo doctor accounts and
backup naming/storage. Restore mechanics stay in `docs/backup-and-recovery.md`; do not
duplicate or replace that file.

Status of the engineering work:

| Item | State |
|---|---|
| Read-only whole-project dry run | `scripts/retention-dry-run.ts` — legacy counter, no delete path, local only |
| Cutoff-aware retention plan | `scripts/demo-lifecycle.ts retention --cutoff <date>` — read-only plan, manifest and owner SQL |
| Post-deletion verification | `scripts/demo-lifecycle.ts verify-retention --manifest <path>` |
| Doctor shutdown | `scripts/demo-lifecycle.ts doctors` — dry-run + exact allowlist + opt-in ban |
| Backup restore validation | `scripts/verify-backup-restore.ts` — dry-run + isolated scratch DB |
| Deletion automation | **None, by design** — owner reviews generated SQL and executes |
| Hosted data touched by engineering | **None** |
| Doctor accounts disabled by engineering | **None** — owner action |

---

## 1. What is patient data

| Table | Contents | Retention |
|---|---|---|
| `public.appointments` | bookings and reference codes | 30 days after the demo period |
| `public.reports` | draft, submitted and `urgent_partial` documents | 30 days after the demo period |
| `public.messages` | patient answers and assistant questions | 30 days after the demo period |
| `public.consent_records` | consent wording, version and decision | 30 days after the demo period |
| `public.sessions` | intake state and pending-transcript pointers | 30 days after the demo period |
| `auth.users` (anonymous patients) | the patient identities | 30 days after the demo period |

Raw audio is never stored. Application logs contain technical metadata only and age out
with the platform's log retention (`docs/operations-and-capacity.md`).

## 2. What is never deleted by retention

`public.departments`, `public.doctors`, `public.doctor_schedules`,
`public.doctor_profiles`, `public.daily_usage_limits`,
`public.daily_usage_counters`, the migration ledger and the two demo doctor Auth
identities (these are disabled, not deleted — see §4).

These are reference or operational records. Deleting `doctor_profiles` would silently
remove the doctor-to-report authorisation path; deleting the Auth users would cascade the
mapping away.

## 3. Deletion procedure — owner only

**Preconditions**

1. Written owner approval naming the project, the cutoff and the exact scope.
2. A verified pre-deletion backup exists off-platform (§5).
3. The demonstration is over and no evaluator still holds a link.
4. The cutoff plan has been generated and its counts recorded.
5. The project contains synthetic demonstration data only (see the limitation below).

### 3.1 Cutoff plan and generated SQL

```bash
eval "$(npx supabase status -o env | sed 's/^/export /')"
export LOCAL_URL="$API_URL"
export LOCAL_SERVICE_KEY="$SECRET_KEY"   # local only

deno run --allow-net --allow-env --allow-read --allow-write \
  scripts/demo-lifecycle.ts retention \
  --cutoff 2026-12-10 \
  --plan-out demo-lifecycle-plan.json
```

`--cutoff` is `YYYY-MM-DD` (UTC midnight) or a full ISO timestamp with `Z`/offset. It may be
a future planning date; the planner never deletes. It selects sessions with
`created_at < cutoff`, derives reports/appointments through the FK chain, counts the child
tables, records preserved reference counts and prints a SQL transaction for owner review.
The manifest is private (session/report ids and counts, no patient text); do not commit it.

**Dataset limitation:** there is no `demo_run_id` or dataset tag. `sessions.created_at` is
the only selector. Do not run the SQL if the project could contain non-demo or real records.
Auth identities are never selected automatically because an anonymous user may own sessions
on both sides of the cutoff.

### 3.2 Execute the reviewed SQL (owner)

The generated SQL is the authoritative cutoff-scoped transaction. It deletes only the
selected sessions and their dependants in this order:

```
1. appointments      (report_id → reports, user_id → auth.users)
2. reports           (session_id → sessions, user_id → auth.users)
3. messages          (session_id → sessions)
4. consent_records   (session_id → sessions, user_id → auth.users)
5. sessions          (user_id → auth.users)
6. auth.users        (anonymous patient identities only — manual, separate step)
```

It never deletes `doctors`, `doctor_profiles`, `departments`, `doctor_schedules`,
`daily_usage_limits`, counters or the migration ledger. Review the pre/post counts in the
transaction, then uncomment `commit` (or `rollback`). If the selected set is not exactly the
intended demonstration data, roll back.

If a whole-project final cleanup is required after the 30-day deadline, the older
`retention-dry-run.ts` plus the same FK order can be used, but the cutoff plan is preferred.

Then delete the anonymous patient identities through the Auth admin surface (Dashboard →
Authentication → Users, or `auth.admin.deleteUser(uid)` one at a time or in a reviewed
batch), **never the two doctor accounts**. Do not delete rows from `auth.users` with ad-hoc
SQL: that bypasses GoTrue and leaves refresh-token handling inconsistent. The patient-domain
rows are already gone, so an identity left for a few minutes cannot read health data.

### 3.3 Post-deletion verification

```bash
deno run --allow-net --allow-env --allow-read \
  scripts/demo-lifecycle.ts verify-retention --manifest demo-lifecycle-plan.json
```

PASS requires every selected session/report id to return 0 rows and every preserved reference
count to match the manifest. If a reference count changed, stop and restore the
pre-deletion backup.

## 4. Disabling the two demo doctor accounts after the demonstration

Keep both identities and both `doctor_profiles` rows. **Disable (ban), do not delete.**
Deleting a user cascades `doctor_profiles.user_id` and destroys the mapping and its audit
trail.

| Department | Account to disable |
|---|---|
| General Medicine | Dr. Aditi Rao |
| Emergency | Dr. Neha Verma |

### 4.1 Tooling (dry-run default)

```bash
export DOCTOR_GM_UID='<aditi-auth-uid>'
export DOCTOR_EM_UID='<neha-auth-uid>'
export LOCAL_URL="$API_URL"
export LOCAL_SERVICE_KEY="$SECRET_KEY"

# Read-only: verifies the exact allowlist and prints masked UIDs.
deno run --allow-net --allow-env scripts/demo-lifecycle.ts doctors --target local

# Owner-only execution (bans both; no deletion, no profile change).
deno run --allow-net --allow-env \
  scripts/demo-lifecycle.ts doctors --target local --execute \
  --confirm "DISABLE DEMO DOCTORS"
```

For hosted execution set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` and use
`--target hosted`. The script aborts if `doctor_profiles` does not contain exactly two rows,
if a UID does not map to the named doctor/department, if the UIDs are equal, or if any extra
profile exists. It changes only the two allowlisted Auth accounts and verifies
`banned_until` plus an unchanged profile count. It never deletes a user or profile.

### 4.2 Manual Dashboard path

1. Record the two Auth UIDs and the current mapping:

   ```sql
   select dp.user_id, dp.doctor_id, d.display_name, d.department_key
   from public.doctor_profiles dp
   join public.doctors d on d.id = dp.doctor_id
   order by d.department_key;
   ```

2. Supabase Dashboard → **Authentication → Users** → select the account → **Ban user** and
   set a long, far-future duration. This blocks new sign-ins and token refresh.
3. Repeat for the second account.
4. Do **not** delete either user and do **not** delete either `doctor_profiles` row.

**Equivalent server-side Admin API** (owner-run tooling, never browser code):

```ts
await supabase.auth.admin.updateUserById(uid, { ban_duration: "876000h" }); // ~100 years
```

**What a ban does and does not do**

- Blocks password sign-in and refresh, so the account cannot obtain a new access token.
- Does **not** retroactively revoke an access token that was already issued. Supabase access
  tokens are stateless JWTs and stay valid until `exp`. The local configuration uses a
  3600-second JWT lifetime (`supabase/config.toml`); check the hosted project's setting
  under Authentication → Sessions/JWT expiry. Disable the accounts when the demo is over,
  not while evaluators may still need them.
- Report visibility is derived from `doctor_profiles` through RLS. If an immediate cut-off is
  required inside that token window, the owner may additionally remove the mapping row in a
  reviewed transaction **after exporting it**:

  ```sql
  -- Export first, then (only if immediate revocation is required):
  delete from public.doctor_profiles where user_id = '<doctor-auth-uid>';
  ```

  Restore the exported `(user_id, doctor_id)` pair to resume the demo. The default
  procedure is the ban alone; the mapping stays for the audit trail.

**Verification**

1. Sign-in with the account fails.
2. `select count(*) from public.doctor_profiles;` is unchanged (2 in production).
3. Reports, appointments and reference rows are unchanged.
4. The patient flow is unaffected.

**Re-enabling for a later demo:** remove the ban in the Dashboard (or set
`ban_duration: "none"` through the Admin API) and, only if it was removed, restore the
mapping row. Never recreate the user or re-map a different Auth UID without owner approval.

## 5. Backup naming and storage convention

### Naming

```
samvad-<project-ref-short>-<env>-<scope>-<YYYYMMDDTHHMMSSZ>.<ext>
```

| Part | Allowed values | Example |
|---|---|---|
| `project-ref-short` | first 8 characters of the Supabase project ref | `abcdefgh` |
| `env` | `prod` or `local` | `prod` |
| `scope` | `schema`, `data`, `full`, `pre-migration` | `pre-migration` |
| timestamp | UTC, ISO-8601 basic format | `20261109T140000Z` |
| ext | `.sql`, `.sql.gz`, `.sql.gpg` | `.sql.gz` |

Example pair taken immediately before a migration:

```
samvad-abcdefgh-prod-pre-migration-20261109T140000Z-schema.sql.gz
samvad-abcdefgh-prod-pre-migration-20261109T140000Z-data.sql.gz
samvad-abcdefgh-prod-pre-migration-20261109T140000Z-manifest.json
```

Never reuse a timestamp, never append `final`, `latest`, `copy` or a person's name, and
never overwrite an existing dump.

### Creating the dump

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BASE="samvad-<ref8>-prod-pre-migration-${STAMP}"

supabase db dump -f "${BASE}-schema.sql"
supabase db dump --data-only -f "${BASE}-data.sql"
```

Compress or encrypt with the owner's approved tool (for example `gzip` or `age`) and keep
the original extension in the name. Verify before moving the files:

```bash
grep -c "CREATE TABLE" "${BASE}-schema.sql"   # expect > 0
grep -c "INSERT INTO"  "${BASE}-data.sql"     # expect > 0
shasum -a 256 "${BASE}-schema.sql" "${BASE}-data.sql" > "${BASE}-manifest.sha256"
```

The manifest also records the UTC time, project ref, migration head
(`supabase migration list`), operator and the row counts from §3/§6. Store it beside the
dumps.

### Storage

- Owner-controlled encrypted storage with MFA and an access list of one (encrypted volume,
  password-manager attachment or a private cloud folder).
- **Never** in the repository, a public bucket, Supabase Storage, a chat message, a public
  link or a Vercel build artefact.
- Never named in `README`, screenshots or public project material.
- Keep at most a rolling ~7 days of demo backups. Delete every backup by the same 30-day
  deadline as the patient data, and record the deletion.
- Any agent-created or agent-restored backup is prohibited; the agent has created none.

Restore rehearsal and failed-migration recovery are in `docs/backup-and-recovery.md`.
Restore only into a disposable local database, never into the active application database.

### Restore validation script

```bash
# Dry run: validate structure and print the isolated plan; no docker
deno run --allow-read scripts/verify-backup-restore.ts \
  --schema backup-schema.sql --data backup-data.sql

# Restore into a uniquely named scratch database and drop it
deno run --allow-read --allow-run scripts/verify-backup-restore.ts \
  --schema backup-schema.sql --data backup-data.sql --execute
```

The script accepts only a local `supabase_db_*` container, creates
`samvad_restore_verify_<UTC>_<random>`, refuses an existing name, verifies the current
reference counts and five SQL functions, and drops only that scratch database. It never
targets the active application database or a hosted project. An `--execute` run is a real
local database restore; the default is a dry run.

## 6. What must never be done

- No deletion, ban, unban, backup or restore against the hosted project by an agent.
- No `drop database` of the active local stack while another agent is testing.
- No deletion of `doctor_profiles`, `daily_usage_limits` or the migration ledger as
  "cleanup".
- No reuse of the patient-domain tables for a second demo after cleanup without a fresh
  seed and a new usage day.
- No backup file in Git, a public bucket or a Vercel deployment.

## 7. Owner sign-off block

Copy this block into the private operations record when each action is completed.

```
Action:            [ ] disable doctor accounts   [ ] delete patient data   [ ] delete backups
Project ref:       ____________
Operator:          ____________
UTC timestamp:     ____________
Scope approved:    ____________
Backup filename:   ____________  (verified: yes/no)
Before counts:     appointments __ reports __ messages __ consent __ sessions __
After counts:      appointments __ reports __ messages __ consent __ sessions __
Doctor profiles:   unchanged (2)  [ ] yes
Doctor sign-in:    blocked        [ ] yes
Backups deleted:   [ ] yes        [ ] scheduled for ____________
Notes:             ____________
```
