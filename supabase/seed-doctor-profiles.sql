-- Doctor profile mapping — OWNER ACTION REQUIRED
--
-- This file maps the two dashboard-created Supabase Auth users to their fictional
-- doctor records. It never touches auth.users and contains no passwords.
--
-- BEFORE RUNNING:
--   1. Create both users in Supabase → Authentication (never with SQL):
--        General Medicine / Dr. Aditi Rao
--        Emergency        / Dr. Neha Verma
--   2. Copy each user's Auth UID from the dashboard.
--   3. Replace the two placeholders below with those UIDs. A UID must be a UUID.
--   4. Run this file in the Supabase SQL Editor, or approve
--      `supabase db push`-style application of this named file only.
--
-- Expected result: exactly two rows in public.doctor_profiles.
-- If a department has more than one doctor, this script raises and changes nothing.

begin;

do $$
declare
  v_general_uid uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE: General Medicine Auth UID
  v_emergency_uid uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE: Emergency Auth UID
  v_general_doctor uuid;
  v_emergency_doctor uuid;
  v_doctor_count integer;
begin
  if v_general_uid = '00000000-0000-0000-0000-000000000000'
     or v_emergency_uid = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Replace both placeholder Auth UIDs before running this file';
  end if;

  if v_general_uid = v_emergency_uid then
    raise exception 'The two Auth UIDs must be different';
  end if;

  select count(*) into v_doctor_count
    from public.doctors
   where department_key = 'general_medicine';

  if v_doctor_count <> 1 then
    raise exception 'Expected exactly one General Medicine doctor, found %', v_doctor_count;
  end if;

  select id into v_general_doctor
    from public.doctors
   where department_key = 'general_medicine';

  select id into v_emergency_doctor
    from public.doctors
   where department_key = 'emergency';

  if v_emergency_doctor is null then
    raise exception 'Emergency doctor is missing; apply supabase/seed.sql first';
  end if;

  insert into public.doctor_profiles (user_id, doctor_id)
  values (v_general_uid, v_general_doctor)
  on conflict (user_id) do update set doctor_id = excluded.doctor_id;

  insert into public.doctor_profiles (user_id, doctor_id)
  values (v_emergency_uid, v_emergency_doctor)
  on conflict (user_id) do update set doctor_id = excluded.doctor_id;
end;
$$;

-- Verification: expect exactly two rows, one per department.
select
  dp.user_id,
  d.display_name,
  d.department_key
from public.doctor_profiles dp
join public.doctors d on d.id = dp.doctor_id
order by d.department_key;

commit;
