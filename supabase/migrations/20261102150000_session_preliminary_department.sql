-- Persist the preliminary department decided for a session so adaptive question
-- retrieval uses the routed department instead of defaulting to General Medicine.
-- Written only by the backend from a validated candidate; Emergency is never routed.

alter table public.sessions
  add column if not exists preliminary_department text null
  references public.departments (key) on update cascade;

alter table public.sessions
  add constraint sessions_preliminary_department_not_emergency
  check (preliminary_department is distinct from 'emergency');

comment on column public.sessions.preliminary_department is
  'Cached preliminary department used for adaptive retrieval and draft routing. Never supplied by the browser; never emergency.';

revoke all on public.sessions from public, anon, authenticated;
