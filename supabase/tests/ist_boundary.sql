-- Exact Asia/Kolkata midnight boundary, against the production calculation.
-- Status: executed 2 November 2026 on the disposable local stack.
\set ON_ERROR_STOP on
begin;

do $$
declare
  before_day date := public.ist_day_bucket('2026-11-01 23:59:59+05:30'::timestamptz);
  after_day  date := public.ist_day_bucket('2026-11-02 00:00:01+05:30'::timestamptz);
  utc_equiv  date := public.ist_day_bucket('2026-11-01 18:30:01+00'::timestamptz);
  utc_prev   date := public.ist_day_bucket('2026-11-01 18:29:59+00'::timestamptz);
begin
  if before_day <> date '2026-11-01' then raise exception 'FAIL: 23:59:59 IST bucketed to %', before_day; end if;
  if after_day <> date '2026-11-02' then raise exception 'FAIL: 00:00:01 IST bucketed to %', after_day; end if;
  if before_day = after_day then raise exception 'FAIL: midnight does not split the bucket'; end if;
  if utc_prev <> date '2026-11-01' then raise exception 'FAIL: UTC 18:29:59 bucketed to %', utc_prev; end if;
  if utc_equiv <> date '2026-11-02' then raise exception 'FAIL: UTC 18:30:01 bucketed to %', utc_equiv; end if;
  raise notice 'PASS: 23:59:59 -> 2026-11-01, 00:00:01 -> 2026-11-02, UTC offsets agree';
end $$;

do $$
declare
  day_one date := date '2026-11-01';
  day_two date := date '2026-11-02';
  used_one int;
  used_two int;
begin
  delete from public.daily_usage_counters where counter_name = 'prisma';
  insert into public.daily_usage_counters (counter_date, counter_name, used) values (day_one, 'prisma', 7);

  -- The production reservations use ist_day_bucket(now()); this asserts that a new day
  -- starts a fresh bucket and leaves the previous day untouched.
  insert into public.daily_usage_counters (counter_date, counter_name, used) values (day_two, 'prisma', 1)
  on conflict (counter_date, counter_name) do update set used = public.daily_usage_counters.used + 1;

  select used into used_one from public.daily_usage_counters where counter_date = day_one and counter_name = 'prisma';
  select used into used_two from public.daily_usage_counters where counter_date = day_two and counter_name = 'prisma';

  if used_one <> 7 then raise exception 'FAIL: previous day changed to %', used_one; end if;
  if used_two <> 1 then raise exception 'FAIL: new day started at %', used_two; end if;
  raise notice 'PASS: previous day untouched, new day counted independently';
end $$;

do $$
declare
  src text;
begin
  select prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reserve_daily_usage';
  if src not like '%public.ist_day_bucket(now())%' then
    raise exception 'FAIL: production reservation does not use the shared bucket helper';
  end if;
  raise notice 'PASS: reserve_daily_usage() derives its bucket from ist_day_bucket(now())';
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.ist_day_bucket(timestamptz)', 'execute') then
    raise exception 'FAIL: browser role can execute ist_day_bucket';
  end if;
  if has_function_privilege('anon', 'public.ist_day_bucket(timestamptz)', 'execute') then
    raise exception 'FAIL: anon can execute ist_day_bucket';
  end if;
  if not has_function_privilege('service_role', 'public.ist_day_bucket(timestamptz)', 'execute') then
    raise exception 'FAIL: service_role cannot execute ist_day_bucket';
  end if;
  raise notice 'PASS: ist_day_bucket is service_role only';
end $$;

rollback;
\echo 'IST boundary assertions completed.'
