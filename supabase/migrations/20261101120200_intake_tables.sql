-- M1-S6 (3/5) — intake tables: sessions, consent, messages, reports
--
-- Security notes:
--   * sessions, consent_records and reports are server-owned. No browser INSERT, UPDATE
--     or DELETE grant or policy exists for any of them.
--   * Patients read nothing here directly: every patient read and write goes through the
--     chat-turn Edge Function, which verifies the JWT and filters by the verified owner
--     using a narrowly scoped elevated client.
--   * Doctors read reports and messages through RLS only, and only for submitted or
--     urgent_partial reports that they may see. Drafts never satisfy a doctor policy.
--   * Anonymous patients are the `authenticated` role with is_anonymous = true, so no
--     policy may rely on the role alone.
--   * The transient pending-transcript and audio-claim columns live on sessions, are
--     server-only, and are never exposed to a doctor or the browser.

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  language text not null check (language in ('en', 'hi')),
  status public.session_status not null default 'created',
  answer_turn_count smallint not null default 0 check (answer_turn_count between 0 and 15),
  current_question_id text null,
  pending_clarification_rule_id text null,
  clarification_answer text null,
  clarification_answered_at timestamptz null,
  needs_human_review boolean not null default false,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Pending transcript: a transcription awaiting the patient's confirmation.
  pending_transcript_text text null,
  pending_transcript_language text null,
  pending_transcript_question_id text null,
  pending_transcript_expected_turn smallint null,
  pending_transcript_created_at timestamptz null,
  pending_transcript_expires_at timestamptz null,

  -- Audio processing claim: one in-flight provider attempt per session.
  audio_claim_id uuid null,
  audio_claim_question_id text null,
  audio_claim_expected_turn smallint null,
  audio_claim_state text null,
  audio_claim_created_at timestamptz null,
  audio_claim_expires_at timestamptz null,

  constraint sessions_pending_coherent check (
    num_nonnulls(
      pending_transcript_text,
      pending_transcript_language,
      pending_transcript_question_id,
      pending_transcript_expected_turn,
      pending_transcript_created_at,
      pending_transcript_expires_at
    ) in (0, 6)
  ),
  constraint sessions_pending_language check (
    pending_transcript_language is null or pending_transcript_language in ('en', 'hi')
  ),
  constraint sessions_pending_turn check (
    pending_transcript_expected_turn is null
    or pending_transcript_expected_turn between 1 and 15
  ),
  constraint sessions_pending_expiry check (
    pending_transcript_expires_at is null
    or pending_transcript_expires_at > pending_transcript_created_at
  ),
  constraint sessions_pending_text check (
    pending_transcript_text is null
    or char_length(pending_transcript_text) between 1 and 2000
  ),

  constraint sessions_clarification_pair check (
    (clarification_answer is null) = (clarification_answered_at is null)
  ),
  constraint sessions_clarification_length check (
    clarification_answer is null or char_length(clarification_answer) between 1 and 1000
  ),

  constraint sessions_claim_coherent check (
    num_nonnulls(
      audio_claim_id,
      audio_claim_question_id,
      audio_claim_expected_turn,
      audio_claim_state,
      audio_claim_created_at,
      audio_claim_expires_at
    ) in (0, 6)
  ),
  constraint sessions_claim_state check (
    audio_claim_state is null or audio_claim_state in ('claimed', 'dispatched')
  ),
  constraint sessions_claim_turn check (
    audio_claim_expected_turn is null or audio_claim_expected_turn between 1 and 15
  ),
  constraint sessions_claim_expiry check (
    audio_claim_expires_at is null or audio_claim_expires_at > audio_claim_created_at
  )
);

comment on table public.sessions is
  'Server-owned intake session. answer_turn_count is the authoritative 15-answer cap and is only advanced by a conditional UPDATE.';
comment on column public.sessions.pending_transcript_expires_at is
  'Server-side expiry (10 minutes from persistence). Expired pendings are treated as absent and are never returned.';
comment on column public.sessions.needs_human_review is
  'Set when an ambiguous emergency statement was never reliably resolved. Copied onto the report at draft generation and blocks routine booking until Mark Reviewed.';
comment on column public.sessions.audio_claim_expires_at is
  'Claim lock/execution deadline. Refreshed at the dispatch fence. An expired claim can never write a transcript.';

