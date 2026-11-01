-- M4-S16-B — read-only doctor appointment reads.
--
-- Gap this closes: `appointments` deliberately has no browser grant and no read policy
-- (20261101120300_appointments.sql), and no RPC was ever added, so the doctor dashboard
-- could not see a single booking. "Booked" was always 0 and the Today / Upcoming / Past
-- tabs were always empty in real mode. `src/lib/api.ts` getDoctorAppointments() swallowed
-- the permission error and returned [].
--
-- Why SECURITY DEFINER, and why not a table grant:
--   * `appointments` must stay unreadable from the browser. The schema guard
--     (`_shared/schema.test.ts`) forbids `grant select on public.appointments` for
--     `authenticated`, and a SECURITY INVOKER function runs as the caller, so it could not
--     read the table either.
--   * This is the same documented deviation already accepted for `get_available_slots`
--     (20261102130000_availability_and_booking.sql): keep the table closed, expose only
--     derived rows. It is recorded in docs/integration-contract.md.
--   * Adds exactly one function to the reviewed SECURITY DEFINER list. Controls match the
--     two existing RPCs: empty search_path, schema-qualified names, auth.uid() validated
--     inline, EXECUTE revoked from PUBLIC/anon/authenticated then granted to authenticated,
--     no dynamic SQL, SELECT only.
--   * Deliberately does NOT return appointments.user_id: the doctor needs the patient's
--     display name, not another identity's auth uid.
--
-- Scope: the caller's own doctor_id only. Emergency cross-visibility is a *report* read;
-- an urgent_partial report can never be booked, so no appointment row can exist for it.
-- There is no date filter because Today / Upcoming / Past and the Completed label are
-- derived from slot_start client-side, and hiding past rows would break the Past tab.

create or replace function public.get_doctor_appointments()
returns table (
  appointment_id uuid,
  report_id uuid,
  doctor_id uuid,
  doctor_name text,
  department_key text,
  department_name text,
  patient_name text,
  slot_start timestamptz,
  slot_end timestamptz,
  reference_code text,
  appointment_status public.appointment_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_doctor uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select dp.doctor_id into v_doctor
    from public.doctor_profiles dp
   where dp.user_id = v_uid;

  -- Not a mapped doctor: return nothing. Existence of a doctor mapping is never
  -- confirmed through an error code.
  if v_doctor is null then
    return;
  end if;

  return query
  select
    a.id,
    a.report_id,
    a.doctor_id,
    d.display_name,
    d.department_key,
    dep.name,
    coalesce(r.report #>> '{patient,name,value}', ''),
    a.slot_start,
    a.slot_end,
    a.reference_code,
    a.status,
    a.created_at
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.departments dep on dep.key = d.department_key
  left join public.reports r on r.id = a.report_id
  where a.doctor_id = v_doctor
    and a.status = 'confirmed'
  order by a.slot_start;
end;
$$;

comment on function public.get_doctor_appointments() is
  'Read-only confirmed appointments for the doctor mapped to auth.uid(). SECURITY DEFINER because appointments has no browser grant and an invoker function cannot read it; ownership is validated inside and only derived display fields are returned.';

revoke all on function public.get_doctor_appointments() from public, anon, authenticated;
grant execute on function public.get_doctor_appointments() to authenticated;
