-- mark_report_reviewed(): authorisation matrix and field-scope assertions.
-- Disposable LOCAL stack only. Run after all migrations and supabase/seed.sql.
--
--   docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/mark_reviewed.sql
--
-- Status: executed against the local stack on 2 November 2026.

\set ON_ERROR_STOP on
begin;

create temporary table ids (label text primary key, uid uuid) on commit drop;
insert into ids
select 'patient-a', (select id from auth.users where email = 'patient-a@rls.test')
union all select 'patient-b', (select id from auth.users where email = 'patient-b@rls.test')
union all select 'doctor-gm', (select id from auth.users where email = 'doctor-gm@rls.test')
union all select 'doctor-em', (select id from auth.users where email = 'doctor-em@rls.test')
union all select 'doctor-or', (select id from auth.users where email = 'doctor-or@rls.test')
union all select 'doctor-de', (select id from auth.users where email = 'doctor-de@rls.test');

do $$
begin
  if exists (select 1 from ids where uid is null) then
    raise exception 'Missing local test identities; create them before running this file';
  end if;
end $$;

create temporary table fixtures (label text primary key, report_id uuid) on commit drop;

-- Fixtures are written as the migration owner (RLS bypassed) and then read as a role.
insert into public.sessions (id, user_id, language, status, answer_turn_count)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', (select uid from ids where label = 'patient-a'), 'en', 'submitted', 10),
  ('bbbbbbbb-0000-4000-8000-000000000002', (select uid from ids where label = 'patient-b'), 'en', 'emergency', 4),
  ('bbbbbbbb-0000-4000-8000-000000000003', (select uid from ids where label = 'patient-a'), 'en', 'in_progress', 6);

insert into public.reports (id, session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   (select uid from ids where label = 'patient-a'), 'submitted', 'orthopedics',
   (select id from public.doctors where department_key = 'orthopedics'),
   'SHD-MR-SUB001', now(), '{"schema_version":1,"tag":"routine"}'::jsonb),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002',
   (select uid from ids where label = 'patient-b'), 'urgent_partial', 'emergency',
   (select id from public.doctors where department_key = 'emergency'),
   'SHD-MR-URG001', null, '{"schema_version":1,"tag":"urgent"}'::jsonb),
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000003',
   (select uid from ids where label = 'patient-a'), 'draft', 'orthopedics',
   (select id from public.doctors where department_key = 'orthopedics'),
   'SHD-MR-DFT001', null, '{"schema_version":1,"tag":"draft"}'::jsonb);

insert into fixtures values
  ('submitted', 'cccccccc-0000-4000-8000-000000000001'),
  ('urgent', 'cccccccc-0000-4000-8000-000000000002'),
  ('draft', 'cccccccc-0000-4000-8000-000000000003');

-- Snapshot every other column so we can prove nothing else changed.
create temporary table before_state on commit drop as
select id, status, department_key, doctor_id, intake_reference, submitted_at, possible_urgent,
       needs_human_review, emergency_rule_id, md5(report::text) as report_hash, updated_at
from public.reports
where id in (select report_id from fixtures);

-- ---------------------------------------------------------------------------
-- 1. Assigned routine doctor reviews the submitted report
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := (select uid from ids where label = 'doctor-or');
  v_report uuid := (select report_id from fixtures where label = 'submitted');
  v_row record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select * into v_row from public.mark_report_reviewed(v_report);
  if v_row.reviewed_at is null then raise exception 'FAIL: reviewed_at not set'; end if;
  if v_row.reviewed_by <> v_uid then raise exception 'FAIL: reviewer is % expected %', v_row.reviewed_by, v_uid; end if;
  if v_row.already_reviewed then raise exception 'FAIL: first review reported as already reviewed'; end if;

  reset role;
  raise notice 'PASS: assigned doctor reviewed the submitted report';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Idempotency — timestamp preserved
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := (select uid from ids where label = 'doctor-or');
  v_report uuid := (select report_id from fixtures where label = 'submitted');
  v_first timestamptz;
  v_second timestamptz;
  v_flag boolean;
