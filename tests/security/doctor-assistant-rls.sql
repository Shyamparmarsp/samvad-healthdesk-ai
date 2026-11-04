-- Doctor assistant — database security assertions on a disposable local cluster.
--
-- Scope: the exact data paths the Samwad Assistant uses.
--   * the doctor's report and appointment reads (Stage A facts)
--   * the doctor_profiles mapping that `speak` requires before any summary is built
--   * cross-doctor isolation of those reads
--   * anonymous access and browser write paths
--   * the usage RPC that gates Groq and Timbre calls
--
-- Every fixture is synthetic and the whole file runs inside a rolled-back transaction.
-- Status: executed by `npm run test:db:security` (tests/security/local-db-tests.mjs).

\set ON_ERROR_STOP on

begin;

-- Deterministic identities (created by tests/security/local-bootstrap.sql).
create temporary table ids (
  patient_a uuid,
  patient_b uuid,
  doctor_gm uuid,
  doctor_em uuid,
  doctor_or uuid,
  unmapped uuid
) on commit drop;

insert into ids
select
  (select id from auth.users where email = 'patient-a@rls.test'),
  (select id from auth.users where email = 'patient-b@rls.test'),
  (select id from auth.users where email = 'doctor-gm@rls.test'),
  (select id from auth.users where email = 'doctor-em@rls.test'),
  (select id from auth.users where email = 'doctor-or@rls.test'),
  (select id from auth.users where email = 'unmapped-doctor@rls.test');

insert into public.doctor_profiles (user_id, doctor_id)
values
  ((select doctor_gm from ids), (select id from public.doctors where department_key = 'general_medicine')),
  ((select doctor_em from ids), (select id from public.doctors where department_key = 'emergency')),
  ((select doctor_or from ids), (select id from public.doctors where department_key = 'orthopedics'))
on conflict (user_id) do update set doctor_id = excluded.doctor_id;

-- Fixtures: one report per doctor plus a draft, a partial and an urgent case.
insert into public.sessions (id, user_id, language, status, answer_turn_count)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', (select patient_a from ids), 'en', 'submitted', 6),
  ('bbbbbbbb-0000-4000-8000-000000000002', (select patient_a from ids), 'en', 'submitted', 4),
  ('bbbbbbbb-0000-4000-8000-000000000003', (select patient_b from ids), 'en', 'emergency', 2),
  ('bbbbbbbb-0000-4000-8000-000000000004', (select patient_b from ids), 'en', 'in_progress', 1),
  ('bbbbbbbb-0000-4000-8000-000000000005', (select patient_b from ids), 'en', 'submitted', 7);

insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
select 'bbbbbbbb-0000-4000-8000-000000000001', (select patient_a from ids), 'submitted', 'general_medicine',
       (select id from public.doctors where department_key = 'general_medicine'), 'SHD-ASST-GM0001', now(), '{"schema_version":1}'::jsonb;

insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
select 'bbbbbbbb-0000-4000-8000-000000000002', (select patient_a from ids), 'partial', 'orthopedics',
       (select id from public.doctors where department_key = 'orthopedics'), 'SHD-ASST-OR0001', now(), '{"schema_version":1}'::jsonb;

insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, emergency_rule_id, report)
select 'bbbbbbbb-0000-4000-8000-000000000003', (select patient_b from ids), 'urgent_partial', 'emergency',
       (select id from public.doctors where department_key = 'emergency'), 'SHD-ASST-EM0001', 'severe_chest_pain', '{"schema_version":1}'::jsonb;

insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, report)
select 'bbbbbbbb-0000-4000-8000-000000000004', (select patient_b from ids), 'draft', 'general_medicine',
       (select id from public.doctors where department_key = 'general_medicine'), 'SHD-ASST-DR0001', '{"schema_version":1}'::jsonb;

insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
select 'bbbbbbbb-0000-4000-8000-000000000005', (select patient_b from ids), 'submitted', 'cardiology',
       (select id from public.doctors where department_key = 'cardiology'), 'SHD-ASST-CA0001', now(), '{"schema_version":1}'::jsonb;

-- One confirmed appointment for the General Medicine report.
insert into public.appointments (report_id, user_id, doctor_id, slot_start, slot_end, reference_code)
select r.id, (select patient_a from ids), r.doctor_id,
       now() + interval '2 hours', now() + interval '150 minutes', 'APT-LOCAL-ASST01'
from public.reports r
where r.intake_reference = 'SHD-ASST-GM0001';

-- ---------------------------------------------------------------------------
do $$
declare
  visible integer;
  gm uuid := (select doctor_gm from ids);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Stage A facts for the General Medicine doctor: assigned submitted report,
  -- documented emergency cross-visibility, and their partial report. Never the draft,
  -- never another department's report.
  select count(*) into visible from public.reports;
  -- Assigned submitted report + the emergency cross-visibility report. The orthopedics
  -- partial report belongs to another doctor and must not appear.
  if visible <> 2 then raise exception 'FAIL: GM doctor sees % reports (expected 2)', visible; end if;

  select count(*) into visible from public.reports where status = 'draft';
  if visible <> 0 then raise exception 'FAIL: GM doctor sees % draft reports', visible; end if;

  select count(*) into visible from public.reports where intake_reference = 'SHD-ASST-CA0001';
  if visible <> 0 then raise exception 'FAIL: GM doctor sees another department report'; end if;

  select count(*) into visible from public.reports where status = 'urgent_partial';
  if visible <> 1 then raise exception 'FAIL: GM doctor sees % urgent reports (cross-visibility)', visible; end if;

  reset role;
  raise notice 'PASS: doctor report reads are scoped to assignment and documented cross-visibility';
