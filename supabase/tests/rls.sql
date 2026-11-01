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

-- ---------------------------------------------------------------------------
-- Identities. Replace these four UUIDs with rows that exist in auth.users.
-- ---------------------------------------------------------------------------
create temporary table ids (
  patient_a uuid,
  patient_b uuid,
  doctor_gm uuid,
  doctor_em uuid
) on commit drop;

insert into ids values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
);

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

  select count(*) into visible from public.sessions;
  if visible <> 0 then raise exception 'FAIL: patient read % sessions', visible; end if;

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
