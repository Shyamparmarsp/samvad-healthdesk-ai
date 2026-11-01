-- M1-S6 (1/5) — enums and shared trigger helper
--
-- Security notes:
--   * No table is created here, so no RLS decision is made.
--   * `public.set_updated_at()` is a trigger helper, SECURITY INVOKER, with an empty
--     search_path and schema-qualified references. It is not an RPC and is not
--     executable by browser roles in any meaningful way (trigger functions cannot be
--     invoked directly from PostgREST).
--
-- Report information statuses are deliberately NOT a PostgreSQL enum: they live inside
-- the report JSON document and are validated at runtime (docs/report-design.md §3).

create type public.session_status as enum (
  'created',
  'consented',
  'declined',
  'in_progress',
  'emergency',
  'ended',
  'submitted'
);

create type public.report_status as enum (
  'draft',
  'submitted',
  'urgent_partial'
);

create type public.consent_decision as enum ('yes', 'no');

create type public.message_role as enum ('assistant', 'patient');

create type public.message_input_mode as enum ('text', 'voice');

create type public.appointment_status as enum ('confirmed', 'cancelled');

comment on type public.report_status is
  'Report lifecycle only. Session state is public.session_status and must never be copied here (docs/report-design.md §1-§2). Three values only: no reviewed / partial / cancelled report status exists. Mark Reviewed changes two fields, not the status.';
comment on type public.session_status is
  'Intake session lifecycle. Deliberately distinct from report_status and never shared as a TypeScript union.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger helper. Empty search_path; no dynamic SQL; not callable from the API.';
