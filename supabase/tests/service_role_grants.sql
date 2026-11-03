-- Elevated-client table privileges. Disposable LOCAL stack only.
--
-- Regression test for the 4 November 2026 production outage: the hosted project grants
-- API roles only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN by default, so `service_role` must
-- be granted explicitly on every server-owned table the Edge Functions write. Without
-- these grants start_session fails with SQLSTATE 42501 "permission denied for table
-- sessions" and the browser shows HTTP 500 {"error":"internal"}.
--
-- Run:   docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres \
--          -v ON_ERROR_STOP=1 < supabase/tests/service_role_grants.sql

\set ON_ERROR_STOP on
begin;

do $$
declare
  missing text[] := '{}';
  server_owned text[] := array['sessions', 'consent_records', 'messages', 'reports'];
  reference_tables text[] := array['departments', 'doctors'];
  t text;
begin
  -- 1. The elevated server client can perform exactly the DML chat-turn and speak need.
  if not has_table_privilege('service_role', 'public.sessions', 'select') then
    missing := missing || 'service_role select sessions';
  end if;
  if not has_table_privilege('service_role', 'public.sessions', 'insert') then
    missing := missing || 'service_role insert sessions';
  end if;
  if not has_table_privilege('service_role', 'public.sessions', 'update') then
    missing := missing || 'service_role update sessions';
  end if;
  if not has_table_privilege('service_role', 'public.consent_records', 'insert') then
    missing := missing || 'service_role insert consent_records';
  end if;
  if not has_table_privilege('service_role', 'public.consent_records', 'select') then
    missing := missing || 'service_role select consent_records';
  end if;
  if not has_table_privilege('service_role', 'public.messages', 'insert') then
    missing := missing || 'service_role insert messages';
  end if;
  if not has_table_privilege('service_role', 'public.messages', 'select') then
    missing := missing || 'service_role select messages';
  end if;
  if not has_table_privilege('service_role', 'public.reports', 'insert') then
    missing := missing || 'service_role insert reports';
  end if;
  if not has_table_privilege('service_role', 'public.reports', 'update') then
    missing := missing || 'service_role update reports';
  end if;
  if not has_table_privilege('service_role', 'public.reports', 'select') then
    missing := missing || 'service_role select reports';
  end if;

  foreach t in array reference_tables loop
    if not has_table_privilege('service_role', 'public.' || t, 'select') then
      missing := missing || ('service_role select ' || t);
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception 'FAIL: missing elevated-client privilege(s): %', array_to_string(missing, ', ');
  end if;
  raise notice 'PASS: service_role holds the server-owned table privileges';

  -- 2. Browser roles still hold no write privilege on those tables.
  foreach t in array server_owned loop
    if has_table_privilege('authenticated', 'public.' || t, 'insert')
       or has_table_privilege('authenticated', 'public.' || t, 'update')
       or has_table_privilege('authenticated', 'public.' || t, 'delete') then
      raise exception 'FAIL: authenticated gained write access to %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'insert')
       or has_table_privilege('anon', 'public.' || t, 'update')
       or has_table_privilege('anon', 'public.' || t, 'delete') then
      raise exception 'FAIL: anon gained write access to %', t;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.sessions', 'select')
     or has_table_privilege('authenticated', 'public.consent_records', 'select') then
    raise exception 'FAIL: sessions/consent_records became browser-readable';
  end if;
  raise notice 'PASS: browser roles keep no write path and no session read';

  -- 3. Appointments stay closed; booking only happens inside the reviewed RPC.
  if has_table_privilege('service_role', 'public.appointments', 'insert')
     or has_table_privilege('authenticated', 'public.appointments', 'insert') then
    raise exception 'FAIL: appointments is writable outside book_appointment()';
  end if;
  raise notice 'PASS: appointments is not directly writable';

  -- 4. Row level security is still enabled everywhere.
  for t in select c.relname
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
  loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'FAIL: RLS disabled on %', t;
    end if;
  end loop;
  raise notice 'PASS: RLS enabled on every public table';

  -- 5. The elevated client can actually write a session for an existing identity.
  --    Rolled back with the surrounding transaction.
  if exists (select 1 from auth.users) then
    execute 'set local role service_role';
    insert into public.sessions (user_id, language, status, current_question_id)
    select id, 'en', 'created', 'name' from auth.users limit 1;
    execute 'reset role';
    if not exists (select 1 from public.sessions) then
      raise exception 'FAIL: service_role could not create a session';
    end if;
    raise notice 'PASS: service_role can create a session';
  else
    raise notice 'NOT TESTED: no auth.users identity exists (create the local test identities first)';
  end if;
end $$;

rollback;
