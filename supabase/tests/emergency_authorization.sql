-- Emergency authorization and RLS certification — DISPOSABLE LOCAL STACK ONLY.
--
-- Proves the urgent-report access contract without widening any policy:
--   * reports/messages are readable only through the documented doctor policies;
--   * drafts are never readable;
--   * a General Medicine and an Emergency doctor can read an urgent report; another
--     department's doctor cannot;
--   * the browser has no write path to reports, messages, sessions or appointments;
--   * Mark Reviewed follows the OD-03 interim matrix and never unlocks an emergency
--     report;
--   * an urgent_partial report is immutable and permanently unbookable.
--
-- Everything runs inside one transaction and is rolled back. Nothing is deleted from
-- the host stack and no policy, grant or limit is changed.
--
-- Procedure (see supabase/tests/README.md):
--   docker exec -i supabase_db_samvad-backend \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/emergency_authorization.sql
--
-- Prerequisites on the local stack: patient-a@rls.test, patient-b@rls.test,
-- doctor-gm@rls.test, doctor-em@rls.test, doctor-or@rls.test and their
-- doctor_profiles mappings. The doctor identities are local test fixtures; the seeded
-- demo doctor accounts are not required and are never touched.

\set ON_ERROR_STOP on

begin;

create temporary table cert_ids (
  patient_a uuid,
  patient_b uuid,
  doctor_gm uuid,
  doctor_em uuid,
  doctor_or uuid,
  doctor_gm_record uuid,
  doctor_em_record uuid,
  doctor_or_record uuid
) on commit drop;

insert into cert_ids
select
  (select id from auth.users where email = 'patient-a@rls.test'),
  (select id from auth.users where email = 'patient-b@rls.test'),
  (select id from auth.users where email = 'doctor-gm@rls.test'),
  (select id from auth.users where email = 'doctor-em@rls.test'),
  (select id from auth.users where email = 'doctor-or@rls.test'),
  (select dp.doctor_id from public.doctor_profiles dp
     join auth.users u on u.id = dp.user_id where u.email = 'doctor-gm@rls.test'),
  (select dp.doctor_id from public.doctor_profiles dp
     join auth.users u on u.id = dp.user_id where u.email = 'doctor-em@rls.test'),
  (select dp.doctor_id from public.doctor_profiles dp
     join auth.users u on u.id = dp.user_id where u.email = 'doctor-or@rls.test');

do $$
begin
  if exists (select 1 from cert_ids where patient_a is null or patient_b is null
             or doctor_gm is null or doctor_em is null or doctor_or is null
             or doctor_gm_record is null or doctor_em_record is null
             or doctor_or_record is null) then
    raise exception 'Missing local certification identities or doctor mappings. See supabase/tests/README.md.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (owner context, RLS bypassed). Synthetic content only.
-- Session ids are eeeeeeee-...-00000000000N, report ids ffffffff-...-00000000000N.
-- ---------------------------------------------------------------------------
insert into public.sessions (id, user_id, language, status, answer_turn_count, current_question_id)
values
  ('eeeeeeee-0000-4000-8000-000000000001', (select patient_a from cert_ids), 'en', 'submitted', 8, null),
  ('eeeeeeee-0000-4000-8000-000000000002', (select patient_a from cert_ids), 'en', 'in_progress', 3, 'primary_concern'),
  ('eeeeeeee-0000-4000-8000-000000000003', (select patient_b from cert_ids), 'en', 'emergency', 3, null),
  ('eeeeeeee-0000-4000-8000-000000000004', (select patient_b from cert_ids), 'en', 'submitted', 8, null);

insert into public.messages (session_id, role, question_id, turn_index, final_text)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'patient', 'name', 1, 'Synthetic A'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'patient', 'name', 1, 'Synthetic A'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'patient', 'name', 1, 'Synthetic B'),
  ('eeeeeeee-0000-4000-8000-000000000004', 'patient', 'name', 1, 'Synthetic B');

insert into public.reports
  (id, session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, emergency_rule_id, report)
