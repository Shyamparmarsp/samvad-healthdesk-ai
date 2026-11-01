-- M4-S5/S6 — availability and atomic booking for routine appointments.
--
-- Why SECURITY DEFINER is necessary (book_appointment only):
--   appointments has no browser grant and must not gain one, and the booking must be a
--   single atomic reservation. The function performs that one insert after proving
--   ownership and eligibility. Fixed empty search_path, schema-qualified objects,
--   auth.uid() validated inline, EXECUTE restricted to authenticated.
--
-- Why get_available_slots is also SECURITY DEFINER:
--   reports is server-owned and deliberately has no browser read policy, so a
--   SECURITY INVOKER function cannot read the caller's own report to validate ownership
--   and eligibility. Making it DEFINER keeps reports unreadable from the browser while
--   exposing only derived slot times. It applies the same auth.uid() ownership check,
--   a fixed empty search_path, schema-qualified objects, and EXECUTE restricted to
--   authenticated. This deviation from the original "invoker" note is recorded in the
--   integration contract.
--
-- Trust model: the caller supplies a report id and (for booking) a slot start. Doctor,
-- department and ownership are always derived server-side. A client-supplied doctor id
-- is never authority.
--
-- Eligibility (identical in both functions):
--   * caller owns the report and the session
--   * status = 'submitted'                       (drafts and urgent_partial excluded)
--   * department is not emergency, booking enabled
--   * if possible_urgent or needs_human_review, reviewed_at must be set (Mark Reviewed)
-- Review never unlocks an emergency report.

create or replace function public.get_available_slots(
  p_report_id uuid,
  p_days integer default 14
)
returns table (
  slot_start timestamptz,
  slot_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_report public.reports%rowtype;
  v_department public.departments%rowtype;
  v_doctor uuid;
  v_today date;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_days is null or p_days < 1 or p_days > 14 then
    raise exception 'invalid horizon' using errcode = '22023';
  end if;

  select r.* into v_report
    from public.reports r
   where r.id = p_report_id
     and r.user_id = v_uid;
  if v_report.id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'report is not eligible for routine booking' using errcode = '22023';
  end if;

  select d.* into v_department
    from public.departments d
   where d.key = v_report.department_key;
  if v_department.key is null or v_department.is_emergency or not v_department.booking_enabled then
    raise exception 'department is not bookable' using errcode = '22023';
  end if;

  if (v_report.possible_urgent or v_report.needs_human_review) and v_report.reviewed_at is null then
    raise exception 'report is held pending review' using errcode = '42501';
  end if;

  v_doctor := v_report.doctor_id;
  v_today := (now() at time zone 'Asia/Kolkata')::date;

  return query
  with days as (
    select generate_series(v_today, v_today + (p_days - 1), interval '1 day')::date as day
  ),
  slot_times as (
    select t.slot_local, s.slot_minutes
      from days
      join public.doctor_schedules s
        on s.doctor_id = v_doctor
       and s.weekday = extract(dow from days.day)::smallint
      cross join lateral generate_series(
        days.day::timestamp + s.start_time,
        days.day::timestamp + s.end_time - (s.slot_minutes || ' minutes')::interval,
        (s.slot_minutes || ' minutes')::interval
      ) as t(slot_local)
     where s.break_start is null
        or t.slot_local::time < s.break_start
        or t.slot_local::time >= s.break_end
  )
  select (st.slot_local at time zone 'Asia/Kolkata') as slot_start,
         (st.slot_local at time zone 'Asia/Kolkata') + (st.slot_minutes || ' minutes')::interval as slot_end
    from slot_times st
   where (st.slot_local at time zone 'Asia/Kolkata') > now()
     and not exists (
       select 1 from public.appointments a
        where a.doctor_id = v_doctor
          and a.slot_start = (st.slot_local at time zone 'Asia/Kolkata')
          and a.status = 'confirmed'
     )
   order by 1;
end;
$$;

comment on function public.get_available_slots(uuid, integer) is
  'Routine availability for the caller''s own submitted, non-emergency, non-held report. SECURITY DEFINER because reports has no browser read policy; auth.uid() ownership is validated inside. Next 14 Asia/Kolkata days, seeded weekday schedule, lunch excluded, occupied and past slots removed.';

revoke all on function public.get_available_slots(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_available_slots(uuid, integer) to authenticated;

create or replace function public.book_appointment(
  p_report_id uuid,
  p_slot_start timestamptz
)
returns table (
  appointment_id uuid,
  reference_code text,
  slot_start timestamptz,
  slot_end timestamptz,
  doctor_id uuid,
  already_booked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_report public.reports%rowtype;
  v_existing public.appointments%rowtype;
  v_slot record;
  v_id uuid;
  v_reference text;
  v_day text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select r.* into v_report
    from public.reports r
   where r.id = p_report_id
     and r.user_id = v_uid;
  if v_report.id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;

  -- Idempotency: an existing confirmed appointment for this report is returned unchanged.
  select a.* into v_existing
    from public.appointments a
   where a.report_id = v_report.id
     and a.status = 'confirmed';
  if v_existing.id is not null then
    if v_existing.slot_start = p_slot_start then
      return query select v_existing.id, v_existing.reference_code, v_existing.slot_start, v_existing.slot_end, v_existing.doctor_id, true;
      return;
    end if;
    raise exception 'report already has a confirmed appointment' using errcode = '23505';
  end if;

  -- Revalidate through the same eligibility and availability logic; this also rejects a
  -- slot that was taken since the patient last looked.
  select * into v_slot
    from public.get_available_slots(p_report_id, 14) s
   where s.slot_start = p_slot_start;
  if v_slot.slot_start is null then
    raise exception 'slot is no longer available' using errcode = '23505';
  end if;

  v_day := to_char((p_slot_start at time zone 'Asia/Kolkata')::date, 'YYYYMMDD');
  v_reference := 'APT-' || v_day || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into public.appointments (report_id, user_id, doctor_id, slot_start, slot_end, status, reference_code)
  values (v_report.id, v_uid, v_report.doctor_id, v_slot.slot_start, v_slot.slot_end, 'confirmed', v_reference)
  returning id into v_id;

  return query select v_id, v_reference, v_slot.slot_start, v_slot.slot_end, v_report.doctor_id, false;
exception
  when unique_violation then
    raise exception 'slot is no longer available' using errcode = '23505';
end;
$$;

comment on function public.book_appointment(uuid, timestamptz) is
  'Atomic routine booking. SECURITY DEFINER, empty search_path, auth.uid() ownership, doctor derived from the report, slot revalidated, duplicate and concurrent bookings rejected by unique constraints. Emergency and held reports are refused.';

revoke all on function public.book_appointment(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.book_appointment(uuid, timestamptz) to authenticated;