end $$;

do $$
declare
  visible integer;
  gm uuid := (select doctor_gm from ids);
  orr uuid := (select doctor_or from ids);
begin
  -- Cross-doctor isolation of the summary source.
  perform set_config('request.jwt.claims', json_build_object('sub', orr, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.reports where intake_reference = 'SHD-ASST-GM0001';
  if visible <> 0 then raise exception 'FAIL: orthopedics doctor can read the GM report'; end if;
  select count(*) into visible from public.reports where status = 'urgent_partial';
  if visible <> 0 then raise exception 'FAIL: orthopedics doctor can read the emergency report'; end if;
  select count(*) into visible from public.reports where intake_reference = 'SHD-ASST-OR0001';
  if visible <> 1 then raise exception 'FAIL: orthopedics doctor cannot read their own partial report'; end if;

  reset role;

  -- A signed-in account with no doctor_profiles row: `speak` must refuse it, and RLS
  -- gives it nothing even if it tried.
  perform set_config('request.jwt.claims', json_build_object('sub', (select unmapped from ids), 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.doctor_profiles;
  if visible <> 0 then raise exception 'FAIL: unmapped account has a doctor profile'; end if;
  select count(*) into visible from public.reports;
  if visible <> 0 then raise exception 'FAIL: unmapped account can read % reports', visible; end if;

  reset role;
  raise notice 'PASS: doctor-to-doctor isolation holds and an unmapped account reads nothing';
end $$;

do $$
declare
  visible integer;
  pa uuid := (select patient_a from ids);
begin
  -- The patient who owns the reports still cannot read them through the doctor path.
  perform set_config('request.jwt.claims', json_build_object('sub', pa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.reports;
  if visible <> 0 then raise exception 'FAIL: patient read % reports', visible; end if;

  reset role;

  -- Anonymous callers get no rows at all.
  perform set_config('request.jwt.claims', '', true);
  set local role anon;

  -- Anonymous callers have no grant at all: access fails loudly rather than returning rows.
  begin
    select count(*) into visible from public.reports;
    if visible <> 0 then raise exception 'FAIL: anonymous caller read % reports', visible; end if;
  exception
    when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'PASS: patient and anonymous callers read no reports';
end $$;

do $$
declare
  gm uuid := (select doctor_gm from ids);
  visible integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- No browser write path to the tables the assistant summarises.
  begin
    update public.reports set reviewed_at = now() where intake_reference = 'SHD-ASST-GM0001';
    raise exception 'FAIL: doctor updated a report directly';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.reports where intake_reference = 'SHD-ASST-GM0001';
    raise exception 'FAIL: doctor deleted a report directly';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (session_id, role, question_id, turn_index, final_text)
    values ('bbbbbbbb-0000-4000-8000-000000000001', 'patient', 'age', 9, '40');
    raise exception 'FAIL: doctor inserted a message';
  exception
    when insufficient_privilege then null;
  end;

  -- The usage RPC that gates Groq/Timbre is server-only.
  begin
    perform public.reserve_daily_usage('groq');
    raise exception 'FAIL: browser role executed reserve_daily_usage';
  exception
    when insufficient_privilege or undefined_function then null;
  end;

  -- Usage tables stay invisible.
  begin
    select count(*) into visible from public.daily_usage_counters;
    raise exception 'FAIL: browser role read usage counters';
  exception
    when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'PASS: no browser write path and no usage access from the browser role';
end $$;

do $$
declare
  visible integer;
  gm uuid := (select doctor_gm from ids);
  orr uuid := (select doctor_or from ids);
begin
  -- Appointment reads are doctor-scoped through the RPC the assistant uses.
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into visible from public.get_doctor_appointments();
  if visible <> 1 then raise exception 'FAIL: GM doctor sees % appointments (expected 1)', visible; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', orr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into visible from public.get_doctor_appointments();
  if visible <> 0 then raise exception 'FAIL: orthopedics doctor sees % appointments (expected 0)', visible; end if;
  reset role;

  raise notice 'PASS: appointment reads are scoped to the calling doctor';
end $$;

do $$
declare
  missing integer;
begin
  select count(*) into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('sessions', 'consent_records', 'messages', 'reports', 'appointments',
                      'doctor_profiles', 'doctors', 'departments', 'doctor_schedules',
                      'daily_usage_limits', 'daily_usage_counters')
    and c.relrowsecurity = false;

  if missing <> 0 then raise exception 'FAIL: % exposed tables have RLS disabled', missing; end if;
  raise notice 'PASS: RLS is enabled on every exposed table';
end $$;

rollback;

\echo 'Doctor assistant database security assertions completed.'