values
  ('ffffffff-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001',
   (select patient_a from cert_ids), 'submitted', 'general_medicine',
   (select doctor_gm_record from cert_ids), 'SHD-20261102-CERT01', now(), null,
   '{"schema_version":1,"summary":null,"emergency":null}'::jsonb),
  ('ffffffff-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000002',
   (select patient_a from cert_ids), 'draft', 'general_medicine',
   (select doctor_gm_record from cert_ids), 'SHD-20261102-CERT02', null, null,
   '{"schema_version":1,"summary":null,"emergency":null}'::jsonb),
  ('ffffffff-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000003',
   (select patient_b from cert_ids), 'urgent_partial', 'emergency',
   (select doctor_em_record from cert_ids), 'SHD-20261102-CERT03', null, 'breathing_emergency',
   '{"schema_version":1,"summary":null,"emergency":{"rule_id":"breathing_emergency","patient_statement":"Synthetic certification statement"}}'::jsonb),
  ('ffffffff-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000004',
   (select patient_b from cert_ids), 'submitted', 'orthopedics',
   (select doctor_or_record from cert_ids), 'SHD-20261102-CERT04', now(), null,
   '{"schema_version":1,"summary":null,"emergency":null}'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. General Medicine doctor: assigned submitted + emergency cross-visibility.
-- ---------------------------------------------------------------------------
do $$
declare
  gm uuid := (select doctor_gm from cert_ids);
  visible integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.reports
   where id in ('ffffffff-0000-4000-8000-000000000001',
                'ffffffff-0000-4000-8000-000000000002',
                'ffffffff-0000-4000-8000-000000000003',
                'ffffffff-0000-4000-8000-000000000004');
  if visible <> 2 then raise exception 'FAIL: GM sees % fixture reports (expected 2)', visible; end if;

  select count(*) into visible from public.reports
   where id = 'ffffffff-0000-4000-8000-000000000003';
  if visible <> 1 then raise exception 'FAIL: GM cannot read the urgent report'; end if;

  select count(*) into visible from public.reports
   where id = 'ffffffff-0000-4000-8000-000000000002';
  if visible <> 0 then raise exception 'FAIL: GM can read a draft'; end if;

  select count(*) into visible from public.reports
   where id = 'ffffffff-0000-4000-8000-000000000004';
  if visible <> 0 then raise exception 'FAIL: GM can read another department''s submitted report'; end if;

  select count(*) into visible from public.messages
   where session_id in ('eeeeeeee-0000-4000-8000-000000000001',
                        'eeeeeeee-0000-4000-8000-000000000002',
                        'eeeeeeee-0000-4000-8000-000000000003',
                        'eeeeeeee-0000-4000-8000-000000000004');
  if visible <> 2 then raise exception 'FAIL: GM sees % conversations (expected 2)', visible; end if;
  if exists (select 1 from public.messages where session_id = 'eeeeeeee-0000-4000-8000-000000000002') then
    raise exception 'FAIL: GM can read a draft conversation';
  end if;

  reset role;
  raise notice 'PASS: General Medicine sees assigned submitted + urgent cross-visibility, never drafts';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Emergency doctor: the urgent report only.
-- ---------------------------------------------------------------------------
do $$
declare
  em uuid := (select doctor_em from cert_ids);
  visible integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', em, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.reports
   where id = 'ffffffff-0000-4000-8000-000000000003';
  if visible <> 1 then raise exception 'FAIL: Emergency doctor cannot read the urgent report'; end if;

  select count(*) into visible from public.reports
   where id in ('ffffffff-0000-4000-8000-000000000001',
                'ffffffff-0000-4000-8000-000000000002',
                'ffffffff-0000-4000-8000-000000000004');
  if visible <> 0 then raise exception 'FAIL: Emergency doctor sees an unrelated report'; end if;

  select count(*) into visible from public.messages
   where session_id = 'eeeeeeee-0000-4000-8000-000000000003';
  if visible <> 1 then raise exception 'FAIL: Emergency doctor cannot read the urgent conversation'; end if;

  reset role;
  raise notice 'PASS: Emergency doctor sees the urgent report and its conversation only';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Another department's doctor: its own submitted report only.
-- ---------------------------------------------------------------------------
do $$
declare
  orr uuid := (select doctor_or from cert_ids);
  visible integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', orr, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.reports
   where id = 'ffffffff-0000-4000-8000-000000000004';
  if visible <> 1 then raise exception 'FAIL: orthopedics cannot read its own submitted report'; end if;

  select count(*) into visible from public.reports
   where id in ('ffffffff-0000-4000-8000-000000000001',
                'ffffffff-0000-4000-8000-000000000002',
                'ffffffff-0000-4000-8000-000000000003');
  if visible <> 0 then raise exception 'FAIL: orthopedics sees a report outside its contract'; end if;

  select count(*) into visible from public.messages
   where session_id in ('eeeeeeee-0000-4000-8000-000000000001',
                        'eeeeeeee-0000-4000-8000-000000000002',
                        'eeeeeeee-0000-4000-8000-000000000003');
  if visible <> 0 then raise exception 'FAIL: orthopedics sees another report''s conversation'; end if;

  reset role;
  raise notice 'PASS: another department cannot read the urgent report';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Patient: no direct read of server-owned clinical data.
-- ---------------------------------------------------------------------------
do $$
declare
  pa uuid := (select patient_a from cert_ids);
  visible integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible from public.reports;
  if visible <> 0 then raise exception 'FAIL: patient read % reports', visible; end if;
  select count(*) into visible from public.messages;
  if visible <> 0 then raise exception 'FAIL: patient read % messages', visible; end if;

  begin
    select count(*) into visible from public.sessions;
    raise exception 'FAIL: patient read sessions (% rows)', visible;
  exception when insufficient_privilege then null;
  end;

  begin
    select count(*) into visible from public.appointments;
    raise exception 'FAIL: patient read appointments (% rows)', visible;
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'PASS: patient cannot read reports, messages, sessions or appointments';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Unauthenticated role gets nothing.
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform 1 from public.reports limit 1;
    raise exception 'FAIL: anon read reports';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.messages limit 1;
    raise exception 'FAIL: anon read messages';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: anon has no clinical read path';
end $$;

-- ---------------------------------------------------------------------------
-- 6. No browser write path to server-owned tables.
-- ---------------------------------------------------------------------------
do $$
declare
  pa uuid := (select patient_a from cert_ids);
  gm uuid := (select doctor_gm from cert_ids);
  em uuid := (select doctor_em from cert_ids);
  gm_record uuid := (select doctor_gm_record from cert_ids);
  em_record uuid := (select doctor_em_record from cert_ids);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, report)
    values ('eeeeeeee-0000-4000-8000-000000000002', pa, 'submitted', 'general_medicine',
            gm_record, 'SHD-20261102-HACK1', '{}'::jsonb);
    raise exception 'FAIL: patient inserted a report';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.reports set status = 'submitted'
     where id = 'ffffffff-0000-4000-8000-000000000003';
    raise exception 'FAIL: patient updated a report';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.reports where id = 'ffffffff-0000-4000-8000-000000000003';
    raise exception 'FAIL: patient deleted an urgent report';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (session_id, role, question_id, turn_index, final_text)
    values ('eeeeeeee-0000-4000-8000-000000000003', 'patient', 'age', 4, '99');
    raise exception 'FAIL: patient inserted a message';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.sessions (user_id, language, status, current_question_id)
    values (pa, 'en', 'created', 'name');
    raise exception 'FAIL: patient inserted a session';
  exception when insufficient_privilege then null;
  end;

  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.reports set reviewed_at = now(), reviewed_by = gm
     where id = 'ffffffff-0000-4000-8000-000000000003';
    raise exception 'FAIL: doctor wrote reports directly';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.messages where session_id = 'eeeeeeee-0000-4000-8000-000000000003';
    raise exception 'FAIL: doctor deleted messages';
  exception when insufficient_privilege then null;
  end;

  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', em, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.appointments (report_id, user_id, doctor_id, slot_start, slot_end, reference_code)
    values ('ffffffff-0000-4000-8000-000000000003', em, em_record,
            now() + interval '1 day', now() + interval '1 day 30 minutes', 'APT-CERT-HACK');
    raise exception 'FAIL: doctor inserted an appointment';
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'PASS: no browser write path to reports, messages, sessions or appointments';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Mark Reviewed matrix and permanent emergency ineligibility.
-- ---------------------------------------------------------------------------
do $$
declare
  pa uuid := (select patient_a from cert_ids);
  pb uuid := (select patient_b from cert_ids);
  gm uuid := (select doctor_gm from cert_ids);
  em uuid := (select doctor_em from cert_ids);
  orr uuid := (select doctor_or from cert_ids);
  reviewed_one timestamptz;
  reviewed_two timestamptz;
