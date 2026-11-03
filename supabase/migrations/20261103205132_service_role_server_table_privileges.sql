-- Production hotfix — restore the elevated server client's table privileges.
--
-- Cause (proven on the hosted project on 4 November 2026):
--   The hosted project's default table privileges grant the API roles only
--   TRUNCATE/REFERENCES/TRIGGER/MAINTAIN:
--     {postgres=arwdDxtm/postgres,anon=Dxtm/postgres,authenticated=Dxtm/postgres,service_role=Dxtm/postgres}
--   Migrations 1-11 therefore had to grant every privilege explicitly. They granted read
--   access to `authenticated` where the browser needs it, and DML to `service_role` only on
--   the two usage tables. Every server-owned table was left without SELECT/INSERT/UPDATE for
--   `service_role`, so the chat-turn elevated client failed on its first write with
--   SQLSTATE 42501 "permission denied for table sessions" — surfaced to the browser as
--   HTTP 500 {"error":"internal"} on every start_session call.
--
-- Scope: only the DML the Edge Functions actually perform through the elevated client.
-- Nothing is granted to PUBLIC, anon or authenticated; no policy is created, changed or
-- dropped; RLS stays enabled on every table; `service_role` keeps bypassing RLS as designed
-- (AGENTS.md: "narrowly scoped elevated server-side client for server-owned writes").
--
-- Not granted on purpose: appointments, doctor_schedules and doctor_profiles. Booking,
-- availability and doctor appointment reads go through the reviewed RPCs, and doctor
-- report/message reads use the caller-scoped `authenticated` grants plus RLS.

grant select, insert, update on public.sessions to service_role;
grant select, insert on public.consent_records to service_role;
grant select, insert on public.messages to service_role;
grant select, insert, update on public.reports to service_role;
grant select on public.departments to service_role;
grant select on public.doctors to service_role;

comment on table public.sessions is
  'Server-owned intake session. answer_turn_count is the authoritative 15-answer cap and is only advanced by a conditional UPDATE. service_role holds the only write grant; browser roles hold none.';
