-- M4 — mark_report_reviewed(): the only doctor write in the product.
--
-- Why SECURITY DEFINER is necessary here:
--   reports has no browser UPDATE grant and must not gain one. A reviewer therefore
--   cannot write the two review columns through RLS alone. This function performs that
--   single narrow write after proving the caller is a mapped doctor who is authorised
--   for this specific report. It changes exactly two columns and nothing else.
--
-- Security properties:
--   * SECURITY DEFINER with an empty search_path and schema-qualified references.
--   * auth.uid() is read inside the function and validated; no caller-supplied identity.
--   * EXECUTE is revoked from PUBLIC and anon, granted only to authenticated.
--   * No table grants are added or changed; there is still no direct browser UPDATE path.
--   * Only reviewed_at and reviewed_by are written.
--
-- Authorisation matrix (interim, pending owner decision OD-03):
--   status = 'submitted'
--     caller must be the doctor assigned to the report
--   status = 'urgent_partial'
--     caller must be a doctor in the emergency department (the Emergency doctor)
--   anything else            -> rejected (drafts are never reviewable)
--   an unassigned doctor     -> rejected
--   a General Medicine doctor on an emergency report -> rejected
--     OD-03 is unresolved. Read cross-visibility does NOT grant review authority, so the
--     conservative interim rule denies it until the owner decides.
--
-- Review is a workflow acknowledgement, not medical clearance. It never changes status,
-- flags, routing, content or booking eligibility, so an emergency report remains
-- permanently ineligible for routine slots.

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
  v_doctor uuid;
  v_department text;
  v_report public.reports%rowtype;
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

  if v_report.status = 'submitted' then
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

  -- Idempotent: the first review timestamp is never overwritten.
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
    -- Lost a concurrent race; report the winner's values.
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
  'Marks a report reviewed. SECURITY DEFINER, empty search_path, auth.uid() validated, two columns only. OD-03 interim: an emergency report may be reviewed by the Emergency doctor and not by a General Medicine doctor.';

revoke all on function public.mark_report_reviewed(uuid) from public, anon, authenticated;
grant execute on function public.mark_report_reviewed(uuid) to authenticated;
