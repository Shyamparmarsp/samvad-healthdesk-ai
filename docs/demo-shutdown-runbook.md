# Demo Shutdown Runbook

**Status:** toolkit complete; **nothing was disabled, deleted, restored or changed on a
hosted project**. The owner executes every destructive action after the demonstration.

This runbook covers the end-of-demo sequence:

1. plan retention with an explicit cutoff;
2. take and verify a backup;
3. remove patient data (owner SQL, cutoff-scoped);
4. verify deletion;
5. disable the two demo doctor accounts (ban, never delete);
6. delete retained backups by the approved deadline.

Related documents: `docs/data-retention-and-backup.md` (policy of record),
`docs/backup-and-recovery.md` (manual restore/recovery), `docs/supabase-owner-setup.md`
(account provisioning and mappings).

---

## 1. What already existed vs what is new

| Area | Before | Now |
|---|---|---|
| Patient-data counts | `scripts/retention-dry-run.ts` (whole-project counts, local only) | `scripts/demo-lifecycle.ts retention --cutoff` adds cutoff selection, dependency plan, manifest and generated SQL |
| Deletion | Manual SQL in `data-retention-and-backup.md` | Same owner SQL, generated from the cutoff plan; **no automatic deletion command** |
| Post-deletion check | Manual count queries | `demo-lifecycle.ts verify-retention --manifest` |
| Doctor shutdown | Written Dashboard/Admin API procedure only | `demo-lifecycle.ts doctors` dry-run + exact allowlist, opt-in ban |
| Backup creation | Manual `supabase db dump` | Unchanged |
| Restore validation | Manual docker restore procedure | `scripts/verify-backup-restore.ts` dry-run + isolated scratch restore |
| Backup storage/naming | Documented convention | Unchanged; checklist added here |

`retention-dry-run.ts` remains as a legacy whole-project counter. The new planner is the
authoritative cutoff procedure.

---

## 2. Exact dataset limitation (read first)

The schema has **no `demo_run_id` or dataset tag**. `public.sessions.created_at` is the only
selector available for the retention cutoff. Therefore:

- run retention only when the project contains **synthetic demonstration data exclusively**;
- the cutoff is an owner-supplied instant; sessions created before it are selected;
- child rows are selected through their session/report foreign keys, not by their own
  timestamps, so an old session's later message is still included;
- records from a newer demonstration are not selected;
- Auth identities are **never selected automatically**, because an anonymous user may own
  sessions on both sides of the cutoff. The owner must review and delete patient identities
  privately after the domain rows are gone.

Do **not** implement or run a blind `delete from ...` without reviewing the generated plan
and SQL. If the project could contain non-demo or real records, **stop**: the toolkit cannot
safely identify the intended dataset.

---

## 3. Retention plan (read-only)

```bash
eval "$(npx supabase status -o env | sed 's/^/export /')"
export LOCAL_URL="$API_URL"
export LOCAL_SERVICE_KEY="$SECRET_KEY"   # local only

deno run --allow-net --allow-env --allow-read --allow-write \
  scripts/demo-lifecycle.ts retention \
  --cutoff 2026-12-10 \
  --plan-out demo-lifecycle-plan.json
```

`--cutoff` accepts `YYYY-MM-DD` (UTC midnight) or a full ISO timestamp with `Z`/offset.
It may be a future planning date; the script never deletes.

The command prints and manifests:

- selected sessions;
- appointments, reports, messages and consent records linked to those sessions;
- reference counts that must remain unchanged;
- the mandatory FK order: appointments → reports → messages → consent → sessions;
- a generated SQL transaction for owner review.

Store the manifest privately; do not commit it. It contains session/report ids and counts,
not patient text.

### Execute the deletion (owner, reviewed SQL)

Review the generated SQL. It:

- selects `sessions.created_at < cutoff`;
- derives reports from those sessions and appointments from those reports;
- deletes only those rows, in FK order;
- verifies the selected rows before and after;
- **never touches** `doctors`, `doctor_profiles`, `departments`, `doctor_schedules`,
  `daily_usage_limits`, the migration ledger or any other account;
- ends with `-- commit;` commented out. The owner uncomments one of `commit`/`rollback`
  after reading the counts.

Run it in the Supabase SQL Editor or psql as a single transaction. If any verification count
is unexpected, roll back.

Then remove the anonymous patient identities manually via Dashboard → Authentication → Users
or the server-side Admin API. Delete only anonymous patient identities; never the two demo
doctor accounts. This step is intentionally not automated.

---

## 4. Post-deletion verification

```bash
deno run --allow-net --allow-env --allow-read \
  scripts/demo-lifecycle.ts verify-retention --manifest demo-lifecycle-plan.json
```

PASS requires:

- every selected session/report id returns **0** rows;
- every preserved reference count matches the manifest.

If reference counts changed, stop and restore the pre-deletion backup.

---

## 5. Doctor account shutdown

Two identities only:

| Department | Display name | Environment variable |
|---|---|---|
| General Medicine | Dr. Aditi Rao | `DOCTOR_GM_UID` |
| Emergency | Dr. Neha Verma | `DOCTOR_EM_UID` |

