-- Constraint, grant and IST-bucket assertions. Disposable LOCAL stack only.
--
-- Run:   docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres \
--          -v ON_ERROR_STOP=1 < supabase/tests/constraints.sql
--
-- Status: executed against the local stack on 2 November 2026.

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- Structural constraints. Each block asserts that invalid data is refused.
-- ---------------------------------------------------------------------------
do $$
declare
  v_session uuid;
  gm_doctor uuid := (select id from public.doctors where department_key = 'general_medicine');
begin
  insert into public.sessions (user_id, language, status, answer_turn_count, current_question_id)
  select id, 'en', 'in_progress', 0, 'name' from auth.users where email = 'patient-a@rls.test'
  returning id into v_session;

  -- 1. audio claim must be all-or-nothing
  begin
    update public.sessions set audio_claim_id = gen_random_uuid() where id = v_session;
    raise exception 'FAIL: partial claim accepted';
  exception when check_violation then null;
  end;

  -- 2. claim state allowlist
  begin
    update public.sessions
       set audio_claim_id = gen_random_uuid(),
           audio_claim_question_id = 'name',
           audio_claim_expected_turn = 1,
           audio_claim_state = 'running',
           audio_claim_created_at = now(),
           audio_claim_expires_at = now() + interval '30 seconds'
     where id = v_session;
    raise exception 'FAIL: unknown claim state accepted';
  exception when check_violation then null;
  end;

  -- 3. pending transcript must be all-or-nothing and non-empty
  begin
    update public.sessions set pending_transcript_text = '' where id = v_session;
    raise exception 'FAIL: empty pending transcript accepted';
  exception when check_violation then null;
  end;

  -- 4. clarification answer and timestamp must move together
  begin
    update public.sessions set clarification_answer = 'yes' where id = v_session;
    raise exception 'FAIL: unpaired clarification answer accepted';
  exception when check_violation then null;
  end;

  -- 5. turn count cannot exceed 15
  begin
    update public.sessions set answer_turn_count = 16 where id = v_session;
    raise exception 'FAIL: 16 turns accepted';
  exception when check_violation then null;
  end;

  -- 6. a submitted report needs submitted_at
  begin
    insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, report)
    values (v_session, (select id from auth.users where email = 'patient-a@rls.test'), 'submitted',
            'general_medicine', gm_doctor, 'SHD-TEST-BAD01', '{"schema_version":1}'::jsonb);
    raise exception 'FAIL: submitted report without submitted_at accepted';
  exception when check_violation then null;
  end;

  -- 7. an urgent_partial report can never be submitted
  begin
    insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
    values (v_session, (select id from auth.users where email = 'patient-a@rls.test'), 'urgent_partial',
            'emergency', (select id from public.doctors where department_key = 'emergency'),
            'SHD-TEST-BAD02', now(), '{"schema_version":1}'::jsonb);
    raise exception 'FAIL: submitted urgent_partial accepted';
  exception when check_violation then null;
  end;

  -- 8. review fields move together
  insert into public.reports (session_id, user_id, status, department_key, doctor_id, intake_reference, submitted_at, report)
  values (v_session, (select id from auth.users where email = 'patient-a@rls.test'), 'submitted',
          'general_medicine', gm_doctor, 'SHD-TEST-OK001', now(), '{"schema_version":1}'::jsonb);

  begin
    update public.reports set reviewed_at = now() where session_id = v_session;
    raise exception 'FAIL: review timestamp without reviewer accepted';
  exception when check_violation then null;
  end;

  -- 9. one patient answer per turn
  insert into public.messages (session_id, role, question_id, turn_index, final_text)
  values (v_session, 'patient', 'name', 1, 'Synthetic A');

  begin
    insert into public.messages (session_id, role, question_id, turn_index, final_text)
    values (v_session, 'patient', 'name', 1, 'Synthetic A again');
    raise exception 'FAIL: duplicate turn index accepted';
  exception when unique_violation then null;
  end;

  raise notice 'PASS: constraints reject invalid claim, pending, clarification, turn, report and duplicate data';
end $$;

-- ---------------------------------------------------------------------------
-- Grants: browser roles must not reach server-owned tables or the RPC.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.sessions', 'select') then
    raise exception 'FAIL: authenticated can select sessions';
  end if;
  if has_table_privilege('anon', 'public.reports', 'select') then
    raise exception 'FAIL: anon can select reports';
  end if;
  if has_table_privilege('authenticated', 'public.daily_usage_counters', 'select') then
    raise exception 'FAIL: authenticated can select usage counters';
  end if;
  if has_table_privilege('authenticated', 'public.daily_usage_limits', 'select') then
    raise exception 'FAIL: authenticated can select usage limits';
  end if;
  if has_table_privilege('authenticated', 'public.appointments', 'select') then
    raise exception 'FAIL: authenticated can select appointments';
  end if;

  if has_function_privilege('authenticated', 'public.reserve_daily_usage(text)', 'execute') then
    raise exception 'FAIL: authenticated can execute reserve_daily_usage';
  end if;
  if has_function_privilege('anon', 'public.reserve_daily_usage(text)', 'execute') then
    raise exception 'FAIL: anon can execute reserve_daily_usage';
  end if;
  if not has_function_privilege('service_role', 'public.reserve_daily_usage(text)', 'execute') then
    raise exception 'FAIL: service_role cannot execute reserve_daily_usage';
  end if;
  if not has_table_privilege('service_role', 'public.daily_usage_counters', 'update') then
    raise exception 'FAIL: service_role cannot update counters';
  end if;

  raise notice 'PASS: grants are service-role only for usage, no browser write path';
end $$;

-- ---------------------------------------------------------------------------
-- IST bucketing: only the Asia/Kolkata day row moves.
-- ---------------------------------------------------------------------------
do $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  yesterday date := today - 1;
  before_yesterday integer;
  after_yesterday integer;
  after_today integer;
begin
  delete from public.daily_usage_counters where counter_name = 'groq';
  insert into public.daily_usage_counters (counter_date, counter_name, used)
  values (yesterday, 'groq', 5);

  update public.daily_usage_limits set daily_limit = 300 where counter_name = 'groq';

  perform public.reserve_daily_usage('groq');

  select used into before_yesterday from public.daily_usage_counters where counter_date = yesterday and counter_name = 'groq';
  select used into after_yesterday from public.daily_usage_counters where counter_date = today and counter_name = 'groq';

  if before_yesterday <> 5 then
    raise exception 'FAIL: previous IST day changed to %', before_yesterday;
  end if;
  if after_yesterday <> 1 then
    raise exception 'FAIL: today bucket is % (expected 1)', after_yesterday;
  end if;

  -- A second reservation must increment today only.
  perform public.reserve_daily_usage('groq');
  select used into after_today from public.daily_usage_counters where counter_date = today and counter_name = 'groq';
  if after_today <> 2 then
    raise exception 'FAIL: second reservation produced %', after_today;
  end if;

  raise notice 'PASS: IST bucketing isolates days (%)', today;
end $$;

-- ---------------------------------------------------------------------------
-- Unknown counter is refused and writes nothing.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.reserve_daily_usage('openai');
    raise exception 'FAIL: unknown counter accepted';
  exception when others then
    if sqlerrm not like '%unknown usage counter%' then raise; end if;
  end;
  raise notice 'PASS: unknown counter refused';
end $$;

rollback;

\echo 'Constraint, grant and IST assertions completed.'
