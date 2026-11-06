-- Permanent report deletion — authorisation and cleanup assertions.
--
-- Runs on the disposable PostgreSQL cluster built by tests/security/local-db-tests.mjs,
-- against the unmodified migrations plus the new delete_doctor_report() function.
-- Every fixture is synthetic and the whole file rolls back.

\set ON_ERROR_STOP on

begin;

create temporary table ids (
  patient_a uuid,
  patient_b uuid,
  doctor_gm uuid,
  doctor_em uuid,
  doctor_or uuid
) on commit drop;

insert into ids
select
  (select id from auth.users where email = 'patient-a@rls.test'),
  (select id from auth.users where email = 'patient-b@rls.test'),
  (select id from auth.users where email = 'doctor-gm@rls.test'),
  (select id from auth.users where email = 'doctor-em@rls.test'),
  (select id from auth.users where email = 'doctor-or@rls.test');

insert into public.doctor_profiles (user_id, doctor_id)
values
  ((select doctor_gm from ids), (select id from public.doctors where department_key = 'general_medicine')),
  ((select doctor_em from ids), (select id from public.doctors where department_key = 'emergency')),
  ((select doctor_or from ids), (select id from public.doctors where department_key = 'orthopedics'))
on conflict (user_id) do update set doctor_id = excluded.doctor_id;

insert into public.sessions (id, user_id, language, status, answer_turn_count)
values
  ('cccccccc-0000-4000-8000-000000000001', (select patient_a from ids), 'en', 'submitted', 3),
  ('cccccccc-0000-4000-8000-000000000002', (select patient_b from ids), 'en', 'submitted', 2),
  ('cccccccc-0000-4000-8000-000000000003', (select patient_a from ids), 'en', 'submitted', 2),
  ('cccccccc-0000-4000-8000-000000000004', (select patient_a from ids), 'en', 'in_progress', 1),
  ('cccccccc-0000-4000-8000-000000000005', (select patient_a from ids), 'en', 'in_progress', 0);

insert into public.consent_records (session_id, user_id, decision, consent_text, consent_version, language)
values
  ('cccccccc-0000-4000-8000-000000000001', (select patient_a from ids), 'yes', 'Synthetic local consent text.', '2026-11-01.v1', 'en');

insert into public.messages (session_id, role, question_id, turn_index, final_text)
values
  ('cccccccc-0000-4000-8000-000000000001', 'patient', 'name', 1, 'Synthetic A'),
  ('cccccccc-0000-4000-8000-000000000001', 'patient', 'age', 2, '41'),
  ('cccccccc-0000-4000-8000-000000000002', 'patient', 'name', 1, 'Synthetic B'),
  ('cccccccc-0000-4000-8000-000000000003', 'patient', 'name', 1, 'Synthetic C');

