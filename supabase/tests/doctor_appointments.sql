-- get_doctor_appointments(): read-only, doctor-scoped appointment reads.
-- Disposable LOCAL stack only. Run after all migrations and supabase/seed.sql.
--
--   docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/doctor_appointments.sql
--
-- Added in M4-S16-B. Asserts the RPC exists, is authenticated-only, returns only the
-- caller's own appointments, never leaks another identity, and that the appointments
-- table itself still has no browser grant (the invariant the RPC exists to preserve).

\set ON_ERROR_STOP on
begin;

create temporary table ids (label text primary key, uid uuid) on commit drop;
insert into ids
select 'patient-a', (select id from auth.users where email = 'patient-a@rls.test')
union all select 'patient-b', (select id from auth.users where email = 'patient-b@rls.test')
union all select 'doctor-or', (select id from auth.users where email = 'doctor-or@rls.test')
union all select 'doctor-gm', (select id from auth.users where email = 'doctor-gm@rls.test');

do $$
begin
  if exists (select 1 from ids where uid is null) then
    raise exception 'Missing local test identities; create them before running this file';
  end if;
end $$;

-- Fixtures written as the migration owner (RLS bypassed), read back as a role.
insert into public.sessions (id, user_id, language, status, answer_turn_count)
values
  ('dddddddd-0000-4000-8000-000000000001', (select uid from ids where label = 'patient-a'), 'en', 'submitted', 10),
  ('dddddddd-0000-4000-8000-000000000002', (select uid from ids where label = 'patient-b'), 'en', 'submitted', 10);

insert into public.reports (id, session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
   (select uid from ids where label = 'patient-a'), 'submitted', 'orthopedics',
   (select id from public.doctors where department_key = 'orthopedics'),
   'SHD-DA-0001', now(),
   '{"schema_version":1,"patient":{"name":{"status":"provided","value":"Asha Fixture"}}}'::jsonb),
  ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002',
   (select uid from ids where label = 'patient-b'), 'submitted', 'general_medicine',
   (select id from public.doctors where department_key = 'general_medicine'),
   'SHD-DA-0002', now(),
   '{"schema_version":1,"patient":{"name":{"status":"provided","value":"Ravi Fixture"}}}'::jsonb);

insert into public.appointments (report_id, user_id, doctor_id, slot_start, slot_end, status, reference_code)
select r.id, r.user_id, r.doctor_id,
       (now() + interval '2 days')::timestamptz,
       (now() + interval '2 days' + interval '30 minutes')::timestamptz,
       'confirmed', 'APT-DA-0001'
  from public.reports r where r.id = 'eeeeeeee-0000-4000-8000-000000000001';

insert into public.appointments (report_id, user_id, doctor_id, slot_start, slot_end, status, reference_code)
select r.id, r.user_id, r.doctor_id,
       (now() - interval '3 days')::timestamptz,
       (now() - interval '3 days' + interval '30 minutes')::timestamptz,
       'confirmed', 'APT-DA-0002'
  from public.reports r where r.id = 'eeeeeeee-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- 1. The appointments table still has no browser read grant
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.appointments', 'select') then
    raise exception 'FAIL: authenticated gained SELECT on appointments';
  end if;
  if not has_function_privilege('authenticated', 'public.get_doctor_appointments()', 'execute') then
    raise exception 'FAIL: authenticated cannot execute get_doctor_appointments()';
  end if;
  if has_function_privilege('anon', 'public.get_doctor_appointments()', 'execute') then
    raise exception 'FAIL: anon can execute get_doctor_appointments()';
  end if;
  raise notice 'PASS: appointments stays closed; the read RPC is authenticated-only';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The assigned osteoarthritis doctor sees exactly their own appointment
-- ---------------------------------------------------------------------------
do $$
declare
  -- Resolve the identity before switching role: the temporary fixture table is not
  -- readable as `authenticated`.
  v_uid uuid := (select uid from ids where label = 'doctor-or');
  v_rows integer;
  v_name text;
  v_status public.appointment_status;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  select count(*) into v_rows from public.get_doctor_appointments();
  if v_rows <> 1 then
    raise exception 'FAIL: expected 1 appointment for the assigned doctor, got %', v_rows;
  end if;

  select patient_name, appointment_status into v_name, v_status
    from public.get_doctor_appointments() limit 1;
  if v_name <> 'Asha Fixture' then
    raise exception 'FAIL: expected the report patient name, got %', coalesce(v_name, '(null)');
  end if;
  if v_status <> 'confirmed' then
    raise exception 'FAIL: expected confirmed, got %', v_status;
  end if;

  raise notice 'PASS: assigned doctor sees exactly their own appointment with the patient display name';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 3. A different doctor sees only theirs; a non-doctor sees nothing
-- ---------------------------------------------------------------------------
do $$
declare
  v_doctor uuid := (select uid from ids where label = 'doctor-gm');
  v_patient uuid := (select uid from ids where label = 'patient-a');
  v_rows integer;
  v_name text;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_doctor, 'role', 'authenticated')::text, true);

  select count(*) into v_rows from public.get_doctor_appointments();
  if v_rows <> 1 then
    raise exception 'FAIL: expected 1 appointment for the general medicine doctor, got %', v_rows;
  end if;
  select patient_name into v_name from public.get_doctor_appointments() limit 1;
  if v_name <> 'Ravi Fixture' then
    raise exception 'FAIL: doctor-gm saw the wrong patient: %', coalesce(v_name, '(null)');
  end if;
  raise notice 'PASS: each doctor sees only their own appointments';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_patient, 'role', 'authenticated')::text, true);

  select count(*) into v_rows from public.get_doctor_appointments();
  if v_rows <> 0 then
    raise exception 'FAIL: a patient with no doctor mapping saw % appointments', v_rows;
  end if;
  raise notice 'PASS: a caller with no doctor_profiles row gets an empty set';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Past appointments are returned (the Past tab depends on it)
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := (select uid from ids where label = 'doctor-gm');
  v_past integer;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  select count(*) into v_past
    from public.get_doctor_appointments()
   where slot_start < now();
  if v_past <> 1 then
    raise exception 'FAIL: expected the past appointment to be returned, got %', v_past;
  end if;
  raise notice 'PASS: past appointments are returned so the Past tab can render';
  reset role;
end $$;

rollback;

-- Everything above rolls back; no fixture survives.
