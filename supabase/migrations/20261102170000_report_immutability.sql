-- M4-S21B — terminal report immutability.
--
-- Invariant this enforces: once a report leaves `draft`, its clinical content, routing
-- and flags are frozen. The only columns a doctor may still change are `reviewed_at`,
-- `reviewed_by` (and `updated_at` via the existing trigger).
--
-- Why a trigger and not just application code: `reports` is server-owned and only the
-- elevated client writes it, but a future code path (or a manual repair) could otherwise
-- rewrite a submitted report silently. A deterministic database guard makes the invariant
-- true regardless of which code path runs, and it costs nothing at read time.
--
-- Allowed transitions:
--   draft -> submitted        (submit_report; status + submitted_at change)
--   draft -> draft            (correct_draft_report)
--   submitted -> submitted    (mark_report_reviewed; review columns only)
--   urgent_partial -> urgent_partial (mark_report_reviewed; review columns only)
--
-- Rejected: any change to report JSONB, status, routing, flags, reference, ownership or
-- submitted_at on a non-draft row.

create or replace function public.reports_guard_terminal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Drafts are free to change.
  if old.status = 'draft' then
    return new;
  end if;

  if new.session_id <> old.session_id or new.user_id <> old.user_id then
    raise exception 'report ownership is immutable after submission' using errcode = '42501';
  end if;

  if new.status <> old.status then
    raise exception 'report status is terminal once submitted' using errcode = '42501';
  end if;

  if new.department_key <> old.department_key
     or new.doctor_id <> old.doctor_id
     or new.intake_reference <> old.intake_reference
     or new.possible_urgent <> old.possible_urgent
     or new.needs_human_review <> old.needs_human_review
     or new.emergency_rule_id is distinct from old.emergency_rule_id
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'routing, flags and reference are immutable after submission' using errcode = '42501';
  end if;

  if new.report is distinct from old.report then
    raise exception 'clinical content is immutable after submission' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.reports_guard_terminal() is
  'Freezes clinical content, routing, flags and status once a report leaves draft. Only review columns remain writable.';

drop trigger if exists reports_guard_terminal on public.reports;
create trigger reports_guard_terminal
  before update on public.reports
  for each row execute function public.reports_guard_terminal();
