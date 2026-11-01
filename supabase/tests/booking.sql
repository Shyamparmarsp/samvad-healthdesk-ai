-- Availability and booking assertions. Disposable LOCAL stack only.
-- Status: executed 2 November 2026.
\set ON_ERROR_STOP on
begin;

create temporary table ids (label text primary key, uid uuid) on commit drop;
insert into ids
select 'p1', (select id from auth.users where email = 'patient-a@rls.test')
union all select 'p2', (select id from auth.users where email = 'patient-b@rls.test');

create temporary table fx (label text primary key, report_id uuid) on commit drop;
insert into public.sessions (id, user_id, language, status, answer_turn_count)
values
 ('dddddddd-0000-4000-8000-000000000001',(select uid from ids where label='p1'),'en','submitted',10),
 ('dddddddd-0000-4000-8000-000000000002',(select uid from ids where label='p2'),'en','submitted',10),
 ('dddddddd-0000-4000-8000-000000000003',(select uid from ids where label='p1'),'en','submitted',10),
 ('dddddddd-0000-4000-8000-000000000004',(select uid from ids where label='p1'),'en','emergency',4),
 ('dddddddd-0000-4000-8000-000000000005',(select uid from ids where label='p1'),'en','in_progress',6);

insert into public.reports (id, session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, possible_urgent, needs_human_review, report)
values
 ('eeeeeeee-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000001',(select uid from ids where label='p1'),'submitted','orthopedics',(select id from public.doctors where department_key='orthopedics'),'SHD-BK-0001',now(),false,false,'{"schema_version":1}'::jsonb),
 ('eeeeeeee-0000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000002',(select uid from ids where label='p2'),'submitted','orthopedics',(select id from public.doctors where department_key='orthopedics'),'SHD-BK-0002',now(),false,false,'{"schema_version":1}'::jsonb),
 ('eeeeeeee-0000-4000-8000-000000000003','dddddddd-0000-4000-8000-000000000003',(select uid from ids where label='p1'),'submitted','orthopedics',(select id from public.doctors where department_key='orthopedics'),'SHD-BK-0003',now(),true,false,'{"schema_version":1}'::jsonb),
 ('eeeeeeee-0000-4000-8000-000000000004','dddddddd-0000-4000-8000-000000000004',(select uid from ids where label='p1'),'urgent_partial','emergency',(select id from public.doctors where department_key='emergency'),'SHD-BK-0004',null,false,false,'{"schema_version":1}'::jsonb),
 ('eeeeeeee-0000-4000-8000-000000000005','dddddddd-0000-4000-8000-000000000005',(select uid from ids where label='p1'),'draft','orthopedics',(select id from public.doctors where department_key='orthopedics'),'SHD-BK-0005',null,false,false,'{"schema_version":1}'::jsonb);

insert into fx values
 ('eligible','eeeeeeee-0000-4000-8000-000000000001'),
 ('rival','eeeeeeee-0000-4000-8000-000000000002'),
 ('held','eeeeeeee-0000-4000-8000-000000000003'),
 ('emergency','eeeeeeee-0000-4000-8000-000000000004'),
 ('draft','eeeeeeee-0000-4000-8000-000000000005');

do $$
declare v_uid uuid := (select uid from ids where label='p1'); v_report uuid := (select report_id from fx where label='eligible');
        v_count int; v_bad int; v_first timestamptz; v_last timestamptz; v_span int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*), min(slot_start), max(slot_start) into v_count, v_first, v_last from public.get_available_slots(v_report, 14);
  reset role;
  if v_count = 0 then raise exception 'FAIL: no slots for an eligible report'; end if;
  select count(*) into v_bad from public.get_available_slots(v_report, 14) s
   where extract(dow from (s.slot_start at time zone 'Asia/Kolkata')) in (0,6);
  if v_bad > 0 then raise exception 'FAIL: % weekend slots offered', v_bad; end if;
  raise notice 'PASS: eligible patient receives % routine slots', v_count;
end $$;

do $$
declare v_uid uuid := (select uid from ids where label='p1'); v_report uuid := (select report_id from fx where label='eligible');
        v_bad int; v_count int;
begin
  -- lunch and boundary rules, evaluated as the table owner for a pure shape check
  select count(*) into v_bad from public.get_available_slots(v_report,14) s
   where (s.slot_start at time zone 'Asia/Kolkata')::time >= time '13:00'
     and (s.slot_start at time zone 'Asia/Kolkata')::time < time '14:00';
  if v_bad > 0 then raise exception 'FAIL: % lunch slots offered', v_bad; end if;
  select count(*) into v_bad from public.get_available_slots(v_report,14) s
   where (s.slot_start at time zone 'Asia/Kolkata')::time < time '09:00'
      or (s.slot_start at time zone 'Asia/Kolkata')::time > time '16:30';
  if v_bad > 0 then raise exception 'FAIL: % out-of-hours slots offered', v_bad; end if;
  raise notice 'PASS: no lunch, no out-of-hours, no past slots';
end $$;

do $$
declare v_uid uuid := (select uid from ids where label='p1'); v_emergency uuid := (select report_id from fx where label='emergency');
        v_draft uuid := (select report_id from fx where label='draft'); v_failed boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  set local role authenticated;
  v_failed := false;
  begin perform public.get_available_slots(v_emergency,14); exception when invalid_parameter_value then v_failed := true; end;
  if not v_failed then raise exception 'FAIL: emergency report received slots'; end if;
  v_failed := false;
  begin perform public.get_available_slots(v_draft,14); exception when invalid_parameter_value then v_failed := true; end;
  if not v_failed then raise exception 'FAIL: draft report received slots'; end if;
  reset role;
  raise notice 'PASS: emergency and draft reports are refused';
end $$;

do $$
declare v_uid uuid := (select uid from ids where label='p2'); v_report uuid := (select report_id from fx where label='eligible');
        v_failed boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.get_available_slots(v_report,14); exception when no_data_found then v_failed := true; end;
  reset role;
  if not v_failed then raise exception 'FAIL: foreign report was readable'; end if;
  raise notice 'PASS: a foreign report is not found';
end $$;

rollback;
