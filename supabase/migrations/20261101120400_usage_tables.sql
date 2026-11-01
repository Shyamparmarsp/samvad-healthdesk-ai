-- M1-S6 (5/5) — server-only daily usage limits and the atomic reservation helper
--
-- Security notes:
--   * Both tables are server-only: RLS enabled, no policies, no grants to anon or
--     authenticated. Only service_role may read limits and read/insert/update counters.
--   * reserve_daily_usage() is SECURITY INVOKER (not DEFINER), has an empty search_path,
--     schema-qualified references, a fixed counter allowlist, derives the Asia/Kolkata
--     date inside SQL and accepts no caller date or amount.
--   * EXECUTE is revoked from PUBLIC, anon and authenticated and granted only to
--     service_role. It is never reachable from the browser.
--   * The owner edits limits in the Supabase SQL Editor; no redeploy is required.
--
-- Defaults below are application guardrails from decision D5, not provider quotas.
-- Every attempted provider request consumes one unit, including a failed attempt.

create table public.daily_usage_limits (
  counter_name text primary key
    check (counter_name in ('sessions', 'groq', 'prisma', 'timbre')),
  daily_limit integer not null check (daily_limit > 0),
  updated_at timestamptz not null default now()
);

comment on table public.daily_usage_limits is
  'Owner-editable per-IST-day caps. Server-only; never exposed to the browser.';

create table public.daily_usage_counters (
  counter_date date not null,
  counter_name text not null
    check (counter_name in ('sessions', 'groq', 'prisma', 'timbre')),
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (counter_date, counter_name)
);

comment on table public.daily_usage_counters is
  'One atomic consumption count per Asia/Kolkata calendar date and counter. Date is always derived in SQL.';

insert into public.daily_usage_limits (counter_name, daily_limit)
values
  ('sessions', 100),
  ('groq', 300),
  ('prisma', 150),
  ('timbre', 120)
on conflict (counter_name) do nothing;

alter table public.daily_usage_limits enable row level security;
alter table public.daily_usage_counters enable row level security;

revoke all on public.daily_usage_limits from public, anon, authenticated;
revoke all on public.daily_usage_counters from public, anon, authenticated;

grant select on public.daily_usage_limits to service_role;
grant select, insert, update on public.daily_usage_counters to service_role;

create or replace function public.reserve_daily_usage(p_counter text)
returns table (allowed boolean, used integer, daily_limit integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_date date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_counter is null or p_counter not in ('sessions', 'groq', 'prisma', 'timbre') then
    raise exception 'unknown usage counter' using errcode = '22023';
  end if;

  select l.daily_limit
    into v_limit
    from public.daily_usage_limits l
   where l.counter_name = p_counter;

  if v_limit is null then
    raise exception 'usage counter is not configured' using errcode = 'P0002';
  end if;

  -- Single statement: the row lock serialises concurrent reservations, so at most
  -- `daily_limit` reservations can ever succeed for one date and counter.
  insert into public.daily_usage_counters as c (counter_date, counter_name, used, updated_at)
  values (v_date, p_counter, 1, now())
  on conflict (counter_date, counter_name) do update
     set used = c.used + 1,
         updated_at = now()
   where c.used < v_limit
  returning c.used into v_used;

  if v_used is null then
    select c.used
      into v_used
      from public.daily_usage_counters c
     where c.counter_date = v_date
       and c.counter_name = p_counter;

    allowed := false;
    used := coalesce(v_used, v_limit);
    daily_limit := v_limit;
    return next;
    return;
  end if;

  allowed := true;
  used := v_used;
  daily_limit := v_limit;
  return next;
end;
$$;

comment on function public.reserve_daily_usage(text) is
  'Atomic IST-day reservation. SECURITY INVOKER, empty search_path, fixed counter allowlist, no caller-supplied date or amount. service_role only.';

revoke all on function public.reserve_daily_usage(text) from public, anon, authenticated;
grant execute on function public.reserve_daily_usage(text) to service_role;
