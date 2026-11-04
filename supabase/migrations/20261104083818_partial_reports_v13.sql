-- Report contract v1.3 (2/2) — non-emergency partial reports.
--
-- Additive evolution authorised by the owner. A `partial` report is a truthful early-finish
-- pre-visit intake: it carries only the answers the patient actually gave, every other
-- field keeps its explicit information status, and `missing_information` lists them.
--
-- Guarantees preserved:
--   * `urgent_partial` remains emergency-only (reports_emergency_rule_scope unchanged) and
--     remains the ONLY urgent-queue predicate; `partial` can never enter the urgent queue.
--   * Doctor visibility is still derived from doctor_profiles; the policy gains one status
--     value and no new grant, role or broad read.
--   * Drafts stay invisible to doctors.
--   * Clinical content, routing, flags and status stay frozen after submission
--     (reports_guard_terminal is unchanged and already treats any non-draft status as
--     terminal).
--   * Routine booking is allowed for a partial report through the same RPCs, with the same
--     emergency and review-hold refusals.
--   * No column, type or JSONB field is added or remapped; v1.2 records stay valid.

-- 1. submitted_at is required for `partial` exactly as it is for `submitted`.
alter table public.reports drop constraint if exists reports_status_submitted_at;
alter table public.reports
  add constraint reports_status_submitted_at
  check ((status in ('submitted', 'partial')) = (submitted_at is not null));

comment on constraint reports_status_submitted_at on public.reports is
  'submitted and partial both represent a report the patient sent to a doctor, so both carry submitted_at. draft and urgent_partial never do.';

-- 2. Doctor read policy: assignment or the documented emergency cross-visibility.
drop policy if exists reports_doctor_read on public.reports;
create policy reports_doctor_read
  on public.reports for select
  to authenticated
  using (
    status in ('submitted', 'partial', 'urgent_partial')
    and (
      exists (
        select 1
        from public.doctor_profiles dp
        where dp.user_id = (select auth.uid())
          and dp.doctor_id = reports.doctor_id
      )
      or (
        department_key = 'emergency'
        and exists (
          select 1
          from public.doctor_profiles dp
          join public.doctors d on d.id = dp.doctor_id
          where dp.user_id = (select auth.uid())
            and d.department_key in ('general_medicine', 'emergency')
        )
      )
    )
  );

comment on policy reports_doctor_read on public.reports is
  'Assigned doctor for submitted and v1.3 partial reports, plus the documented read-only Emergency cross-visibility. Drafts never match and partial reports are never treated as emergency reports.';

-- 3. Availability: a partial report is bookable under the same rules as a complete one.
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

  if v_report.status not in ('submitted', 'partial') then
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
  'Routine availability for the caller''s own submitted or v1.3 partial, non-emergency, non-held report. SECURITY DEFINER, empty search_path, auth.uid() ownership validated inside. Emergency and urgent_partial reports are refused.';

revoke all on function public.get_available_slots(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_available_slots(uuid, integer) to authenticated;

-- 4. Mark Reviewed: the assigned doctor may acknowledge a partial report too. Emergency
--    authority (D-30) is untouched; this only adds the same assigned-doctor path.
create or replace function public.mark_report_reviewed(p_report_id uuid)
returns table (
  report_id uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  already_reviewed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_report public.reports%rowtype;
  v_doctor uuid;
  v_department text;
  v_reviewed_at timestamptz;
  v_reviewed_by uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select dp.doctor_id
    into v_doctor
    from public.doctor_profiles dp
   where dp.user_id = v_uid;

  if v_doctor is null then
    raise exception 'caller is not a mapped doctor' using errcode = '42501';
  end if;

  select d.department_key
    into v_department
    from public.doctors d
   where d.id = v_doctor;

  select r.*
    into v_report
    from public.reports r
   where r.id = p_report_id;

  if v_report.id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;

  if v_report.status in ('submitted', 'partial') then
    if v_report.doctor_id <> v_doctor then
      raise exception 'not authorised to review this report' using errcode = '42501';
    end if;
  elsif v_report.status = 'urgent_partial' then
    if v_department <> 'emergency' or v_report.department_key <> 'emergency' then
      raise exception 'not authorised to review this report' using errcode = '42501';
    end if;
  else
    raise exception 'report is not reviewable' using errcode = '22023';
  end if;

  if v_report.reviewed_at is not null then
    return query select v_report.id, v_report.reviewed_at, v_report.reviewed_by, true;
    return;
  end if;

  update public.reports r
     set reviewed_at = now(),
         reviewed_by = v_uid
   where r.id = v_report.id
     and r.reviewed_at is null
  returning r.reviewed_at, r.reviewed_by into v_reviewed_at, v_reviewed_by;

  if v_reviewed_at is null then
    select r.reviewed_at, r.reviewed_by
      into v_reviewed_at, v_reviewed_by
      from public.reports r
     where r.id = v_report.id;
    return query select v_report.id, v_reviewed_at, v_reviewed_by, true;
    return;
  end if;

  return query select v_report.id, v_reviewed_at, v_reviewed_by, false;
end;
$$;

comment on function public.mark_report_reviewed(uuid) is
  'Marks a report reviewed. SECURITY DEFINER, empty search_path, auth.uid() validated, two columns only. Assigned doctor for submitted and v1.3 partial reports; emergency report review stays Emergency-doctor-only (D-30).';
