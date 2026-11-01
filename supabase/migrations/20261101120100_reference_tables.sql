-- M1-S6 (2/5) — reference data: departments, doctors, doctor profiles, schedules
--
-- Security notes:
--   * These four tables are non-clinical reference data. They are readable by any
--     signed-in caller (including anonymous patients) because the booking UI must show
--     departments, doctors and slot rules.
--   * doctor_profiles is readable only for the caller's own row, so a patient cannot
--     enumerate which auth user is a doctor.
--   * No browser role may INSERT, UPDATE or DELETE here.
--   * anon (no JWT) receives nothing.

create table public.departments (
  key text primary key,
  name text not null,
  booking_enabled boolean not null default true,
  is_emergency boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint departments_key_allowlist check (
    key in (
      'general_medicine',
      'orthopedics',
      'emergency',
      'general_surgery',
      'dermatology',
      'cardiology'
    )
  ),
  constraint departments_emergency_not_bookable check (not (is_emergency and booking_enabled))
);

comment on table public.departments is
  'Six fictional departments from docs/demo-seed-data.md. Emergency has booking_enabled = false and never produces routine slots.';

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  department_key text not null references public.departments(key) on update cascade,
  display_name text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint doctors_display_name_not_blank check (char_length(btrim(display_name)) between 2 and 120)
);

create unique index doctors_display_name_unique on public.doctors (display_name);
create index doctors_department_idx on public.doctors (department_key);

comment on table public.doctors is
  'Fictional demo clinicians only. Never real practitioners.';

create table public.doctor_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doctor_id uuid not null unique references public.doctors (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.doctor_profiles is
  'Maps a Supabase Auth user to a fictional doctor. Created only by the owner-approved mapping SQL; never inserted from the browser.';

create table public.doctor_schedules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  break_start time null,
  break_end time null,
  slot_minutes smallint not null default 30 check (slot_minutes between 5 and 240),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  constraint schedule_time_order check (start_time < end_time),
  constraint schedule_break_pair check ((break_start is null) = (break_end is null)),
  constraint schedule_break_window check (
    break_start is null
    or (break_start > start_time and break_end <= end_time and break_start < break_end)
  ),
  constraint schedule_timezone check (timezone = 'Asia/Kolkata')
);

create unique index doctor_schedules_doctor_weekday_unique
  on public.doctor_schedules (doctor_id, weekday);

comment on table public.doctor_schedules is
  'Slot rules, not generated slot rows (decision D1). Availability is computed from these rows minus confirmed appointments.';

alter table public.departments enable row level security;
alter table public.doctors enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.doctor_schedules enable row level security;

create policy departments_read_authenticated
  on public.departments for select
  to authenticated
  using (true);

create policy doctors_read_authenticated
  on public.doctors for select
  to authenticated
  using (true);

create policy doctor_schedules_read_authenticated
  on public.doctor_schedules for select
  to authenticated
  using (true);

create policy doctor_profiles_read_self
  on public.doctor_profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Remove Supabase's default grants before re-granting the minimum.
revoke all on public.departments from public, anon, authenticated;
revoke all on public.doctors from public, anon, authenticated;
revoke all on public.doctor_profiles from public, anon, authenticated;
revoke all on public.doctor_schedules from public, anon, authenticated;

grant select on public.departments to authenticated;
grant select on public.doctors to authenticated;
grant select on public.doctor_schedules to authenticated;
grant select on public.doctor_profiles to authenticated;
