-- Disposable PostgreSQL bootstrap for local security tests.
--
-- The production database is Supabase, which provides the `auth` schema, the
-- `anon`/`authenticated`/`service_role` roles and `auth.uid()`. This file recreates only
-- those prerequisites so `supabase/migrations/*.sql` can be applied, unmodified, to a
-- throwaway local cluster. Nothing here is a policy: the real RLS policies come from the
-- migrations.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  role text not null default 'authenticated',
  created_at timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

-- Mirrors Supabase: the subject comes from the verified JWT claims setting.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      auth.jwt() ->> 'sub'
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role',
    'anon'
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- Deterministic identities used by the checked-in SQL suites (supabase/tests/*.sql).
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'patient-a@rls.test'),
  ('22222222-2222-4222-8222-222222222222', 'patient-b@rls.test'),
  ('33333333-3333-4333-8333-333333333333', 'doctor-gm@rls.test'),
  ('44444444-4444-4444-8444-444444444444', 'doctor-em@rls.test'),
  ('55555555-5555-4555-8555-555555555555', 'doctor-or@rls.test'),
  ('77777777-7777-4777-8777-777777777777', 'doctor-de@rls.test'),
  -- A signed-in account that was never mapped in doctor_profiles: the assistant must
  -- refuse to build or speak a summary for it.
  ('66666666-6666-4666-8666-666666666666', 'unmapped-doctor@rls.test')
on conflict (email) do nothing;