begin
  -- GM on an urgent report: denied (OD-03 interim).
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_report_reviewed('ffffffff-0000-4000-8000-000000000003');
    raise exception 'FAIL: GM marked an emergency report reviewed';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Orthopedics on an urgent report: denied.
  perform set_config('request.jwt.claims', json_build_object('sub', orr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_report_reviewed('ffffffff-0000-4000-8000-000000000003');
    raise exception 'FAIL: orthopedics marked an emergency report reviewed';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Patient: denied, because the caller is not a mapped doctor.
  perform set_config('request.jwt.claims', json_build_object('sub', pa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_report_reviewed('ffffffff-0000-4000-8000-000000000003');
    raise exception 'FAIL: patient marked a report reviewed';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Draft: not reviewable at all.
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.mark_report_reviewed('ffffffff-0000-4000-8000-000000000002');
    raise exception 'FAIL: a draft was reviewable';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  -- Emergency doctor: allowed, idempotent, first timestamp preserved.
  perform set_config('request.jwt.claims', json_build_object('sub', em, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select reviewed_at into reviewed_one
    from public.mark_report_reviewed('ffffffff-0000-4000-8000-000000000003');
  if reviewed_one is null then raise exception 'FAIL: Emergency doctor review wrote no timestamp'; end if;
  select reviewed_at into reviewed_two
    from public.mark_report_reviewed('ffffffff-0000-4000-8000-000000000003');
  if reviewed_two <> reviewed_one then raise exception 'FAIL: repeat review changed the timestamp'; end if;
  reset role;

  if (select status from public.reports where id = 'ffffffff-0000-4000-8000-000000000003') <> 'urgent_partial' then
    raise exception 'FAIL: review changed the report status';
  end if;
  if (select submitted_at from public.reports where id = 'ffffffff-0000-4000-8000-000000000003') is not null then
    raise exception 'FAIL: review submitted an emergency report';
  end if;

  -- Even after review, the urgent report is not bookable. The fixture belongs to patient B.
  perform set_config('request.jwt.claims', json_build_object('sub', pb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.get_available_slots('ffffffff-0000-4000-8000-000000000003', 14);
    raise exception 'FAIL: reviewed urgent report produced routine slots';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.book_appointment('ffffffff-0000-4000-8000-000000000003', now() + interval '1 day');
    raise exception 'FAIL: reviewed urgent report was bookable';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  if exists (select 1 from public.appointments where report_id = 'ffffffff-0000-4000-8000-000000000003') then
    raise exception 'FAIL: an appointment exists for the urgent report';
  end if;

  raise notice 'PASS: Mark Reviewed matrix + permanent emergency ineligibility';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Terminal immutability of the urgent report (even through the owner path).
-- ---------------------------------------------------------------------------
do $$
declare
  gm_record uuid := (select doctor_gm_record from cert_ids);
begin
  begin
    update public.reports set status = 'submitted', submitted_at = now()
     where id = 'ffffffff-0000-4000-8000-000000000003';
    raise exception 'FAIL: urgent_partial was promoted to submitted';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.reports set report = '{"schema_version":1,"tampered":true}'::jsonb
     where id = 'ffffffff-0000-4000-8000-000000000003';
    raise exception 'FAIL: urgent report content was rewritten';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.reports set department_key = 'general_medicine', doctor_id = gm_record
     where id = 'ffffffff-0000-4000-8000-000000000003';
    raise exception 'FAIL: urgent routing was rewritten to a bookable department';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.reports set emergency_rule_id = null
     where id = 'ffffffff-0000-4000-8000-000000000003';
    raise exception 'FAIL: the emergency rule id was cleared';
  exception when insufficient_privilege then null;
  end;

  raise notice 'PASS: urgent_partial content, routing and flags are immutable';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Structural guarantees: policies, grants, enums, limits, functions.
-- ---------------------------------------------------------------------------
do $$
declare
  count_policies integer;
  count_write_policies integer;
  labels text;
  definition text;
  secured integer;
  em uuid := (select doctor_em from cert_ids);
begin
  -- RLS is enabled on every exposed clinical table.
  select count(*) into secured from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('sessions','consent_records','messages','reports','appointments',
                       'doctor_profiles','daily_usage_limits','daily_usage_counters')
     and c.relrowsecurity;
  if secured <> 8 then raise exception 'FAIL: RLS enabled on % of 8 tables', secured; end if;

  -- Reports has exactly one policy, and it is SELECT-only.
  select count(*) into count_policies from pg_policies
   where schemaname = 'public' and tablename = 'reports';
  if count_policies <> 1 then raise exception 'FAIL: % report policies (expected 1)', count_policies; end if;
  select count(*) into count_write_policies from pg_policies
   where schemaname = 'public' and tablename = 'reports' and cmd <> 'SELECT';
  if count_write_policies <> 0 then raise exception 'FAIL: a non-SELECT report policy exists'; end if;

  -- The read policy keeps drafts out and encodes the emergency cross-visibility.
  select qual into definition from pg_policies
   where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_doctor_read';
  if definition is null
     or position('submitted' in definition) = 0
     or position('urgent_partial' in definition) = 0
     or position('draft' in definition) <> 0 then
    raise exception 'FAIL: reports policy does not match the documented contract: %', definition;
  end if;

  -- No write policy exists on any server-owned table.
  select count(*) into count_write_policies from pg_policies
   where schemaname = 'public' and tablename in ('messages','sessions','consent_records','appointments')
     and cmd <> 'SELECT';
  if count_write_policies <> 0 then raise exception 'FAIL: a write policy exists on a server-owned table'; end if;

  if has_table_privilege('authenticated', 'public.reports', 'INSERT')
     or has_table_privilege('authenticated', 'public.reports', 'UPDATE')
     or has_table_privilege('authenticated', 'public.reports', 'DELETE') then
    raise exception 'FAIL: authenticated holds a report write grant';
  end if;
  if has_table_privilege('authenticated', 'public.messages', 'INSERT')
     or has_table_privilege('authenticated', 'public.messages', 'UPDATE')
     or has_table_privilege('authenticated', 'public.messages', 'DELETE') then
    raise exception 'FAIL: authenticated holds a message write grant';
  end if;
  if has_table_privilege('authenticated', 'public.appointments', 'SELECT')
     or has_table_privilege('authenticated', 'public.appointments', 'INSERT') then
    raise exception 'FAIL: authenticated holds an appointments grant';
  end if;
  if has_table_privilege('authenticated', 'public.sessions', 'SELECT') then
    raise exception 'FAIL: authenticated can read sessions';
  end if;

  -- Report status is still the three-value lifecycle enum.
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into labels
    from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'report_status';
  if labels <> 'draft,submitted,urgent_partial' then
    raise exception 'FAIL: report_status labels changed: %', labels;
  end if;

  -- The 15-answer cap is still a database constraint.
  select pg_get_constraintdef(oid) into definition from pg_constraint
   where conrelid = 'public.sessions'::regclass and conname = 'sessions_answer_turn_count_check';
  if definition is null or position('15' in definition) = 0 then
    raise exception 'FAIL: answer-turn constraint missing or changed: %', definition;
  end if;

  -- Report schema version is still 1.
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'reports' and column_name = 'schema_version') <> '1' then
    raise exception 'FAIL: reports.schema_version default changed';
  end if;

  -- Defined functions keep their documented security mode and search_path.
  if (select prosecdef from pg_proc where proname = 'get_available_slots'
       and pronamespace = 'public'::regnamespace) is not true then
    raise exception 'FAIL: get_available_slots is not SECURITY DEFINER';
  end if;
  if (select prosecdef from pg_proc where proname = 'book_appointment'
       and pronamespace = 'public'::regnamespace) is not true then
    raise exception 'FAIL: book_appointment is not SECURITY DEFINER';
  end if;
  if (select prosecdef from pg_proc where proname = 'mark_report_reviewed'
       and pronamespace = 'public'::regnamespace) is not true then
    raise exception 'FAIL: mark_report_reviewed is not SECURITY DEFINER';
  end if;
  if (select prosecdef from pg_proc where proname = 'reserve_daily_usage'
       and pronamespace = 'public'::regnamespace) is not false then
    raise exception 'FAIL: reserve_daily_usage is not SECURITY INVOKER';
  end if;
  if (select count(*) from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('get_available_slots','book_appointment','mark_report_reviewed')
         and position('search_path=""' in coalesce(array_to_string(p.proconfig, ','), '')) > 0) <> 3 then
    raise exception 'FAIL: an RPC lost its empty search_path';
  end if;
  if has_function_privilege('anon', 'public.book_appointment(uuid,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.mark_report_reviewed(uuid)', 'EXECUTE') then
    raise exception 'FAIL: anon can execute a booking/review RPC';
  end if;

  -- Doctor appointment reads are doctor-scoped and return no emergency booking.
  perform set_config('request.jwt.claims',
    json_build_object('sub', em, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from public.get_doctor_appointments()) then
    raise exception 'FAIL: an emergency fixture produced a doctor appointment row';
  end if;
  reset role;

  raise notice 'PASS: policy, grant, enum, limit, schema-version and function guarantees hold';
end $$;

rollback;

\echo 'Emergency authorization certification completed. Any FAIL would have raised an exception.'
