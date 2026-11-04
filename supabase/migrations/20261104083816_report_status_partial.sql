-- Report contract v1.3 (1/2) — add the non-emergency `partial` status.
--
-- Owner-authorised additive evolution. The patient may now finish an intake after at
-- least three accepted answers and send a truthful partial pre-visit report.
--
-- Why a separate migration: PostgreSQL allows `ALTER TYPE ... ADD VALUE`, but the new
-- value cannot be used in the same transaction. The enums, constraints, policy and RPCs
-- that reference `partial` live in the next migration so each file is a clean step.
--
-- What does NOT change here:
--   * every existing status keeps its meaning (`draft`, `submitted`, `urgent_partial`);
--   * `urgent_partial` stays emergency-only and stays the sole urgent-queue predicate;
--   * no column, type or JSONB field is added, renamed or remapped;
--   * existing rows are untouched.

alter type public.report_status add value if not exists 'partial';

comment on type public.report_status is
  'Report lifecycle only. Session state is public.session_status and must never be copied here. Four values: draft, submitted (complete intake), partial (early-finish intake, v1.3), urgent_partial (deterministic emergency only). No reviewed / cancelled report status exists. Mark Reviewed changes two fields, not the status.';