create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_status_idx on public.sessions (status);

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  decision public.consent_decision not null,
  consent_text text not null check (char_length(consent_text) between 1 and 4000),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  language text not null check (language in ('en', 'hi')),
  decided_at timestamptz not null default now()
);

comment on table public.consent_records is
  'Explicit on-screen consent only. Never inferred from speech. A declined decision means no health data is collected and no report is created.';

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  turn_index smallint null,
  role public.message_role not null,
  question_id text null,
  original_text text null,
  final_text text null,
  input_mode public.message_input_mode null,
  created_at timestamptz not null default now(),

  constraint messages_turn_shape check (
    (role = 'patient' and turn_index is not null and turn_index between 1 and 15)
    or (role = 'assistant' and turn_index is null)
  ),
  constraint messages_patient_has_text check (
    role <> 'patient' or (final_text is not null and char_length(final_text) between 1 and 4000)
  ),
  constraint messages_original_text_length check (
    original_text is null or char_length(original_text) between 0 and 4000
  )
);

comment on table public.messages is
  'Conversation log. original_text keeps the raw transcription; final_text keeps what the patient confirmed or typed. Corrections never overwrite the original.';
comment on column public.messages.turn_index is
  'Only patient answers carry a turn index. Assistant questions never consume a turn.';

-- One stored answer per patient turn. This is the structural guarantee behind the
-- accept-path recovery and the 15-answer cap.
create unique index messages_patient_turn_unique
  on public.messages (session_id, turn_index)
  where role = 'patient';

create index messages_session_created_idx on public.messages (session_id, created_at);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.report_status not null,
  schema_version integer not null default 1 check (schema_version > 0),
  department_key text not null references public.departments (key) on update cascade,
  doctor_id uuid not null references public.doctors (id),
  intake_reference text not null unique
    check (char_length(intake_reference) between 6 and 40),
  possible_urgent boolean not null default false,
  needs_human_review boolean not null default false,
  emergency_rule_id text null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  report jsonb not null check (jsonb_typeof(report) = 'object'),

  constraint reports_status_submitted_at check (
    (status = 'submitted') = (submitted_at is not null)
  ),
  constraint reports_urgent_never_submitted check (
    status <> 'urgent_partial' or submitted_at is null
  ),
  constraint reports_emergency_rule_scope check (
    status = 'urgent_partial' or emergency_rule_id is null
  ),
  constraint reports_review_pair check ((reviewed_at is null) = (reviewed_by is null))
);

comment on table public.reports is
  'One report per session. status/flags/routing/reference/review are relational and authoritative; the jsonb document holds only clinical content and display labels (RD-22).';
comment on column public.reports.reviewed_by is
  'The authenticated doctor identity (auth.uid()), approved 1 Nov 2026 (RD-17). Doctor record and display name are derived through doctor_profiles.';

create index reports_doctor_status_idx on public.reports (doctor_id, status);
create index reports_user_id_idx on public.reports (user_id);
create index reports_department_status_idx on public.reports (department_key, status);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.sessions enable row level security;
alter table public.consent_records enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

-- Server-owned tables: no grants at all for browser roles.
revoke all on public.sessions from public, anon, authenticated;
revoke all on public.consent_records from public, anon, authenticated;

-- Doctors need read access; patients are filtered out by policy.
revoke all on public.messages from public, anon, authenticated;
revoke all on public.reports from public, anon, authenticated;
grant select on public.messages to authenticated;
grant select on public.reports to authenticated;

-- No policies exist on sessions or consent_records: with grants revoked, any browser
-- access fails loudly instead of silently returning rows.

create policy reports_doctor_read
  on public.reports for select
  to authenticated
  using (
    status in ('submitted', 'urgent_partial')
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
  'Assigned doctor, plus the documented read-only Emergency cross-visibility for the General Medicine and Emergency demo doctors. Drafts never match.';

-- The nested query inherits the reports policy, so a doctor can read only the
-- conversation of a report they may already read.
create policy messages_doctor_read
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.reports r
      where r.session_id = messages.session_id
    )
  );

comment on policy messages_doctor_read on public.messages is
  'Readable only when the caller may read a submitted or urgent_partial report for the same session.';
