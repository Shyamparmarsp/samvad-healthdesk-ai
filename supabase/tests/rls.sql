-- RLS and privilege assertions for a disposable LOCAL Supabase stack.
--
-- Status: NOT RUN. The Supabase CLI is not installed in this environment, so this file
-- has never been executed. Run it only against a disposable local database.
--
-- Procedure: see supabase/tests/README.md
-- Prerequisites: migrations applied + supabase/seed.sql applied + two test auth users
-- whose UUIDs are substituted below.

\set ON_ERROR_STOP on

begin;

-- Deterministic counts: clear the intake domain inside the transaction (rolled back).
delete from public.appointments;
delete from public.reports;
delete from public.messages;
delete from public.consent_records;
delete from public.sessions;

-- ---------------------------------------------------------------------------
-- Identities are resolved by email. Create these four users on the LOCAL stack first
-- (Auth admin API), then run this file. No hardcoded UUIDs and no auth.users writes.
create temporary table ids (
  patient_a uuid,
  patient_b uuid,
  doctor_gm uuid,
  doctor_em uuid
) on commit drop;

insert into ids
select
  (select id from auth.users where email = 'patient-a@rls.test'),
  (select id from auth.users where email = 'patient-b@rls.test'),
  (select id from auth.users where email = 'doctor-gm@rls.test'),
  (select id from auth.users where email = 'doctor-em@rls.test');

do $$
begin
  if exists (select 1 from ids where patient_a is null or patient_b is null or doctor_gm is null or doctor_em is null) then
    raise exception 'Missing local test identities. Create patient-a, patient-b, doctor-gm and doctor-em first.';
  end if;
end $$;

-- Fixtures are created as the migration owner (RLS bypassed), then read as a role.
insert into public.sessions (id, user_id, language, status, answer_turn_count, current_question_id)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', (select patient_a from ids), 'en', 'submitted', 10, null),
  ('aaaaaaaa-0000-4000-8000-000000000002', (select patient_a from ids), 'en', 'in_progress', 4, 'duration'),
  ('aaaaaaaa-0000-4000-8000-000000000003', (select patient_b from ids), 'en', 'in_progress', 2, 'gender');

insert into public.messages (session_id, role, question_id, turn_index, final_text)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'patient', 'name', 1, 'Synthetic A'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'patient', 'name', 1, 'Synthetic B');

insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
select
  'aaaaaaaa-0000-4000-8000-000000000001',
  (select patient_a from ids),
  'submitted',
  'general_medicine',
  (select id from public.doctors where department_key = 'general_medicine'),
  'SHD-20261102-SUB001',
  now(),
  '{"schema_version":1}'::jsonb;

insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, report)
values (
  'aaaaaaaa-0000-4000-8000-000000000002',
  (select patient_a from ids),
  'draft',
  'general_medicine',
  (select id from public.doctors where department_key = 'general_medicine'),
  'SHD-20261102-DRF001',
  '{"schema_version":1}'::jsonb
);

insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, emergency_rule_id, report)
values (
  'aaaaaaaa-0000-4000-8000-000000000003',
  (select patient_b from ids),
  'urgent_partial',
  'emergency',
  (select id from public.doctors where department_key = 'emergency'),
  'SHD-20261102-URG001',
  'breathing_emergency',
  '{"schema_version":1}'::jsonb
);

insert into public.doctor_profiles (user_id, doctor_id)
values
  ((select doctor_gm from ids), (select id from public.doctors where department_key = 'general_medicine')),
  ((select doctor_em from ids), (select id from public.doctors where department_key = 'emergency'))
on conflict (user_id) do update set doctor_id = excluded.doctor_id;

-- ---------------------------------------------------------------------------
-- Assertions. Each block impersonates one identity and fails loudly.
-- ---------------------------------------------------------------------------
do $$
declare
  visible integer;
  patient_a uuid := (select patient_a from ids);
begin
  -- Anonymous patient A must not read any session, report or message.
  perform set_config('request.jwt.claims', json_build_object('sub', patient_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- sessions carries no browser grant at all: access must fail loudly.
  begin
    select count(*) into visible from public.sessions;
    if visible <> 0 then raise exception 'FAIL: patient read % sessions', visible; end if;
  exception
    when insufficient_privilege then null;
  end;

  select count(*) into visible from public.reports;
  if visible <> 0 then raise exception 'FAIL: patient read % reports', visible; end if;

  select count(*) into visible from public.messages;
  if visible <> 0 then raise exception 'FAIL: patient read % messages', visible; end if;

  reset role;
  raise notice 'PASS: patient cannot read sessions, reports or messages';
end $$;

do $$
declare
  visible integer;
  gm uuid := (select doctor_gm from ids);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.reports where status = 'submitted';
  if visible <> 1 then raise exception 'FAIL: doctor sees % submitted reports (expected 1)', visible; end if;

  select count(*) into visible from public.reports where status = 'draft';
  if visible <> 0 then raise exception 'FAIL: doctor sees % drafts', visible; end if;

  select count(*) into visible from public.reports where status = 'urgent_partial';
  if visible <> 1 then raise exception 'FAIL: General Medicine doctor sees % urgent reports (expected 1)', visible; end if;

  -- Conversation access follows report access: the submitted report and the urgent one.
  select count(*) into visible from public.messages;
  if visible <> 2 then raise exception 'FAIL: doctor sees % messages (expected 2)', visible; end if;

  reset role;
  raise notice 'PASS: doctor sees assigned submitted + emergency cross-visibility, never drafts';
end $$;

do $$
declare
  visible integer;
  em uuid := (select doctor_em from ids);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', em, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.reports where status = 'urgent_partial';
  if visible <> 1 then raise exception 'FAIL: Emergency doctor sees % urgent reports', visible; end if;

  select count(*) into visible from public.messages;
  if visible <> 1 then raise exception 'FAIL: Emergency doctor sees % messages (expected 1)', visible; end if;

  reset role;
  raise notice 'PASS: Emergency doctor sees the urgent report';
end $$;

do $$
declare
  visible integer;
  gm uuid := (select doctor_gm from ids);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.doctor_profiles;
  if visible <> 1 then raise exception 'FAIL: doctor profile isolation broken (% rows)', visible; end if;

  reset role;
  raise notice 'PASS: doctor_profiles exposes only the caller row';
end $$;

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select patient_a from ids), 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.messages (session_id, role, question_id, turn_index, final_text)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'patient', 'age', 11, '99');
    raise exception 'FAIL: patient wrote a message';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.reserve_daily_usage('groq');
    raise exception 'FAIL: patient executed reserve_daily_usage';
  exception
    when insufficient_privilege or undefined_function then null;
  end;

  begin
    perform 1 from public.daily_usage_counters;
    raise exception 'FAIL: patient read usage counters';
  exception
    when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'PASS: no browser write path, no usage access';
end $$;

rollback;

\echo 'RLS assertions completed. A NOTICE above reports each PASS; any FAIL raised an exception.'
