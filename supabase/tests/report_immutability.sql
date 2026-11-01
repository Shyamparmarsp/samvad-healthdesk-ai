-- Terminal report immutability (M4-S21B). Local disposable stack only.
--   docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/report_immutability.sql

\set ON_ERROR_STOP on
begin;

create temporary table ids (label text primary key, uid uuid) on commit drop;
insert into ids
select 'patient-a', (select id from auth.users where email = 'patient-a@rls.test');

do $$
begin
  if exists (select 1 from ids where uid is null) then
    raise exception 'Missing local test identities';
  end if;
end $$;

insert into public.sessions (id, user_id, language, status, answer_turn_count)
values ('ffffffff-0000-4000-8000-000000000001', (select uid from ids where label = 'patient-a'),
        'en', 'submitted', 10);

insert into public.reports (id, session_id, user_id, status, department_key, doctor_id,
                            intake_reference, submitted_at, report)
values ('ffffffff-0000-4000-8000-000000000002',
        'ffffffff-0000-4000-8000-000000000001',
        (select uid from ids where label = 'patient-a'),
        'submitted', 'orthopedics',
        (select id from public.doctors where department_key = 'orthopedics'),
        'SHD-IM-0001', now(), '{"schema_version":1,"tag":"frozen"}'::jsonb);

-- 1. clinical content is frozen
do $$
begin
  begin
    update public.reports set report = '{"schema_version":1,"tag":"tampered"}'::jsonb
     where id = 'ffffffff-0000-4000-8000-000000000002';
    raise exception 'FAIL: clinical content was modified after submission';
  exception when sqlstate '42501' then
    raise notice 'PASS: clinical content is immutable after submission';
  end;
end $$;

-- 2. status is terminal
do $$
begin
  begin
    update public.reports set status = 'draft'
     where id = 'ffffffff-0000-4000-8000-000000000002';
    raise exception 'FAIL: submitted report was reverted to draft';
  exception when sqlstate '42501' then
    raise notice 'PASS: report status is terminal';
  end;
end $$;

-- 3. routing cannot be redirected by anyone
do $$
begin
  begin
    update public.reports set doctor_id = (select id from public.doctors where department_key = 'cardiology')
     where id = 'ffffffff-0000-4000-8000-000000000002';
    raise exception 'FAIL: routing was changed after submission';
  exception when sqlstate '42501' then
    raise notice 'PASS: routing is immutable after submission';
  end;
end $$;

-- 4. review columns remain writable (the one authorised write)
do $$
begin
  update public.reports
     set reviewed_at = now(), reviewed_by = (select uid from ids where label = 'patient-a')
   where id = 'ffffffff-0000-4000-8000-000000000002';
  raise notice 'PASS: review columns remain writable';
end $$;

-- 5. a draft is still freely correctable (its own session: reports.session_id is UNIQUE)
insert into public.sessions (id, user_id, language, status, answer_turn_count)
values ('ffffffff-0000-4000-8000-000000000004', (select uid from ids where label = 'patient-a'),
        'en', 'in_progress', 4);

insert into public.reports (id, session_id, user_id, status, department_key, doctor_id,
                            intake_reference, report)
values ('ffffffff-0000-4000-8000-000000000003',
        'ffffffff-0000-4000-8000-000000000004',
        (select uid from ids where label = 'patient-a'),
        'draft', 'orthopedics',
        (select id from public.doctors where department_key = 'orthopedics'),
        'SHD-IM-0002', '{"schema_version":1,"tag":"draft"}'::jsonb);

update public.reports set report = '{"schema_version":1,"tag":"corrected"}'::jsonb
 where id = 'ffffffff-0000-4000-8000-000000000003';
do $$ begin raise notice 'PASS: drafts remain correctable'; end $$;

rollback;