insert into public.reports (id, session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
select 'dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', (select patient_a from ids),
       'submitted', 'general_medicine', d.id, 'SHD-DEL-GM0001', now(), '{"schema_version":1}'::jsonb
  from public.doctors d where d.department_key = 'general_medicine';
insert into public.reports (id, session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
select 'dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', (select patient_b from ids),
       'submitted', 'orthopedics', d.id, 'SHD-DEL-OR0001', now(), '{"schema_version":1}'::jsonb
  from public.doctors d where d.department_key = 'orthopedics';
insert into public.reports (id, session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
select 'dddddddd-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', (select patient_a from ids),
       'partial', 'general_medicine', d.id, 'SHD-DEL-GM0002', now(), '{"schema_version":1}'::jsonb
  from public.doctors d where d.department_key = 'general_medicine';
insert into public.reports (id, session_id, user_id, status, department_key, doctor_id, intake_reference, emergency_rule_id, report)
select 'dddddddd-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000004', (select patient_a from ids),
       'urgent_partial', 'emergency', d.id, 'SHD-DEL-EM0001', 'severe_chest_pain', '{"schema_version":1}'::jsonb
  from public.doctors d where d.department_key = 'emergency';
insert into public.reports (id, session_id, user_id, status, department_key, doctor_id, intake_reference, report)
select 'dddddddd-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000005', (select patient_a from ids),
       'draft', 'general_medicine', d.id, 'SHD-DEL-DR0001', '{"schema_version":1}'::jsonb
  from public.doctors d where d.department_key = 'general_medicine';

insert into public.appointments (report_id, user_id, doctor_id, slot_start, slot_end, reference_code)
select r.id, r.user_id, r.doctor_id, now() + interval '3 hours', now() + interval '210 minutes', 'APT-DEL-0001'
  from public.reports r where r.id = 'dddddddd-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
do $$
declare
  gm uuid := (select doctor_gm from ids);
  deleted uuid;
  remaining integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select deleted_report_id into deleted from public.delete_doctor_report('dddddddd-0000-4000-8000-000000000001');
  if deleted <> 'dddddddd-0000-4000-8000-000000000001' then
    raise exception 'FAIL: delete_doctor_report returned %', deleted;
  end if;

  reset role;

  select count(*) into remaining from public.reports where id = 'dddddddd-0000-4000-8000-000000000001';
  if remaining <> 0 then raise exception 'FAIL: report row survived deletion'; end if;

  select count(*) into remaining from public.messages where session_id = 'cccccccc-0000-4000-8000-000000000001';
  if remaining <> 0 then raise exception 'FAIL: report transcript survived (% rows)', remaining; end if;

  select count(*) into remaining from public.appointments where report_id = 'dddddddd-0000-4000-8000-000000000001';
  if remaining <> 0 then raise exception 'FAIL: report appointment survived (% rows)', remaining; end if;

  -- Patient-owned records stay.
  select count(*) into remaining from public.sessions where id = 'cccccccc-0000-4000-8000-000000000001';
  if remaining <> 1 then raise exception 'FAIL: parent session was deleted'; end if;
  select count(*) into remaining from public.consent_records where session_id = 'cccccccc-0000-4000-8000-000000000001';
  if remaining <> 1 then raise exception 'FAIL: consent record was deleted'; end if;

  -- Unrelated reports are untouched.
  select count(*) into remaining from public.reports where id in (
    'dddddddd-0000-4000-8000-000000000002',
    'dddddddd-0000-4000-8000-000000000003',
    'dddddddd-0000-4000-8000-000000000004',
    'dddddddd-0000-4000-8000-000000000005');
  if remaining <> 4 then raise exception 'FAIL: unrelated reports changed (% rows)', remaining; end if;

  raise notice 'PASS: assigned doctor deletes only that report, its transcript and its appointment';
end $$;

do $$
declare
  gm uuid := (select doctor_gm from ids);
  orr uuid := (select doctor_or from ids);
  em uuid := (select doctor_em from ids);
begin
  -- Another doctor cannot delete the orthopedics report.
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.delete_doctor_report('dddddddd-0000-4000-8000-000000000002');
    raise exception 'FAIL: General Medicine deleted another doctor''s report';
  exception when sqlstate '42501' then null;
  end;
  reset role;

  -- Read-only emergency cross-visibility never grants deletion.
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.delete_doctor_report('dddddddd-0000-4000-8000-000000000004');
    raise exception 'FAIL: cross-visibility granted deletion of an emergency report';
  exception when sqlstate '42501' then null;
  end;
  reset role;

  -- The Emergency doctor may delete their own urgent report.
  perform set_config('request.jwt.claims', json_build_object('sub', em, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.delete_doctor_report('dddddddd-0000-4000-8000-000000000004');
  reset role;

  -- A doctor with no mapping is refused.
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.delete_doctor_report('dddddddd-0000-4000-8000-000000000003');
    raise exception 'FAIL: unmapped account deleted a report';
  exception when sqlstate '42501' then null;
  end;
  reset role;

  raise notice 'PASS: cross-doctor, cross-visibility, unmapped and emergency-owner deletion rules hold';
end $$;

do $$
declare
  pa uuid := (select patient_a from ids);
  gm uuid := (select doctor_gm from ids);
begin
  -- The patient who owns the report cannot delete it.
  perform set_config('request.jwt.claims', json_build_object('sub', pa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.delete_doctor_report('dddddddd-0000-4000-8000-000000000003');
    raise exception 'FAIL: patient deleted a report';
  exception when sqlstate '42501' then null;
  end;
  reset role;
  if exists (select 1 from public.reports where id = 'dddddddd-0000-4000-8000-000000000003') = false then
    raise exception 'FAIL: patient request deleted the partial report';
  end if;

  -- Anonymous callers cannot even execute the function.
  if has_function_privilege('anon', 'public.delete_doctor_report(uuid)', 'EXECUTE') then
    raise exception 'FAIL: anon can execute delete_doctor_report';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_doctor_report(uuid)', 'EXECUTE') then
    raise exception 'FAIL: authenticated cannot execute delete_doctor_report';
  end if;

  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.delete_doctor_report('dddddddd-0000-4000-8000-000000000003');
    raise exception 'FAIL: anonymous caller executed delete_doctor_report';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Drafts are not deletable here, and an unknown id is not disclosed.
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.delete_doctor_report('dddddddd-0000-4000-8000-000000000005');
    raise exception 'FAIL: draft report was deleted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.delete_doctor_report('dddddddd-0000-4000-8000-00000000ffff');
    raise exception 'FAIL: unknown report id did not fail';
  exception when sqlstate 'P0002' then null;
  end;
  reset role;

  raise notice 'PASS: patient, anonymous, draft and unknown-id attempts are refused';
end $$;

do $$
declare
  gm uuid := (select doctor_gm from ids);
begin
  -- A repeated delete cannot report success twice.
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.delete_doctor_report('dddddddd-0000-4000-8000-000000000001');
    raise exception 'FAIL: a second delete of the same report succeeded';
  exception when sqlstate 'P0002' then null;
  end;
  reset role;
  raise notice 'PASS: a repeated delete is rejected instead of double-reporting success';
end $$;

rollback;

\echo 'Report deletion assertions completed.'
