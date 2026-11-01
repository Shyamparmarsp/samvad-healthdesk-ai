-- Fictional seed data — docs/demo-seed-data.md
-- Every name, department and schedule below is synthetic. Applying this file is a
-- deliberate owner action: `git push` never applies it, and `db push` does not apply
-- `seed.sql` automatically.

begin;

insert into public.departments (key, name, booking_enabled, is_emergency, display_order)
values
  ('general_medicine', 'General Medicine', true,  false, 1),
  ('orthopedics',      'Orthopedics',      true,  false, 2),
  ('emergency',        'Emergency',        false, true,  3),
  ('general_surgery',  'General Surgery',  true,  false, 4),
  ('dermatology',      'Dermatology',      true,  false, 5),
  ('cardiology',       'Cardiology',       true,  false, 6)
on conflict (key) do update
  set name = excluded.name,
      booking_enabled = excluded.booking_enabled,
      is_emergency = excluded.is_emergency,
      display_order = excluded.display_order;

insert into public.doctors (department_key, display_name, is_demo)
values
  ('general_medicine', 'Dr. Aditi Rao',    true),
  ('orthopedics',      'Dr. Kabir Mehta',  true),
  ('emergency',        'Dr. Neha Verma',   true),
  ('general_surgery',  'Dr. Ishaan Patel', true),
  ('dermatology',      'Dr. Sara Khan',    true),
  ('cardiology',       'Dr. Arjun Nair',   true)
on conflict (display_name) do update
  set department_key = excluded.department_key,
      is_demo = excluded.is_demo;

-- Clinic rules: weekdays only, 09:00–17:00 Asia/Kolkata, 30 minute slots, lunch
-- 13:00–14:00. The last bookable start is therefore 16:30. Emergency has no rows.
insert into public.doctor_schedules (
  doctor_id,
  weekday,
  start_time,
  end_time,
  break_start,
  break_end,
  slot_minutes,
  timezone
)
select
  d.id,
  w.weekday,
  time '09:00',
  time '17:00',
  time '13:00',
  time '14:00',
  30,
  'Asia/Kolkata'
from public.doctors d
join public.departments dep on dep.key = d.department_key
cross join (values (1), (2), (3), (4), (5)) as w (weekday)
where dep.booking_enabled = true
on conflict (doctor_id, weekday) do update
  set start_time = excluded.start_time,
      end_time = excluded.end_time,
      break_start = excluded.break_start,
      break_end = excluded.break_end,
      slot_minutes = excluded.slot_minutes,
      timezone = excluded.timezone;

-- Application guardrails (decision D5). Never overwrite an owner-adjusted value.
insert into public.daily_usage_limits (counter_name, daily_limit)
values
  ('sessions', 100),
  ('groq', 300),
  ('prisma', 150),
  ('timbre', 120)
on conflict (counter_name) do nothing;

commit;
