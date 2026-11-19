-- ============================================================================
-- 0900 STORAGE BUCKETS (all PRIVATE), REALTIME, NIGHTLY JOB
-- File paths always start with the profile id: "<profile_id>/<file>".
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('profile-photos',    'profile-photos',    false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('payment-receipts',  'payment-receipts',  false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- profile-photos: owner/guardians/staff can see their own originals; owner uploads.
-- Everyone else gets 60-second signed URLs from the photo-urls Edge Function.
create policy "photos: members read" on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos'
         and private.can_view_own_profile(private.try_uuid((storage.foldername(name))[1])));
create policy "photos: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos'
              and private.can_manage_profile(private.try_uuid((storage.foldername(name))[1])));
create policy "photos: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos'
         and (private.can_manage_profile(private.try_uuid((storage.foldername(name))[1]))
              or private.has_staff_role(array['verifier']::public.staff_role[])));

-- verification-docs (CNIC + selfie): owner can upload, ONLY verifiers can read.
create policy "cnic: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs'
              and private.can_manage_profile(private.try_uuid((storage.foldername(name))[1])));
create policy "cnic: verifier read" on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs'
         and private.has_staff_role(array['verifier']::public.staff_role[]));
create policy "cnic: verifier delete" on storage.objects for delete to authenticated
  using (bucket_id = 'verification-docs'
         and private.has_staff_role(array['verifier']::public.staff_role[]));

-- payment-receipts: owner uploads & reads own, accountants read all.
create policy "receipts: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-receipts'
              and private.can_manage_profile(private.try_uuid((storage.foldername(name))[1])));
create policy "receipts: owner or accountant read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-receipts'
         and (private.is_profile_member(private.try_uuid((storage.foldername(name))[1]))
              or private.has_staff_role(array['accountant']::public.staff_role[])));

-- ------------------------------------------------------------- realtime ----
-- Realtime respects RLS, so users only receive rows they are allowed to read.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'conversations', 'interests', 'photo_access',
                             'contact_shares', 'meetings', 'notifications', 'bureau_suggestions'] loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------- nightly maintenance ----
-- Enable "pg_cron" in Supabase Dashboard -> Database -> Extensions first; this
-- block then schedules the job (02:15 Pakistan time = 21:15 UTC). Skipped if
-- pg_cron is not available (e.g. local tests).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rishta-daily-maintenance', '15 21 * * *', 'select public.run_daily_maintenance()');
  end if;
end $$;

-- --------------------------------------------------------- lookup lists ----
insert into public.lookups (category, value, label_en, label_ur, sort_order) values
  ('city', 'lahore', 'Lahore', 'لاہور', 1), ('city', 'karachi', 'Karachi', 'کراچی', 2),
  ('city', 'islamabad', 'Islamabad', 'اسلام آباد', 3), ('city', 'rawalpindi', 'Rawalpindi', 'راولپنڈی', 4),
  ('city', 'faisalabad', 'Faisalabad', 'فیصل آباد', 5), ('city', 'multan', 'Multan', 'ملتان', 6),
  ('city', 'peshawar', 'Peshawar', 'پشاور', 7), ('city', 'quetta', 'Quetta', 'کوئٹہ', 8),
  ('city', 'gujranwala', 'Gujranwala', 'گوجرانوالہ', 9), ('city', 'sialkot', 'Sialkot', 'سیالکوٹ', 10),
  ('city', 'hyderabad', 'Hyderabad', 'حیدرآباد', 11), ('city', 'sargodha', 'Sargodha', 'سرگودھا', 12),
  ('city', 'bahawalpur', 'Bahawalpur', 'بہاولپور', 13), ('city', 'sahiwal', 'Sahiwal', 'ساہیوال', 14),
  ('city', 'abbottabad', 'Abbottabad', 'ایبٹ آباد', 15), ('city', 'gujrat', 'Gujrat', 'گجرات', 16),
  ('city', 'sheikhupura', 'Sheikhupura', 'شیخوپورہ', 17), ('city', 'jhelum', 'Jhelum', 'جہلم', 18),
  ('city', 'mardan', 'Mardan', 'مردان', 19), ('city', 'sukkur', 'Sukkur', 'سکھر', 20),
  ('city', 'other', 'Other', 'دیگر', 999),

  ('country', 'pakistan', 'Pakistan', 'پاکستان', 1), ('country', 'uae', 'UAE', 'متحدہ عرب امارات', 2),
  ('country', 'saudi_arabia', 'Saudi Arabia', 'سعودی عرب', 3), ('country', 'uk', 'United Kingdom', 'برطانیہ', 4),
  ('country', 'usa', 'USA', 'امریکہ', 5), ('country', 'canada', 'Canada', 'کینیڈا', 6),
  ('country', 'australia', 'Australia', 'آسٹریلیا', 7), ('country', 'qatar', 'Qatar', 'قطر', 8),
  ('country', 'other', 'Other', 'دیگر', 999),

  ('sect', 'sunni', 'Sunni', 'سنی', 1), ('sect', 'sunni_barelvi', 'Sunni (Barelvi)', 'سنی (بریلوی)', 2),
  ('sect', 'sunni_deobandi', 'Sunni (Deobandi)', 'سنی (دیوبندی)', 3), ('sect', 'ahl_e_hadith', 'Ahl-e-Hadith', 'اہلِ حدیث', 4),
  ('sect', 'shia', 'Shia', 'شیعہ', 5), ('sect', 'other', 'Other', 'دیگر', 999),

  ('caste', 'arain', 'Arain', 'آرائیں', 1), ('caste', 'awan', 'Awan', 'اعوان', 2), ('caste', 'baloch', 'Baloch', 'بلوچ', 3),
  ('caste', 'butt', 'Butt / Kashmiri', 'بٹ / کشمیری', 4), ('caste', 'gujjar', 'Gujjar', 'گجر', 5),
  ('caste', 'jatt', 'Jatt', 'جٹ', 6), ('caste', 'malik', 'Malik', 'ملک', 7), ('caste', 'mughal', 'Mughal', 'مغل', 8),
  ('caste', 'pathan', 'Pathan', 'پٹھان', 9), ('caste', 'qureshi', 'Qureshi', 'قریشی', 10),
  ('caste', 'rajput', 'Rajput', 'راجپوت', 11), ('caste', 'sheikh', 'Sheikh', 'شیخ', 12),
  ('caste', 'syed', 'Syed', 'سید', 13), ('caste', 'ansari', 'Ansari', 'انصاری', 14),
  ('caste', 'chaudhry', 'Chaudhry', 'چوہدری', 15), ('caste', 'other', 'Other', 'دیگر', 999),

  ('mother_tongue', 'urdu', 'Urdu', 'اردو', 1), ('mother_tongue', 'punjabi', 'Punjabi', 'پنجابی', 2),
  ('mother_tongue', 'sindhi', 'Sindhi', 'سندھی', 3), ('mother_tongue', 'pashto', 'Pashto', 'پشتو', 4),
  ('mother_tongue', 'saraiki', 'Saraiki', 'سرائیکی', 5), ('mother_tongue', 'balochi', 'Balochi', 'بلوچی', 6),
  ('mother_tongue', 'hindko', 'Hindko', 'ہندکو', 7), ('mother_tongue', 'kashmiri', 'Kashmiri', 'کشمیری', 8),
  ('mother_tongue', 'english', 'English', 'انگریزی', 9), ('mother_tongue', 'other', 'Other', 'دیگر', 999)
on conflict do nothing;