**Disable (ban), never delete.** The script verifies that `doctor_profiles` contains exactly
two rows, that each allowlisted UID maps to the named doctor in the correct department, and
that there are no extra profiles. Any mismatch aborts before a write.

### Dry run (default; read-only)

```bash
export DOCTOR_GM_UID='<aditi-auth-uid>'
export DOCTOR_EM_UID='<neha-auth-uid>'
export LOCAL_URL="$API_URL"
export LOCAL_SERVICE_KEY="$SECRET_KEY"

deno run --allow-net --allow-env scripts/demo-lifecycle.ts doctors --target local
```

The dry run prints masked UIDs, names and departments; it makes **no update**.

### Execute (owner, explicit confirmation)

Local:

```bash
deno run --allow-net --allow-env \
  scripts/demo-lifecycle.ts doctors --target local --execute \
  --confirm "DISABLE DEMO DOCTORS"
```

Hosted:

```bash
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SECRET_KEY='<secret key>'
deno run --allow-net --allow-env \
  scripts/demo-lifecycle.ts doctors --target hosted --execute \
  --confirm "DISABLE DEMO DOCTORS"
```

The script sends the Admin API ban (`ban_duration: "876000h"`) for the two allowlisted UIDs,
then verifies `banned_until` is set and the `doctor_profiles` count is unchanged. It never
deletes users or profiles.

**Residual token window:** a ban blocks new sign-ins and refresh, but an already-issued JWT
remains valid until its `exp` (local default 3600 s; check the hosted JWT expiry). Do not
disable accounts while evaluators still need them. If an immediate cut-off is required,
export and remove the two `doctor_profiles` rows in a reviewed transaction (default procedure
keeps the mapping for audit).

### Re-enable for another demonstration

1. Unban both accounts in Dashboard → Authentication → Users (or Admin API
   `ban_duration: "none"`).
2. Confirm `doctor_profiles` still has exactly the two mapped rows.
3. Test each login privately.

Never recreate the user or remap a different Auth UID without owner approval.

---

## 6. Backup checklist

- [ ] Before any migration: dump schema and data using
      `samvad-<ref8>-prod-pre-migration-<UTC>-schema.sql` / `-data.sql`.
- [ ] During the demonstration: take a manual backup before any reset or schema change.
- [ ] Verify non-empty files, `CREATE TABLE`/`INSERT` markers and a sha256 manifest.
- [ ] Restore rehearsal on a **disposable local database only**.
- [ ] Store encrypted, with MFA and an access list of one, outside the repository and
      Supabase Storage.
- [ ] Never commit a dump, manifest or screenshot containing one.
- [ ] Delete every retained backup by the same 30-day post-demo deadline and record it.

### Restore validation

```bash
# Dry run: validate files and print the isolated plan; no docker
deno run --allow-read scripts/verify-backup-restore.ts \
  --schema backup-schema.sql --data backup-data.sql

# Restore into a uniquely named scratch DB and drop it
deno run --allow-read --allow-run scripts/verify-backup-restore.ts \
  --schema backup-schema.sql --data backup-data.sql --execute
```

The script accepts only a `supabase_db_*` local container, creates
`samvad_restore_verify_<UTC>_<random>`, refuses an existing name, verifies current reference
counts and five SQL functions, and drops only that scratch database. It never targets the
active application database or a hosted project.

---

## 7. Owner sign-off

```
Action:            [ ] retention plan reviewed   [ ] SQL committed   [ ] post-deletion verified
Project ref:       ____________
Cutoff (UTC):      ____________
Operator:          ____________
Backup filename:   ____________  verified: yes/no
Before counts:     sessions __ reports __ messages __ consent __ appointments __
After counts:      sessions __ reports __ messages __ consent __ appointments __
Reference counts unchanged: [ ] yes
Doctor accounts:   [ ] both dry-run verified   [ ] both banned   [ ] profiles unchanged
Backups deleted:   [ ] yes  date: ____________
Notes:             ____________
```

---

## 8. Prohibited actions

- No automatic retention deletion, especially against hosted data.
- No account deletion; no profile deletion as “cleanup”.
- No backup in Git, a public bucket, Supabase Storage or a chat message.
- No restore into the active local or hosted database.
- No disabling an account that is not one of the two allowlisted profiles.
- No deleting an anonymous Auth user until the domain rows are gone and the user's sessions
  have been reviewed against the cutoff.

---

## 9. Verification performed for this task

| Check | Result |
|---|---|
| `supabase/tests/demo-lifecycle.test.ts` | **12/12 pass** |
| Release gate | **22 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED** |
| Retention plan dry run (local, cutoff 2026-12-10) | read-only counts, manifest and SQL; 0 deleted |
| Post-deletion verifier against the empty local plan | PASS, preserved counts unchanged |
| Doctor allowlist unit cases | exact pair accepted; extra/missing/wrong/duplicate refused |
| Restore validator dry run | files validated; no docker command run |
| Account disabled / deleted | **No** |
| Hosted data changed | **No** |
| Backup restored / deleted | **No** |

No live/hosted action was performed. The single NOT TESTED gate item is the optional
frontend type/build step.
