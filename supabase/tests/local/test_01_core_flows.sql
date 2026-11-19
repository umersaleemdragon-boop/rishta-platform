-- ============================================================================
-- End-to-end tests of the database rules, run as real "authenticated" users
-- (RLS active). Everything runs in one transaction and is rolled back.
-- ============================================================================
\set ON_ERROR_STOP 1
begin;

create schema test;
grant usage on schema test to anon, authenticated;
create table test.ids (name text primary key, id uuid not null);
grant all on test.ids to anon, authenticated;

create function test.id(p text) returns uuid language sql stable as $$ select id from test.ids where name = p $$;
create function test.save(p text, v uuid) returns uuid language sql as $$
  insert into test.ids values (p, v) on conflict (name) do update set id = excluded.id returning id $$;
create function test.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function test.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create function test.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- Runs p_sql and asserts it fails with an error containing p_expected.
create function test.throws(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then
      raise exception 'expected error "%" but got "%" for: %', p_expected, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'expected error "%" but statement succeeded: %', p_expected, p_sql;
end $$;
grant execute on all functions in schema test to anon, authenticated;

-- ------------------------------------------------------------------ setup ----
insert into auth.users (id, phone, phone_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', '920000000001', now(), '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a2', '920000000002', now(), '{"full_name":"Verifier"}'),
  ('00000000-0000-0000-0000-0000000000a3', '920000000003', now(), '{"full_name":"Matchmaker"}'),
  ('00000000-0000-0000-0000-0000000000a4', '920000000004', now(), '{"full_name":"Accountant"}'),
  ('00000000-0000-0000-0000-0000000000b1', '920000000011', now(), '{"full_name":"Ali"}'),
  ('00000000-0000-0000-0000-0000000000b2', '920000000012', now(), '{"full_name":"Sara"}'),
  ('00000000-0000-0000-0000-0000000000b3', '920000000013', now(), '{"full_name":"Sara Mother"}'),
  ('00000000-0000-0000-0000-0000000000b4', '920000000014', now(), '{"full_name":"Hina"}'),
  ('00000000-0000-0000-0000-0000000000b5', '920000000015', now(), '{"full_name":"Kamran"}'),
  ('00000000-0000-0000-0000-0000000000b9', '920000000019', null,  '{"full_name":"Stranger"}');
insert into public.staff_members (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'super_admin', 'Admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'verifier',    'Verifier'),
  ('00000000-0000-0000-0000-0000000000a3', 'matchmaker',  'Matchmaker'),
  ('00000000-0000-0000-0000-0000000000a4', 'accountant',  'Accountant');
select test.save('admin',  '00000000-0000-0000-0000-0000000000a1'), test.save('verifier', '00000000-0000-0000-0000-0000000000a2'),
       test.save('mm',     '00000000-0000-0000-0000-0000000000a3'), test.save('acct',     '00000000-0000-0000-0000-0000000000a4'),
       test.save('u_ali',  '00000000-0000-0000-0000-0000000000b1'), test.save('u_sara',   '00000000-0000-0000-0000-0000000000b2'),
       test.save('u_mom',  '00000000-0000-0000-0000-0000000000b3'), test.save('u_hina',   '00000000-0000-0000-0000-0000000000b4'),
       test.save('u_kamran','00000000-0000-0000-0000-0000000000b5'), test.save('u_stranger','00000000-0000-0000-0000-0000000000b9');

do $$ begin
  assert (select count(*) from public.app_users where id = test.id('u_ali')) = 1, 'auth trigger creates app_users row';
end $$;

-- ===================================================== 1. profile creation ===
do $$
declare v_id uuid; v public.profiles;
begin
  perform test.login(test.id('u_ali'));
  insert into public.profiles (owner_user_id, first_name, gender, date_of_birth, status, verification_level, is_featured)
  values (auth.uid(), 'Ali', 'male', '1994-04-10', 'active', 'bureau', true)
  returning id into v_id;
  perform test.save('ali', v_id);
  select * into v from public.profiles where id = v_id;
  assert v.status = 'draft', 'users cannot self-activate';
  assert v.verification_level = 'none', 'users cannot self-verify';
  assert not v.is_featured, 'users cannot self-feature';
  assert v.listing_consent, 'self-registered = consent';
  assert v.public_code like 'RB-%', 'public code generated';
  assert exists (select 1 from public.profile_private where profile_id = v_id), 'private row auto-created';
  assert exists (select 1 from public.partner_preferences where profile_id = v_id), 'prefs row auto-created';

  perform test.throws($q$ update public.profiles set status = 'pending_review' where id = test.id('ali') $q$, 'profile_incomplete');
  update public.profiles set city = 'lahore', education_level = 'masters', height_cm = 175, sect = 'sunni',
         caste = 'arain', socioeconomic_class = 'upper_middle', religiosity = 'practising', mother_tongue = 'punjabi'
   where id = v_id;
  update public.profiles set status = 'pending_review' where id = v_id;
  perform test.throws($q$ update public.profiles set is_featured = true where id = test.id('ali') $q$, 'field_locked');
  perform test.throws($q$ update public.profiles set status = 'active' where id = test.id('ali') $q$, 'invalid_status_change');
  perform test.throws($q$ insert into public.profiles (owner_user_id, first_name, gender, date_of_birth)
                         values (auth.uid(), 'Kid', 'male', current_date - interval '15 years') $q$, 'must_be_18_or_older');
  perform test.throws($q$ insert into public.profiles (owner_user_id, first_name, gender, date_of_birth)
                         values (test.id('u_sara'), 'Fake', 'female', '1990-01-01') $q$, 'not_authorized');
  perform test.throws($q$ update public.profiles set about = 'Call me on 0301 1234567' where id = test.id('ali') $q$, 'contact_info_in_profile');
  perform test.throws($q$ update public.partner_preferences set notes = 'email ali@example.com' where profile_id = test.id('ali') $q$, 'contact_info_in_profile');
  update public.profiles set about = 'Software engineer, 2 brothers, living in DHA phase 5.' where id = v_id;
  update public.profile_private set contact_phone = '03011234567', whatsapp_number = '03011234567' where profile_id = v_id;
  update public.partner_preferences set age_min = 22, age_max = 30, sects = '{sunni}', cities = '{lahore}' where profile_id = v_id;
  perform test.logout();
end $$;

-- Sara (profile managed by her mother's guardian login later), Hina, Kamran
do $$
declare v_id uuid;
begin
  perform test.login(test.id('u_sara'));
  insert into public.profiles (owner_user_id, managed_by, first_name, gender, date_of_birth, city, education_level, height_cm,
                               sect, caste, socioeconomic_class, religiosity, mother_tongue)
  values (auth.uid(), 'self', 'Sara', 'female', '1998-02-01', 'lahore', 'masters', 162, 'sunni', 'arain', 'upper_middle', 'practising', 'punjabi')
  returning id into v_id;
  perform test.save('sara', v_id);
  update public.profiles set status = 'pending_review' where id = v_id;
  update public.profile_private set contact_phone = '03027654321', whatsapp_number = '03027654321' where profile_id = v_id;
  update public.partner_preferences set age_min = 26, age_max = 34, sects = '{sunni}', sect_is_must = true where profile_id = v_id;
  -- guardian (wali) linking only via invite code
  perform test.throws(format('insert into public.profile_guardians (profile_id, user_id, relation) values (%L, %L, %L)',
                             v_id, test.id('u_stranger'), 'other'), 'row-level security');
  perform test.save('invite_' || (public.create_guardian_invite(v_id, 'mother') ->> 'code'), v_id);
  perform test.throws($q$ select public.redeem_guardian_invite((select substr(name, 8) from test.ids where name like 'invite_%')) $q$, 'invalid_invite');
  perform test.login(test.id('u_stranger'));
  perform test.throws(format('select public.create_guardian_invite(%L, %L)', v_id, 'other'), 'not_authorized');
  perform test.throws($q$ select public.redeem_guardian_invite('WRONGCODE') $q$, 'invalid_invite');
  perform test.login(test.id('u_mom'));
  assert public.redeem_guardian_invite(lower((select substr(name, 8) from test.ids where name like 'invite_%'))) = v_id, 'mother redeems';
  assert (select relation from public.list_my_guarded_profiles()) = 'mother', 'guardian sees ward';
  perform test.login(test.id('u_stranger'));
  perform test.throws($q$ select public.redeem_guardian_invite((select substr(name, 8) from test.ids where name like 'invite_%')) $q$, 'invalid_invite');
  perform test.login(test.id('u_sara'));

  perform test.login(test.id('u_hina'));
  insert into public.profiles (owner_user_id, first_name, gender, date_of_birth, city, education_level, height_cm, sect)
  values (auth.uid(), 'Hina', 'female', '1996-06-06', 'karachi', 'bachelors', 158, 'sunni') returning id into v_id;
  perform test.save('hina', v_id);
  update public.profiles set status = 'pending_review' where id = v_id;

  perform test.login(test.id('u_kamran'));
  insert into public.profiles (owner_user_id, first_name, gender, date_of_birth, city, education_level, height_cm, sect)
  values (auth.uid(), 'Kamran', 'male', '1990-06-06', 'karachi', 'bachelors', 170, 'shia') returning id into v_id;
  perform test.save('kamran', v_id);
  update public.profiles set status = 'pending_review' where id = v_id;
  perform test.logout();
end $$;

-- ======================================================== 2. privacy (RLS) ===
do $$ begin
  perform test.login(test.id('u_sara'));
  assert (select count(*) from public.profiles where id = test.id('ali')) = 0, 'cannot read other profiles directly';
  assert (select count(*) from public.profile_private where profile_id = test.id('ali')) = 0, 'cannot read others private data';
  assert (select count(*) from public.profiles) = 1, 'sees only own profile';
  perform test.login(test.id('u_mom'));
  assert (select count(*) from public.profiles where id = test.id('sara')) = 1, 'guardian can read ward profile';
  update public.profiles set about = 'x' where id = test.id('sara');   -- silently matches 0 rows (RLS)
  assert (select about from public.profiles where id = test.id('sara')) is null, 'guardian cannot edit';
  perform test.as_anon();
  perform test.throws($q$ select * from public.profiles $q$, 'permission denied');
  assert (select count(*) from public.plans) = 3, 'anon can read plans';
  perform test.throws($q$ select public.search_profiles(test.id('ali')) $q$, 'permission denied');
  perform test.logout();
end $$;

-- ================================================ 3. staff approval flow ===
do $$ begin
  perform test.login(test.id('u_ali'));
  perform test.throws($q$ select public.admin_review_profile(test.id('ali'), true) $q$, 'not_authorized');
  perform test.login(test.id('acct'));
  perform test.throws($q$ select public.admin_review_profile(test.id('ali'), true) $q$, 'not_authorized');
  perform test.login(test.id('verifier'));
  perform public.admin_review_profile(test.id('ali'), true);
  perform public.admin_review_profile(test.id('sara'), true);
  perform public.admin_review_profile(test.id('hina'), true);
  perform public.admin_review_profile(test.id('kamran'), false, 'Please add your education details');
  assert (select status from public.profiles where id = test.id('ali')) = 'active', 'approved';
  assert (select verification_level from public.profiles where id = test.id('ali')) = 'phone', 'phone verified badge';
  assert (select status from public.profiles where id = test.id('kamran')) = 'draft', 'sent back';
  assert (select count(*) from public.audit_log) = 0, 'verifier cannot read audit log';
  perform test.logout();
  assert (select count(*) from public.audit_log where action = 'profile_approved') = 3, 'audited';
end $$;

-- ================================================== 4. search + plan gating ===
do $$
declare r record; n int;
begin
  perform test.login(test.id('u_ali'));
  select * into r from public.search_profiles(test.id('ali')) where profile_id = test.id('sara');
  assert r.profile_id is not null, 'free user sees Sara in previews';
  assert r.is_limited_preview and r.first_name is null and r.profession is null, 'free tier = limited preview';
  assert r.match_score between 1 and 100, 'score computed';
  assert not exists (select 1 from public.search_profiles(test.id('ali')) where profile_id = test.id('kamran')), 'no same gender / non-active';
  perform test.throws($q$ select public.get_profile_detail(test.id('ali'), test.id('sara')) $q$, 'upgrade_required');
  perform test.throws($q$ select public.send_interest(test.id('ali'), test.id('sara')) $q$, 'upgrade_required');
  perform test.throws($q$ select public.search_profiles(test.id('sara')) $q$, 'not_authorized');

  -- Hina's sect preference is not a "must", Sara's is: Kamran (shia) would be excluded for Sara
  perform test.login(test.id('acct'));
  perform public.admin_record_payment(test.id('ali'), 'basic', 'cash', 4000, null, 'paid at office');
  perform test.login(test.id('u_ali'));
  select * into r from public.search_profiles(test.id('ali')) where profile_id = test.id('sara');
  assert not r.is_limited_preview and r.first_name = 'Sara', 'basic sees full card';
  assert (public.my_entitlements(test.id('ali')) ->> 'tier') = 'basic', 'entitlement = basic';
  assert (public.get_profile_detail(test.id('ali'), test.id('sara')) ->> 'first_name') = 'Sara', 'basic sees detail';
  assert (public.get_profile_detail(test.id('ali'), test.id('sara')) ? 'last_name') = false, 'no last name in detail';
  perform test.logout();
end $$;

-- ============================================================ 5. interests ===
do $$
declare v_int uuid; v_conv uuid;
begin
  perform test.login(test.id('u_sara'));
  perform test.throws($q$ select public.send_interest(test.id('sara'), test.id('ali')) $q$, 'upgrade_required');

  perform test.login(test.id('u_ali'));
  perform test.throws($q$ select public.send_interest(test.id('ali'), test.id('sara'), 'call me 0300 1234567') $q$, 'contact_info_not_allowed');
  perform test.throws($q$ select public.send_interest(test.id('ali'), test.id('sara'), 'mail ali@example.com') $q$, 'contact_info_not_allowed');
  perform test.throws($q$ select public.send_interest(test.id('ali'), test.id('kamran')) $q$, 'not_found');
  v_int := public.send_interest(test.id('ali'), test.id('sara'), 'Assalam o Alaikum, our families may be a good match.');
  perform test.save('int_ali_sara', v_int);
  perform test.throws($q$ select public.send_interest(test.id('ali'), test.id('sara')) $q$, 'interest_already_exists');
  perform test.throws($q$ insert into public.interests (sender_profile_id, receiver_profile_id) values (test.id('ali'), test.id('hina')) $q$, 'permission denied');

  -- Sara is FREE but may view Ali (he contacted her) and accept.
  perform test.login(test.id('u_sara'));
  assert (public.get_profile_detail(test.id('sara'), test.id('ali')) ->> 'first_name') = 'Ali', 'free user can view whoever sent interest';
  assert exists (select 1 from public.notifications where type = 'interest_received'), 'Sara notified';
  assert exists (select 1 from public.list_interests(test.id('sara'), 'received')), 'received inbox';
  perform test.login(test.id('u_mom'));
  assert exists (select 1 from public.notifications where type = 'interest_received'), 'guardian notified too';
  perform test.throws(format('select public.respond_interest(%L, true)', v_int), 'not_authorized');
  perform test.login(test.id('u_sara'));
  v_conv := public.respond_interest(v_int, true);
  perform test.save('conv', v_conv);
  assert v_conv is not null, 'conversation created';
  perform test.login(test.id('u_ali'));
  assert exists (select 1 from public.notifications where type = 'interest_accepted'), 'Ali notified of acceptance';
  assert not exists (select 1 from public.notifications where user_id is distinct from auth.uid()), 'Ali sees only his own notifications';
  perform test.logout();
end $$;

-- ================================================================= 6. chat ===
do $$ begin
  perform test.login(test.id('u_sara'));   -- free, but Ali is paid -> chat allowed
  perform public.send_message(test.id('conv'), test.id('sara'), 'Walaikum Assalam! Tell me about your family.');
  perform test.throws($q$ select public.send_message(test.id('conv'), test.id('sara'), 'my number 0 3 0 0 - 1 2 3 4 5 6 7') $q$, 'contact_info_not_allowed');
  perform test.throws($q$ select public.send_message(test.id('conv'), test.id('sara'), 'add me on whatsapp') $q$, 'contact_info_not_allowed');
  perform test.throws($q$ select public.send_message(test.id('conv'), test.id('sara'), 'number: ۰۳۰۰۱۲۳۴۵۶۷') $q$, 'contact_info_not_allowed');
  perform test.throws($q$ select public.send_message(test.id('conv'), test.id('ali'), 'spoof') $q$, 'not_authorized');

  perform test.login(test.id('u_ali'));
  perform public.send_message(test.id('conv'), test.id('ali'), 'We are a family of five from Lahore.');
  assert (select count(*) from public.messages where conversation_id = test.id('conv')) = 3, 'participants read chat (incl. system msg)';
  assert (select unread_count from public.list_conversations(test.id('ali'))) = 0, 'own messages not unread';

  perform test.login(test.id('u_mom'));
  assert (select count(*) from public.messages where conversation_id = test.id('conv')) = 3, 'guardian can read chat';
  perform test.throws($q$ select public.send_message(test.id('conv'), test.id('sara'), 'hello from mother') $q$, 'not_authorized');

  perform test.login(test.id('u_stranger'));
  assert (select count(*) from public.messages) = 0, 'stranger sees no messages';
  assert (select count(*) from public.conversations) = 0, 'stranger sees no conversations';
  perform test.login(test.id('verifier'));
  assert (select count(*) from public.messages) = 0, 'non-admin staff cannot read private chats';
  perform test.login(test.id('admin'));
  assert (select count(*) from public.messages) = 3, 'super admin can review chats (for reports)';
  perform test.logout();
end $$;

-- ======================================================== 7. photo privacy ===
do $$
declare v_req uuid; v_photo uuid;
begin
  perform test.login(test.id('u_sara'));
  insert into public.profile_photos (profile_id, storage_path, status) values (test.id('sara'), test.id('sara') || '/p1.jpg', 'approved')
  returning id into v_photo;
  assert (select status from public.profile_photos where id = v_photo) = 'pending', 'user cannot self-approve photo';
  insert into storage.objects (bucket_id, name) values ('profile-photos', test.id('sara') || '/p1.jpg');
  perform test.throws($q$ insert into storage.objects (bucket_id, name) values ('profile-photos', test.id('ali') || '/hack.jpg') $q$, 'row-level security');

  perform test.login(test.id('u_ali'));
  assert (select count(*) from public.profile_photos where profile_id = test.id('sara')) = 0, 'photo rows hidden';
  assert (select count(*) from storage.objects where bucket_id = 'profile-photos') = 0, 'photo files hidden';
  perform test.throws($q$ select * from public.get_photo_paths(test.id('sara'), test.id('ali')) $q$, 'photo_access_required');
  v_req := public.request_photo_access(test.id('conv'), test.id('ali'));
  perform test.throws($q$ select public.request_photo_access(test.id('conv'), test.id('ali')) $q$, 'already_requested');
  perform test.throws(format('select public.respond_photo_request(%L, true)', v_req), 'not_authorized');

  perform test.login(test.id('verifier'));
  perform public.admin_review_photo(v_photo, true);

  perform test.login(test.id('u_sara'));
  perform public.respond_photo_request(v_req, true);
  perform test.login(test.id('u_ali'));
  assert (select count(*) from public.get_photo_paths(test.id('sara'), test.id('ali'))) = 1, 'approved -> can see photo';
  assert (select i_can_see_their_photos from public.list_conversations(test.id('ali'))), 'inbox shows access';

  perform test.login(test.id('u_sara'));
  perform public.revoke_photo_access(test.id('sara'), test.id('ali'));
  perform test.login(test.id('u_ali'));
  perform test.throws($q$ select * from public.get_photo_paths(test.id('sara'), test.id('ali')) $q$, 'photo_access_required');
  -- Sara re-shares voluntarily
  perform test.login(test.id('u_sara'));
  perform public.share_photos(test.id('conv'), test.id('sara'));
  perform test.login(test.id('u_ali'));
  assert (select count(*) from public.get_photo_paths(test.id('sara'), test.id('ali'))) = 1, 're-shared';
  perform test.logout();
end $$;

-- ==================================================== 8. payments flow ===
do $$
declare v_pay uuid; v_pay2 uuid;
begin
  perform test.login(test.id('u_ali'));
  perform test.throws($q$ select public.request_contact(test.id('conv'), test.id('ali')) $q$, 'upgrade_required');
  perform test.throws($q$ insert into public.payments (profile_id, plan_id, amount_pkr, method, transaction_ref)
                         values (test.id('ali'), 'premium', 1, 'jazzcash', 'X') $q$, 'permission denied');
  perform test.throws($q$ select public.submit_payment(test.id('ali'), 'premium', 'jazzcash', 'TID-1', test.id('sara') || '/r.jpg') $q$, 'invalid_input');
  v_pay := public.submit_payment(test.id('ali'), 'premium', 'jazzcash', '0123 4567 89', test.id('ali') || '/receipt1.jpg', 'sha-abc');
  assert (select amount_pkr from public.payments where id = v_pay) = 8500, 'amount comes from plan, not user';
  perform test.throws($q$ select public.submit_payment(test.id('ali'), 'premium', 'jazzcash', '0123456789', test.id('ali') || '/receipt2.jpg') $q$, 'duplicate_transaction');
  perform test.throws($q$ select public.submit_payment(test.id('ali'), 'premium', 'easypaisa', 'OTHER-1', test.id('ali') || '/receipt3.jpg', 'sha-abc') $q$, 'duplicate_transaction');

  perform test.login(test.id('verifier'));
  perform test.throws(format('select public.approve_payment(%L)', v_pay), 'not_authorized');
  assert (select count(*) from public.payments) = 0, 'verifier cannot see payments';
  perform test.login(test.id('acct'));
  assert (select count(*) from public.payments where status = 'pending') = 1, 'accountant sees pending payment';
  perform public.approve_payment(v_pay);
  perform test.throws(format('select public.approve_payment(%L)', v_pay), 'invalid_state');
  assert (public.admin_dashboard_stats() ->> 'revenue_this_month_pkr')::int = 12500, 'revenue = 4000 cash + 8500';

  perform test.login(test.id('u_ali'));
  assert (public.my_entitlements(test.id('ali')) ->> 'tier') = 'premium', 'now premium';
  assert exists (select 1 from public.notifications where type = 'payment_approved'), 'payment notification';

  -- rejected receipts can be resubmitted with the same TID
  perform test.login(test.id('u_hina'));
  v_pay2 := public.submit_payment(test.id('hina'), 'basic', 'easypaisa', 'EP-999', test.id('hina') || '/r.jpg');
  perform test.login(test.id('acct'));
  perform public.reject_payment(v_pay2, 'Amount not received');
  perform test.login(test.id('u_hina'));
  perform public.submit_payment(test.id('hina'), 'basic', 'easypaisa', 'EP-999', test.id('hina') || '/r2.jpg');
  perform test.logout();
end $$;

-- ================================================== 9. contact sharing ===
do $$
declare v_req uuid; v jsonb;
begin
  perform test.login(test.id('u_ali'));
  perform test.throws($q$ select public.get_contact_details(test.id('ali'), test.id('sara')) $q$, 'contact_not_shared');
  v_req := public.request_contact(test.id('conv'), test.id('ali'));
  perform test.login(test.id('u_sara'));
  perform public.respond_contact_request(v_req, true);
  perform test.login(test.id('u_ali'));
  v := public.get_contact_details(test.id('ali'), test.id('sara'));
  assert v ->> 'whatsapp' = '03027654321', 'premium + approved -> contact revealed';
  perform test.login(test.id('u_sara'));   -- Sara is free: cannot unlock Ali's number
  perform test.throws($q$ select public.get_contact_details(test.id('sara'), test.id('ali')) $q$, 'upgrade_required');
  perform test.logout();
  assert exists (select 1 from public.audit_log where action = 'contact_revealed'), 'contact reveal audited';
end $$;

-- ============================================== 10. meetings + rishta ===
do $$
declare v_m uuid;
begin
  perform test.login(test.id('u_ali'));
  perform test.throws($q$ select public.propose_meeting(test.id('conv'), test.id('ali'), 'video_call', now() - interval '1 day') $q$, 'invalid_input');
  v_m := public.propose_meeting(test.id('conv'), test.id('ali'), 'in_person_family', now() + interval '3 days', 'Family restaurant, Gulberg', null, 'Both families');
  perform test.throws(format('select public.respond_meeting(%L, test.id(''ali''), true)', v_m), 'invalid_state');
  perform test.login(test.id('u_sara'));
  perform public.respond_meeting(v_m, test.id('sara'), true);
  assert (select status from public.meetings where id = v_m) = 'scheduled', 'scheduled';
  perform public.complete_meeting(v_m, test.id('sara'), 'Went well');

  assert public.confirm_rishta(test.id('conv'), test.id('sara')) = 'meeting_planned', 'one side only -> pending';
  perform test.login(test.id('u_ali'));
  assert public.confirm_rishta(test.id('conv'), test.id('ali')) = 'rishta_confirmed', 'both sides -> confirmed';
  assert (select status from public.profiles where id = test.id('ali')) = 'matched', 'Ali hidden from search';
  perform public.update_connection_stage(test.id('conv'), test.id('ali'), 'engaged');
  perform test.throws($q$ select public.update_connection_stage(test.id('conv'), test.id('ali'), 'chatting') $q$, 'invalid_state');
  perform test.logout();
end $$;

-- ===================================================== 11. block + report ===
do $$
declare v_int uuid; v_conv uuid;
begin
  -- Kamran fixes his profile and gets approved + Basic
  perform test.login(test.id('u_kamran'));
  update public.profiles set education_level = 'masters', status = 'pending_review' where id = test.id('kamran');
  perform test.login(test.id('verifier'));
  perform public.admin_review_profile(test.id('kamran'), true);
  perform test.login(test.id('acct'));
  perform public.admin_grant_subscription(test.id('kamran'), 'basic', 30, 'launch offer');

  perform test.login(test.id('u_kamran'));
  -- Sara's sect is a MUST (sunni) and Kamran is shia -> excluded both ways
  assert not exists (select 1 from public.search_profiles(test.id('kamran')) where profile_id = test.id('sara')), 'sect dealbreaker';
  v_int := public.send_interest(test.id('kamran'), test.id('hina'));
  perform test.login(test.id('u_hina'));
  v_conv := public.respond_interest(v_int, true);
  perform test.save('conv_kh', v_conv);
  -- Hina has no paid plan (her payment is still pending): she can chat back but not request photos
  perform public.send_message(v_conv, test.id('hina'), 'Hello');
  perform test.throws($q$ select public.request_photo_access(test.id('conv_kh'), test.id('hina')) $q$, 'upgrade_required');
  perform test.logout();
end $$;

do $$
declare v_conv uuid := test.id('conv_kh'); v_rep uuid;
begin
  perform test.login(test.id('u_kamran'));
  perform public.share_photos(v_conv, test.id('kamran'));
  perform test.login(test.id('u_hina'));
  perform public.block_profile(test.id('hina'), test.id('kamran'));
  v_rep := public.report_profile(test.id('hina'), test.id('kamran'), 'harassment', 'Rude messages', v_conv);
  assert (select closed_at from public.conversations where id = v_conv) is not null, 'block closes chat';
  assert not exists (select 1 from public.photo_access where status = 'approved' and viewer_profile_id = test.id('hina')), 'block revokes photo access';
  perform test.login(test.id('u_kamran'));
  perform test.throws(format('select public.send_message(%L, test.id(''kamran''), ''hello?'')', v_conv), 'conversation_closed');
  perform test.throws($q$ select public.get_profile_detail(test.id('kamran'), test.id('hina')) $q$, 'not_found');
  perform test.throws($q$ select public.send_interest(test.id('kamran'), test.id('hina')) $q$, 'not_found');
  perform test.login(test.id('verifier'));
  perform public.admin_resolve_report(v_rep, 'actioned', 'Warned user', true);
  assert (select status from public.profiles where id = test.id('kamran')) = 'suspended', 'suspended after report';
  perform test.logout();
end $$;

-- ==================================================== 12. CNIC verification ===
do $$
declare v_r1 uuid; v_r2 uuid;
begin
  perform test.login(test.id('u_sara'));
  v_r1 := public.submit_verification(test.id('sara'), test.id('sara') || '/f.jpg', test.id('sara') || '/b.jpg', test.id('sara') || '/s.jpg');
  perform test.throws($q$ select public.submit_verification(test.id('sara'), test.id('sara') || '/f.jpg', test.id('sara') || '/b.jpg', test.id('sara') || '/s.jpg') $q$, 'already_requested');
  insert into storage.objects (bucket_id, name) values ('verification-docs', test.id('sara') || '/f.jpg');
  assert (select count(*) from storage.objects where bucket_id = 'verification-docs') = 0, 'user cannot read CNIC images back';
  perform test.throws($q$ update public.profile_private set cnic_hash = 'x' where profile_id = test.id('sara') $q$, 'field_locked');
  perform test.login(test.id('u_hina'));
  v_r2 := public.submit_verification(test.id('hina'), test.id('hina') || '/f.jpg', test.id('hina') || '/b.jpg', test.id('hina') || '/s.jpg');

  perform test.login(test.id('verifier'));
  assert (select count(*) from storage.objects where bucket_id = 'verification-docs') = 1, 'verifier reads CNIC images';
  perform test.throws(format('select public.admin_review_verification(%L, true, %L)', v_r1, '35202-123'), 'invalid_input');
  perform public.admin_review_verification(v_r1, true, '35202-1234567-1');
  assert (select verification_level from public.profiles where id = test.id('sara')) = 'cnic', 'CNIC badge';
  assert (select cnic_hash from public.profile_private where profile_id = test.id('sara')) !~ '1234567', 'CNIC stored only as hash';
  perform test.throws(format('select public.admin_review_verification(%L, true, %L)', v_r2, '3520212345671'), 'cnic_already_registered');
  perform test.logout();
end $$;

-- ================================================ 13. WhatsApp bulk import ===
do $$
declare v jsonb; v_zainab uuid;
begin
  perform test.login(test.id('u_ali'));
  perform test.throws($q$ select public.admin_import_offline_profiles('[]') $q$, 'not_authorized');
  perform test.login(test.id('mm'));
  v := public.admin_import_offline_profiles($j$[
    {"legacy_ref": "WA-001", "first_name": "Zainab", "last_name": "Ahmad", "gender": "female", "age": "27",
     "height_feet": "5", "height_inches": "4", "city": "Lahore", "sect": "sunni", "caste": "arain",
     "education_level": "masters", "degree_title": "M.Phil", "socioeconomic_class": "upper_middle",
     "religiosity": "practising", "contact_phone": "03005555555", "pref_cities": "lahore, islamabad",
     "pref_age_min": "26", "pref_age_max": "35", "listing_consent": "no", "staff_notes": "Father prefers Lahore families"},
    {"legacy_ref": "WA-002", "first_name": "Bad Row", "gender": "unknown", "age": "30"},
    {"legacy_ref": "WA-001", "first_name": "Duplicate", "gender": "female", "age": "25"}
  ]$j$);
  assert (v -> 0 ->> 'ok')::boolean, 'valid row imported: ' || v::text;
  assert not (v -> 1 ->> 'ok')::boolean, 'bad gender rejected';
  assert not (v -> 2 ->> 'ok')::boolean, 'duplicate legacy_ref rejected';
  v_zainab := (v -> 0 ->> 'profile_id')::uuid;
  perform test.save('zainab', v_zainab);
  assert (select height_cm from public.profiles where id = v_zainab) = 163, '5ft4in = 163cm';
  assert (select cities from public.partner_preferences where profile_id = v_zainab) = '{lahore,islamabad}', 'pref cities parsed';
  assert exists (select 1 from public.profile_notes where profile_id = v_zainab), 'staff note saved';

  -- not listed until consent recorded
  perform test.login(test.id('u_kamran'));
  -- (Kamran is suspended; use matchmaker view via admin_top_matches instead)
  perform test.login(test.id('mm'));
  assert not exists (select 1 from public.admin_top_matches(test.id('ali')) where profile_id = v_zainab), 'no consent -> not matchable';
  perform public.admin_record_listing_consent(v_zainab, true, 'Father agreed on phone');
  perform test.logout();
end $$;

-- ============================ 14. offline client handled by the bureau ===
do $$
declare v_man uuid; v_int uuid; v_conv uuid; v jsonb;
begin
  -- a new paying male user finds Zainab
  insert into auth.users (id, phone, phone_confirmed_at) values ('00000000-0000-0000-0000-0000000000b6', '920000000016', now());
  perform test.login('00000000-0000-0000-0000-0000000000b6');
  insert into public.profiles (owner_user_id, first_name, gender, date_of_birth, city, education_level, height_cm, sect, caste)
  values (auth.uid(), 'Imran', 'male', '1993-01-01', 'lahore', 'masters', 180, 'sunni', 'arain') returning id into v_man;
  update public.profiles set status = 'pending_review' where id = v_man;
  perform test.login(test.id('verifier'));
  perform public.admin_review_profile(v_man, true);
  perform test.login(test.id('acct'));
  perform public.admin_record_payment(v_man, 'premium', 'bank_transfer', 8500, 'IBFT-77');

  perform test.login(test.id('mm'));
  assert exists (select 1 from public.admin_top_matches(v_man) where profile_id = test.id('zainab')), 'matchmaker sees Zainab for Imran';
  perform public.admin_suggest_match(v_man, test.id('zainab'), 'Similar family background, both from Lahore');

  perform test.login('00000000-0000-0000-0000-0000000000b6');
  assert exists (select 1 from public.search_profiles(v_man) where profile_id = test.id('zainab')), 'consented offline client listed';
  assert exists (select 1 from public.bureau_suggestions where profile_id = v_man), 'suggestion visible';
  v_int := public.send_interest(v_man, test.id('zainab'));

  -- staff inbox gets it; matchmaker responds on Zainab's behalf after calling her family
  perform test.login(test.id('mm'));
  assert exists (select 1 from public.notifications where user_id is null and type = 'interest_received'), 'staff inbox';
  v_conv := public.respond_interest(v_int, true);
  perform public.send_message(v_conv, test.id('zainab'), 'The family has agreed to talk. (Bureau on behalf of Zainab)');
  perform test.login(test.id('verifier'));
  perform test.throws(format('select public.send_message(%L, test.id(''zainab''), ''x'')', v_conv), 'not_authorized');

  perform test.login(test.id('mm'));
  perform public.share_photos(v_conv, test.id('zainab'));
  perform test.save('imran', v_man);
  perform test.save('conv_iz', v_conv);
  -- staff act only for offline clients, never for app users
  perform test.throws($q$ select public.request_contact(test.id('conv_iz'), test.id('imran')) $q$, 'not_authorized');
  perform test.logout();
end $$;

do $$
declare v_man uuid := test.id('imran'); v_conv uuid := test.id('conv_iz'); v_req uuid; v jsonb;
begin
  perform test.login('00000000-0000-0000-0000-0000000000b6');
  assert (select count(*) from public.get_photo_paths(test.id('zainab'), v_man)) = 0, 'Zainab has no approved photos yet, but access is granted';
  v_req := public.request_contact(v_conv, v_man);
  perform test.login(test.id('mm'));
  perform public.respond_contact_request(v_req, true);
  perform test.login('00000000-0000-0000-0000-0000000000b6');
  v := public.get_contact_details(v_man, test.id('zainab'));
  assert (v ->> 'via_bureau')::boolean, 'offline client contact goes via bureau';
  assert v -> 'bureau' ? 'phone', 'bureau phone returned';
  perform test.logout();
end $$;

-- ============================================= 15. maintenance + stats ===
do $$
declare v jsonb;
begin
  update public.interests set created_at = now() - interval '31 days'
   where id = (select id from public.interests where status = 'pending' limit 1);
  update public.subscriptions set ends_at = now() + interval '3 days' where profile_id = test.id('kamran');
  v := public.run_daily_maintenance();
  assert (v ->> 'expiry_reminders')::int >= 1, 'expiry reminder sent: ' || v::text;
  v := public.run_daily_maintenance();
  assert (v ->> 'expiry_reminders')::int = 0, 'reminders not duplicated';

  perform test.login(test.id('u_ali'));
  perform test.throws($q$ select public.admin_dashboard_stats() $q$, 'not_authorized');
  perform test.throws($q$ select public.run_daily_maintenance() $q$, 'not_authorized');
  assert (select count(*) from public.audit_log) = 0, 'users cannot read audit log';
  perform test.login(test.id('admin'));
  v := public.admin_dashboard_stats();
  assert (v ->> 'rishtas_confirmed_total')::int = 1, 'stats: ' || v::text;
  assert (select count(*) from public.audit_log) > 10, 'audit trail recorded';
  perform test.logout();
end $$;

-- ===================================================== 16. match scoring ===
do $$
declare a public.profiles; ap public.partner_preferences; b public.profiles; bp public.partner_preferences;
begin
  select * into a from public.profiles where id = test.id('ali');
  select * into ap from public.partner_preferences where profile_id = a.id;
  select * into b from public.profiles where id = test.id('sara');
  select * into bp from public.partner_preferences where profile_id = b.id;
  assert private.match_score_one_way(a, ap, b) = 100, 'Sara fits all of Ali''s prefs: ' || private.match_score_one_way(a, ap, b);
  assert private.mutual_score(a, ap, b, bp) >= 90, 'high mutual score';
  b.sect := 'shia';
  assert private.passes_dealbreakers(ap, b), 'sect is a preference, not a must, for Ali';
  assert private.match_score_one_way(a, ap, b) = 85, 'sect mismatch costs 15 points';
  assert private.passes_dealbreakers(bp, a), 'Ali passes Sara dealbreakers';
  a.sect := 'shia';
  assert not private.passes_dealbreakers(bp, a), 'shia excluded by Sara''s must-sect';
end $$;

\echo '>>> all core flow tests passed'
rollback;
