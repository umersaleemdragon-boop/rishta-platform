-- ============================================================================
-- LOCAL DEVELOPMENT SEED (runs on `supabase db reset`, never in production).
-- Demo staff, demo payment accounts and a handful of demo profiles.
-- Phone logins for local dev use the test OTP numbers in supabase/config.toml.
-- ============================================================================

insert into auth.users (id, email, phone, phone_confirmed_at, raw_user_meta_data) values
  ('11111111-0000-0000-0000-000000000001', 'admin@bureau.test',      '923000000001', now(), '{"full_name": "Bureau Owner"}'),
  ('11111111-0000-0000-0000-000000000002', 'verifier@bureau.test',   '923000000002', now(), '{"full_name": "Verifier Staff"}'),
  ('11111111-0000-0000-0000-000000000003', 'matchmaker@bureau.test', '923000000003', now(), '{"full_name": "Matchmaker Staff"}'),
  ('11111111-0000-0000-0000-000000000004', 'accounts@bureau.test',   '923000000004', now(), '{"full_name": "Accounts Staff"}'),
  ('22222222-0000-0000-0000-000000000001', null, '923001111111', now(), '{"full_name": "Ahmed Raza"}'),
  ('22222222-0000-0000-0000-000000000002', null, '923002222222', now(), '{"full_name": "Shazia Khan (mother)"}'),
  ('22222222-0000-0000-0000-000000000003', null, '923003333333', now(), '{"full_name": "Usman Tariq"}'),
  ('22222222-0000-0000-0000-000000000004', null, '923004444444', now(), '{"full_name": "Ayesha Malik"}')
on conflict do nothing;

insert into public.staff_members (user_id, role, display_name) values
  ('11111111-0000-0000-0000-000000000001', 'super_admin', 'Bureau Owner'),
  ('11111111-0000-0000-0000-000000000002', 'verifier',    'Verifier'),
  ('11111111-0000-0000-0000-000000000003', 'matchmaker',  'Matchmaker'),
  ('11111111-0000-0000-0000-000000000004', 'accountant',  'Accounts')
on conflict do nothing;

insert into public.payment_accounts (method, account_title, account_number, bank_name, iban, instructions, sort_order) values
  ('jazzcash',      'DEMO Bureau Account', '0300-0000000', null, null, 'Send the exact plan amount, then upload the screenshot.', 1),
  ('easypaisa',     'DEMO Bureau Account', '0345-0000000', null, null, 'Send the exact plan amount, then upload the screenshot.', 2),
  ('bank_transfer', 'DEMO Bureau Account', '0000000000000', 'Demo Bank', 'PK00DEMO0000000000000000', 'Use your profile code as reference.', 3);

update public.app_settings
   set value = '{"name": "Demo Rishta Bureau", "phone": "042-0000000", "whatsapp": "0300-0000000", "address": "Lahore", "office_hours": "Mon-Sat 11am-7pm"}'
 where key = 'bureau_contact';

-- Demo profiles (inserted with service privileges, so they start active).
insert into public.profiles (id, owner_user_id, managed_by, source, status, first_name, gender, date_of_birth,
  marital_status, height_cm, sect, caste, mother_tongue, city, education_level, degree_title, profession,
  monthly_income_pkr, religiosity, father_occupation, family_type, house_ownership, house_size,
  socioeconomic_class, about, verification_level, approved_at, listing_consent)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'self', 'self_registered', 'active',
   'Ahmed', 'male', '1995-03-14', 'never_married', 178, 'sunni', 'arain', 'punjabi', 'lahore', 'masters', 'MBA',
   'Bank Manager', 250000, 'practising', 'Retired government officer', 'joint', 'owned', '10 marla', 'upper_middle',
   'Simple, family-oriented, enjoys cricket.', 'cnic', now(), true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'parent', 'self_registered', 'active',
   'Fatima', 'female', '1998-07-02', 'never_married', 163, 'sunni', 'arain', 'punjabi', 'lahore', 'masters', 'MSc Chemistry',
   'Lecturer', 90000, 'practising', 'Businessman', 'nuclear', 'owned', '1 kanal', 'upper_middle',
   'Profile managed by mother. Teaches at a private college.', 'phone', now(), true),
  ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003', 'self', 'self_registered', 'active',
   'Usman', 'male', '1993-11-20', 'divorced', 172, 'sunni', 'rajput', 'urdu', 'karachi', 'bachelors', 'BS Computer Science',
   'Software Engineer', 300000, 'moderate', 'Doctor', 'nuclear', 'owned', '240 sq yd', 'upper_middle',
   'Divorced, no children. Looking for an understanding partner.', 'phone', now(), true),
  ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000004', 'self', 'self_registered', 'pending_review',
   'Ayesha', 'female', '1997-01-25', 'never_married', 160, 'shia', 'syed', 'urdu', 'islamabad', 'bachelors', 'BBA',
   'HR Officer', 120000, 'moderate', 'Army (retd.)', 'nuclear', 'owned', '1 kanal', 'upper',
   'Waiting for bureau approval.', 'phone', null, true),
  ('aaaaaaaa-0000-0000-0000-000000000005', null, 'bureau', 'bureau_offline', 'active',
   'Zainab', 'female', '1996-05-09', 'never_married', 165, 'sunni', 'arain', 'punjabi', 'faisalabad', 'masters', 'M.Phil Urdu',
   'Teacher', 70000, 'very_religious', 'Textile business', 'joint', 'owned', '1 kanal', 'upper_middle',
   'Bureau client (imported from WhatsApp).', 'bureau', now(), true),
  ('aaaaaaaa-0000-0000-0000-000000000006', null, 'bureau', 'bureau_offline', 'active',
   'Bilal', 'male', '1991-09-30', 'never_married', 175, 'sunni', 'jatt', 'punjabi', 'lahore', 'doctorate', 'MBBS, FCPS',
   'Doctor', 400000, 'practising', 'Landlord', 'joint', 'owned', '2 kanal', 'upper',
   'Bureau client. Consent not yet recorded, so not listed.', 'bureau', now(), false)
on conflict do nothing;

update public.partner_preferences set age_min = 24, age_max = 30, education_min = 'bachelors',
       sects = '{sunni}', cities = '{lahore,islamabad}', marital_statuses = '{never_married}'
 where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.partner_preferences set age_min = 27, age_max = 34, education_min = 'masters',
       sects = '{sunni}', sect_is_must = true, cities = '{lahore}', socioeconomic_min = 'middle'
 where profile_id = 'aaaaaaaa-0000-0000-0000-000000000002';

insert into public.profile_private (profile_id, last_name, contact_phone, whatsapp_number) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Raza',  '03001111111', '03001111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Khan',  '03002222222', '03002222222'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Ahmad', '03005555555', null)
on conflict (profile_id) do update set last_name = excluded.last_name, contact_phone = excluded.contact_phone,
                                       whatsapp_number = excluded.whatsapp_number;

-- Ahmed has Basic for 90 days.
insert into public.subscriptions (profile_id, plan_id, starts_at, ends_at, note)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'basic', now(), now() + interval '90 days', 'demo seed');