begin
  select reviewed_at into v_first from public.reports where id = v_report;
  perform pg_sleep(0.05);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select reviewed_at, already_reviewed into v_second, v_flag from public.mark_report_reviewed(v_report);
  reset role;

  if v_second <> v_first then raise exception 'FAIL: review timestamp overwritten'; end if;
  if not v_flag then raise exception 'FAIL: repeat call not reported as already reviewed'; end if;

  raise notice 'PASS: repeated review is idempotent';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Unassigned, patient, draft, emergency matrix
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := (select uid from ids where label = 'doctor-de');
  v_report uuid := (select report_id from fixtures where label = 'submitted');
  v_failed boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_report_reviewed(v_report);
  exception when insufficient_privilege then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: unassigned doctor was allowed to review'; end if;
  raise notice 'PASS: unassigned doctor rejected';
end $$;

do $$
declare
  v_uid uuid := (select uid from ids where label = 'patient-a');
  v_report uuid := (select report_id from fixtures where label = 'submitted');
  v_failed boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_report_reviewed(v_report);
  exception when insufficient_privilege then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: patient was allowed to review'; end if;
  raise notice 'PASS: patient rejected';
end $$;

do $$
declare
  v_uid uuid := (select uid from ids where label = 'doctor-or');
  v_report uuid := (select report_id from fixtures where label = 'draft');
  v_failed boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_report_reviewed(v_report);
  exception when invalid_parameter_value then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: draft report was reviewable'; end if;
  raise notice 'PASS: draft report rejected';
end $$;

do $$
declare
  v_uid uuid := (select uid from ids where label = 'doctor-em');
  v_report uuid := (select report_id from fixtures where label = 'urgent');
  v_row record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into v_row from public.mark_report_reviewed(v_report);
  reset role;
  if v_row.reviewed_by <> v_uid then raise exception 'FAIL: emergency review not recorded'; end if;
  raise notice 'PASS: Emergency doctor reviewed the eligible emergency report';
end $$;

-- OD-03 interim: read cross-visibility does not grant review authority.
do $$
declare
  v_uid uuid := (select uid from ids where label = 'doctor-gm');
  v_report uuid := (select report_id from fixtures where label = 'urgent');
  v_failed boolean := false;
  v_reviewed timestamptz;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_report_reviewed(v_report);
  exception when insufficient_privilege then v_failed := true;
  end;
  reset role;
  select reviewed_at into v_reviewed from public.reports where id = v_report;
  if not v_failed then raise exception 'FAIL: General Medicine doctor reviewed an emergency report (OD-03 violation)'; end if;
  if v_reviewed is null then raise exception 'FAIL: emergency review state was lost'; end if;
  raise notice 'PASS: General Medicine doctor denied on an emergency report (OD-03 interim)';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Nothing but the two review columns changed
-- ---------------------------------------------------------------------------
do $$
declare
  v_diff integer;
begin
  select count(*) into v_diff
  from before_state b
  join public.reports r on r.id = b.id
  where b.status <> r.status
     or b.department_key <> r.department_key
     or b.doctor_id <> r.doctor_id
     or b.intake_reference <> r.intake_reference
     or b.submitted_at is distinct from r.submitted_at
     or b.possible_urgent <> r.possible_urgent
     or b.needs_human_review <> r.needs_human_review
     or b.emergency_rule_id is distinct from r.emergency_rule_id
     or b.report_hash <> md5(r.report::text)
     or b.updated_at <> r.updated_at;

  if v_diff <> 0 then raise exception 'FAIL: % reports changed outside the review fields', v_diff; end if;
  raise notice 'PASS: status, routing, flags, reference, content and timestamps unchanged';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Grants unchanged; no browser write path
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.reports', 'update') then
    raise exception 'FAIL: authenticated gained UPDATE on reports';
  end if;
  if has_function_privilege('anon', 'public.mark_report_reviewed(uuid)', 'execute') then
    raise exception 'FAIL: anon can execute mark_report_reviewed';
  end if;
  if not has_function_privilege('authenticated', 'public.mark_report_reviewed(uuid)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute mark_report_reviewed';
  end if;
  raise notice 'PASS: RPC is authenticated-only and reports still has no browser UPDATE';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Emergency report remains ineligible for routine booking after review
-- ---------------------------------------------------------------------------
do $$
declare
  v_report uuid := (select report_id from fixtures where label = 'urgent');
  v_status text;
  v_department text;
begin
  select status::text, department_key into v_status, v_department from public.reports where id = v_report;
  if v_status <> 'urgent_partial' then raise exception 'FAIL: review changed the emergency status to %', v_status; end if;
  if v_department <> 'emergency' then raise exception 'FAIL: review changed the emergency department'; end if;
  raise notice 'PASS: emergency report remains urgent_partial and permanently unbookable';
end $$;

rollback;

\echo 'Mark Reviewed assertions completed.'
