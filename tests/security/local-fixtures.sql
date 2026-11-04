-- Local doctor_profiles mappings for the disposable test cluster.
--
-- These mirror what the owner applies on the hosted project during M1-S8: a Supabase
-- Auth user mapped to one seeded doctor row. The SQL suites assume the mappings already
-- exist; nothing here is a policy change and this file never runs against production.

insert into public.doctor_profiles (user_id, doctor_id)
select u.id, d.id
from (values
  ('doctor-gm@rls.test', 'general_medicine'),
  ('doctor-em@rls.test', 'emergency'),
  ('doctor-or@rls.test', 'orthopedics'),
  ('doctor-de@rls.test', 'dermatology')
) as m (email, department_key)
join auth.users u on u.email = m.email
join public.doctors d on d.department_key = m.department_key
on conflict (user_id) do update set doctor_id = excluded.doctor_id;
