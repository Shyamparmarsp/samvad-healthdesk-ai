-- M1-S6 (4/5) — appointments
--
-- Security notes:
--   * No browser read/write grant is issued here. Availability reads and booking are
--     M4 concerns and will be delivered by the narrow RPCs (get_available_slots,
--     book_appointment), not by table access.
--   * The partial unique indexes are the concurrency guarantee: one confirmed booking
--     per doctor and slot start, and one confirmed appointment per report.
--   * There is no cancellation write path in the MVP; the status value exists so a
--     cancelled row can never occupy a slot.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  doctor_id uuid not null references public.doctors (id),
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  status public.appointment_status not null default 'confirmed',
  reference_code text not null unique check (char_length(reference_code) between 6 and 40),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz null,

  constraint appointments_slot_order check (slot_end > slot_start),
  constraint appointments_cancelled_pair check ((status = 'cancelled') = (cancelled_at is not null))
);

comment on table public.appointments is
  'Confirmed bookings only reachable through book_appointment() (M4). Slot uniqueness is enforced by partial indexes.';

create unique index appointments_doctor_slot_confirmed
  on public.appointments (doctor_id, slot_start)
  where status = 'confirmed';

create unique index appointments_report_confirmed
  on public.appointments (report_id)
  where status = 'confirmed';

create index appointments_doctor_slot_idx on public.appointments (doctor_id, slot_start);

alter table public.appointments enable row level security;

revoke all on public.appointments from public, anon, authenticated;
