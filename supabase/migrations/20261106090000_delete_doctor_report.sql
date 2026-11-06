-- Permanent report deletion by the assigned doctor.
--
-- Why an RPC: `reports` has no browser DELETE grant (server-owned table), so the delete
-- must be a narrowly scoped, authorisation-checked operation. It is the third reviewed
-- SECURITY DEFINER exception, alongside book_appointment() and mark_report_reviewed(),
-- and it follows the same rules: fixed empty search_path, schema-qualified references,
-- no dynamic SQL, EXECUTE revoked from PUBLIC/anon and granted to authenticated only.
--
-- What it deletes:
--   * the report row (its appointments cascade by the existing FK);
--   * that intake's messages, which are the report-exclusive transcript.
--
-- What it deliberately keeps:
--   * the session row and the patient's consent record (patient-owned audit data);
--   * every other report, appointment, doctor, account and configuration row.
--
-- Who may delete: only the doctor the report is assigned to. The General Medicine and
-- Emergency cross-visibility is read-only by design, so it never grants deletion.
--
-- Rejected: unauthenticated callers, unknown ids, drafts (never doctor-visible), and
-- any caller who is not the assigned doctor.

create or replace function public.delete_doctor_report(p_report_id uuid)
returns table (deleted_report_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_user uuid := (select auth.uid());
  v_report public.reports%rowtype;
begin
  if v_doctor_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_report_id is null then
    raise exception 'invalid report id' using errcode = '22023';
  end if;

  -- Lock the row so two concurrent deletes cannot both report success.
  select r.*
    into v_report
    from public.reports r
   where r.id = p_report_id
     for update;

  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
      from public.doctor_profiles dp
     where dp.user_id = v_doctor_user
       and dp.doctor_id = v_report.doctor_id
  ) then
    raise exception 'not authorised to delete this report' using errcode = '42501';
  end if;

  if v_report.status = 'draft' then
    raise exception 'draft reports are not deletable here' using errcode = '22023';
  end if;

  -- The transcript exists only to support this report (reports.session_id is UNIQUE).
  delete from public.messages m where m.session_id = v_report.session_id;

  -- Appointments reference reports ON DELETE CASCADE.
  delete from public.reports r where r.id = p_report_id;

  return query select p_report_id;
end;
$$;

comment on function public.delete_doctor_report(uuid) is
  'Permanently deletes one report and its report-exclusive transcript. Assigned doctor only; the session and consent record are retained.';

revoke all on function public.delete_doctor_report(uuid) from public;
revoke all on function public.delete_doctor_report(uuid) from anon;
grant execute on function public.delete_doctor_report(uuid) to authenticated;
