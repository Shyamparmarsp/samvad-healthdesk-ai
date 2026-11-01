-- Single source of truth for the Asia/Kolkata day bucket.
--
-- reserve_daily_usage() previously computed the bucket inline. The expression is now a
-- narrowly scoped helper so the production path and the boundary test use the exact same
-- code. The helper is pure, has no table access, cannot mutate anything, and is not
-- granted to browser roles.

create or replace function public.ist_day_bucket(p_at timestamptz)
returns date
language sql
immutable
security invoker
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Kolkata')::date;
$$;

comment on function public.ist_day_bucket(timestamptz) is
  'Converts an instant to its Asia/Kolkata calendar date. Used by reserve_daily_usage and by the midnight boundary test.';

revoke all on function public.ist_day_bucket(timestamptz) from public, anon, authenticated;
grant execute on function public.ist_day_bucket(timestamptz) to service_role;

create or replace function public.reserve_daily_usage(p_counter text)
returns table (allowed boolean, used integer, daily_limit integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_date date := public.ist_day_bucket(now());
begin
  if p_counter is null or p_counter not in ('sessions', 'groq', 'prisma', 'timbre') then
    raise exception 'unknown usage counter' using errcode = '22023';
  end if;

  select l.daily_limit into v_limit
    from public.daily_usage_limits l
   where l.counter_name = p_counter;

  if v_limit is null then
    raise exception 'usage counter is not configured' using errcode = 'P0002';
  end if;

  insert into public.daily_usage_counters as c (counter_date, counter_name, used, updated_at)
  values (v_date, p_counter, 1, now())
  on conflict (counter_date, counter_name) do update
     set used = c.used + 1,
         updated_at = now()
   where c.used < v_limit
  returning c.used into v_used;

  if v_used is null then
    select c.used into v_used
      from public.daily_usage_counters c
     where c.counter_date = v_date and c.counter_name = p_counter;
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

revoke all on function public.reserve_daily_usage(text) from public, anon, authenticated;
grant execute on function public.reserve_daily_usage(text) to service_role;
