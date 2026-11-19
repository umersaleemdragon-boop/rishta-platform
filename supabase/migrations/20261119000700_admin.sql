-- ============================================================================
-- 0700 ADMIN (bureau staff) FUNCTIONS
-- Staff roles: super_admin (everything), verifier (profiles, photos, CNIC),
-- matchmaker (suggestions, offline clients), accountant (payments, plans).
-- Every staff decision is written to audit_log.
-- ============================================================================

-- Secret pepper for hashing CNIC numbers. Lives in the non-exposed private schema.
create table private.config (key text primary key, value text not null);
insert into private.config (key, value)
values ('cnic_pepper', encode(extensions.gen_random_bytes(32), 'hex'));
revoke all on private.config from public, authenticated;

create function private.cnic_hash(p_cnic text) returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select encode(extensions.digest((select value from private.config where key = 'cnic_pepper')
                                  || regexp_replace(p_cnic, '[^0-9]', '', 'g'), 'sha256'), 'hex')
$$;

-- ============================================================ profiles ===
-- Approve a self-registered profile (-> active) or send it back with a note (-> draft).
create function public.admin_review_profile(p_profile uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.profiles;
begin
  perform private.require_staff(array['verifier']::public.staff_role[]);
  select * into v from public.profiles where id = p_profile for update;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.status <> 'pending_review' then raise exception 'invalid_state' using errcode = 'P0001'; end if;

  if p_approve then
    update public.profiles
       set status = 'active', approved_at = coalesce(approved_at, now()), approved_by = auth.uid(), review_note = null,
           verification_level = greatest(verification_level,
             case when (select phone_verified_at from public.app_users where id = v.owner_user_id) is not null
                  then 'phone'::public.verification_level else 'none'::public.verification_level end)
     where id = p_profile;
    perform private.notify_profile(p_profile, 'profile_approved');
  else
    update public.profiles set status = 'draft', review_note = p_note where id = p_profile;
    perform private.notify_profile(p_profile, 'profile_changes_requested', jsonb_build_object('note', p_note));
  end if;
  perform private.log_audit(case when p_approve then 'profile_approved' else 'profile_returned' end,
                            'profile', p_profile::text, jsonb_build_object('note', p_note));
end $$;

create function public.admin_set_profile_status(p_profile uuid, p_status public.profile_status, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old public.profile_status;
begin
  perform private.require_staff(array['verifier', 'matchmaker']::public.staff_role[]);
  select status into v_old from public.profiles where id = p_profile for update;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.profiles
     set status = p_status,
         approved_at = case when p_status = 'active' then coalesce(approved_at, now()) else approved_at end,
         approved_by = case when p_status = 'active' then coalesce(approved_by, auth.uid()) else approved_by end
   where id = p_profile;
  if p_status = 'suspended' then
    perform private.notify_profile(p_profile, 'profile_suspended', jsonb_build_object('reason', p_reason));
  end if;
  perform private.log_audit('profile_status_changed', 'profile', p_profile::text,
                            jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason));
end $$;

-- Record that an offline (WhatsApp / register) client agreed to be listed in the app.
create function public.admin_record_listing_consent(p_profile uuid, p_consent boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_staff(array['matchmaker']::public.staff_role[]);
  update public.profiles
     set listing_consent = p_consent,
         listing_consent_by = auth.uid(),
         listing_consent_at = now()
   where id = p_profile;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_audit(case when p_consent then 'listing_consent_given' else 'listing_consent_withdrawn' end,
                            'profile', p_profile::text, jsonb_build_object('note', p_note));
end $$;

create function public.admin_review_photo(p_photo uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile uuid;
begin
  perform private.require_staff(array['verifier']::public.staff_role[]);
  update public.profile_photos
     set status = case when p_approve then 'approved'::public.review_status else 'rejected'::public.review_status end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_photo
  returning profile_id into v_profile;
  if v_profile is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.notify_profile(v_profile, case when p_approve then 'photo_approved' else 'photo_rejected' end,
                                 jsonb_build_object('photo_id', p_photo));
  perform private.log_audit(case when p_approve then 'photo_approved' else 'photo_rejected' end, 'photo', p_photo::text);
end $$;

-- ======================================================== verification ===
-- The verifier types the CNIC number they read from the card. Only a salted hash
-- is stored; the same CNIC can never back two profiles (fake-profile defence).
create function public.admin_review_verification(
  p_request uuid, p_approve boolean, p_cnic_number text default null, p_note text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.verification_requests; v_hash text;
begin
  perform private.require_staff(array['verifier']::public.staff_role[]);
  select * into r from public.verification_requests where id = p_request for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;

  if p_approve then
    if r.level = 'cnic' then
      if p_cnic_number is null or length(regexp_replace(p_cnic_number, '[^0-9]', '', 'g')) <> 13 then
        raise exception 'invalid_input' using errcode = '22023', hint = 'CNIC must have 13 digits.';
      end if;
      v_hash := private.cnic_hash(p_cnic_number);
      if exists (select 1 from public.profile_private where cnic_hash = v_hash and profile_id <> r.profile_id) then
        raise exception 'cnic_already_registered' using errcode = 'P0001',
          hint = 'This CNIC is already linked to another profile. Check for a duplicate / fake account.';
      end if;
      perform set_config('app.trusted', 'on', true);
      update public.profile_private set cnic_hash = v_hash where profile_id = r.profile_id;
      perform set_config('app.trusted', 'off', true);
    end if;
    update public.profiles set verification_level = greatest(verification_level, r.level) where id = r.profile_id;
  end if;

  update public.verification_requests
     set status = case when p_approve then 'approved'::public.review_status else 'rejected'::public.review_status end,
         reviewed_by = auth.uid(), reviewed_at = now(), reviewer_note = p_note
   where id = p_request;
  perform private.notify_profile(r.profile_id, case when p_approve then 'verification_approved' else 'verification_rejected' end,
                                 jsonb_build_object('level', r.level, 'note', p_note));
  perform private.log_audit(case when p_approve then 'verification_approved' else 'verification_rejected' end,
                            'verification_request', p_request::text, jsonb_build_object('profile_id', r.profile_id, 'level', r.level));
end $$;

-- In-person / video interview done by the bureau -> "Bureau Verified" badge.
create function public.admin_mark_bureau_verified(p_profile uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_staff(array['verifier']::public.staff_role[]);
  update public.profiles set verification_level = 'bureau' where id = p_profile;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.verification_requests (profile_id, level, status, submitted_by, reviewed_by, reviewed_at, reviewer_note)
  values (p_profile, 'bureau', 'approved', auth.uid(), auth.uid(), now(), p_note);
  perform private.notify_profile(p_profile, 'verification_approved', jsonb_build_object('level', 'bureau'));
  perform private.log_audit('bureau_verified', 'profile', p_profile::text, jsonb_build_object('note', p_note));
end $$;

-- ============================================================ payments ===
create function public.approve_payment(p_payment uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.payments; v_sub uuid;
begin
  perform private.require_staff(array['accountant']::public.staff_role[]);
  select * into v from public.payments where id = p_payment for update;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.payments set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_payment;
  v_sub := private.activate_subscription(p_payment);
  perform private.notify_profile(v.profile_id, 'payment_approved', jsonb_build_object('payment_id', p_payment, 'plan', v.plan_id));
  perform private.log_audit('payment_approved', 'payment', p_payment::text,
                            jsonb_build_object('profile_id', v.profile_id, 'plan', v.plan_id, 'amount', v.amount_pkr, 'subscription_id', v_sub));
  return v_sub;
end $$;

create function public.reject_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.payments;
begin
  perform private.require_staff(array['accountant']::public.staff_role[]);
  if coalesce(trim(p_reason), '') = '' then raise exception 'invalid_input' using errcode = '22023', hint = 'Reason required.'; end if;
  select * into v from public.payments where id = p_payment for update;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.payments set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
   where id = p_payment;
  perform private.notify_profile(v.profile_id, 'payment_rejected', jsonb_build_object('payment_id', p_payment, 'reason', p_reason));
  perform private.log_audit('payment_rejected', 'payment', p_payment::text, jsonb_build_object('reason', p_reason));
end $$;

-- Cash at the office / payment received outside the app: record + activate in one step.
create function public.admin_record_payment(
  p_profile uuid, p_plan text, p_method public.payment_method, p_amount_pkr int,
  p_transaction_ref text default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pay uuid; v_sub uuid;
begin
  perform private.require_staff(array['accountant']::public.staff_role[]);
  begin
    insert into public.payments (profile_id, submitted_by, plan_id, amount_pkr, method, transaction_ref, paid_on,
                                 status, reviewed_by, reviewed_at)
    values (p_profile, auth.uid(), p_plan, p_amount_pkr, p_method, nullif(trim(p_transaction_ref), ''), current_date,
            'approved', auth.uid(), now())
    returning id into v_pay;
  exception when unique_violation then
    raise exception 'duplicate_transaction' using errcode = 'P0001';
  end;
  v_sub := private.activate_subscription(v_pay);
  perform private.notify_profile(p_profile, 'payment_approved', jsonb_build_object('payment_id', v_pay, 'plan', p_plan));
  perform private.log_audit('payment_recorded', 'payment', v_pay::text,
                            jsonb_build_object('profile_id', p_profile, 'plan', p_plan, 'amount', p_amount_pkr, 'method', p_method, 'note', p_note));
  return v_sub;
end $$;

-- Complimentary / goodwill subscription (no payment).
create function public.admin_grant_subscription(p_profile uuid, p_plan text, p_days int, p_note text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform private.require_staff(array['accountant']::public.staff_role[]);
  if p_days not between 1 and 730 or coalesce(trim(p_note), '') = '' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.subscriptions (profile_id, plan_id, starts_at, ends_at, granted_by, note)
  values (p_profile, p_plan, now(), now() + make_interval(days => p_days), auth.uid(), p_note)
  returning id into v_id;
  perform private.notify_profile(p_profile, 'plan_granted', jsonb_build_object('plan', p_plan, 'days', p_days));
  perform private.log_audit('subscription_granted', 'subscription', v_id::text,
                            jsonb_build_object('profile_id', p_profile, 'plan', p_plan, 'days', p_days, 'note', p_note));
  return v_id;
end $$;

create function public.admin_cancel_subscription(p_subscription uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_staff(array['accountant']::public.staff_role[]);
  update public.subscriptions set cancelled_at = now() where id = p_subscription and cancelled_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_audit('subscription_cancelled', 'subscription', p_subscription::text, jsonb_build_object('reason', p_reason));
end $$;

-- ========================================================= matchmaking ===
create function public.admin_suggest_match(p_profile uuid, p_suggested uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; a public.profiles; b public.profiles;
begin
  perform private.require_staff(array['matchmaker']::public.staff_role[]);
  select * into a from public.profiles where id = p_profile;
  select * into b from public.profiles where id = p_suggested;
  if a.id is null or b.id is null or a.gender = b.gender then raise exception 'invalid_input' using errcode = '22023'; end if;
  if b.status <> 'active' or not b.listing_consent then raise exception 'profile_not_active' using errcode = 'P0001'; end if;
  if private.is_blocked_between(p_profile, p_suggested) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.bureau_suggestions (profile_id, suggested_profile_id, suggested_by, note)
  values (p_profile, p_suggested, auth.uid(), p_note)
  on conflict (profile_id, suggested_profile_id) do update set note = excluded.note, status = 'sent', created_at = now()
  returning id into v_id;
  perform private.notify_profile(p_profile, 'bureau_suggestion', jsonb_build_object('suggestion_id', v_id));
  perform private.log_audit('match_suggested', 'profile', p_profile::text, jsonb_build_object('suggested', p_suggested));
  return v_id;
end $$;

create function public.admin_resolve_report(p_report uuid, p_status public.report_status, p_note text default null,
                                            p_suspend_reported boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.reports;
begin
  perform private.require_staff(array['verifier']::public.staff_role[]);
  update public.reports set status = p_status, handled_by = auth.uid(), handled_at = now(), resolution_note = p_note
   where id = p_report returning * into r;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_suspend_reported then
    perform public.admin_set_profile_status(r.reported_profile_id, 'suspended', p_note);
  end if;
  perform private.log_audit('report_resolved', 'report', p_report::text, jsonb_build_object('status', p_status, 'suspended', p_suspend_reported));
end $$;

-- ========================================================== dashboard ===
create function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_staff();
  return jsonb_build_object(
    'profiles_pending_review',   (select count(*) from public.profiles where status = 'pending_review'),
    'profiles_active',           (select count(*) from public.profiles where status = 'active'),
    'profiles_active_by_gender', (select coalesce(jsonb_object_agg(gender, n), '{}') from
                                   (select gender, count(*) n from public.profiles where status = 'active' group by gender) g),
    'offline_clients',           (select count(*) from public.profiles where source = 'bureau_offline' and status <> 'deleted'),
    'offline_without_consent',   (select count(*) from public.profiles where source = 'bureau_offline' and not listing_consent and status <> 'deleted'),
    'verifications_pending',     (select count(*) from public.verification_requests where status = 'pending'),
    'photos_pending',            (select count(*) from public.profile_photos where status = 'pending'),
    'payments_pending',          (select count(*) from public.payments where status = 'pending'),
    'reports_open',              (select count(*) from public.reports where status in ('open', 'reviewing')),
    'active_subscriptions',      (select coalesce(jsonb_object_agg(plan_id, n), '{}') from
                                   (select plan_id, count(distinct profile_id) n from public.subscriptions
                                     where cancelled_at is null and now() between starts_at and ends_at group by plan_id) s),
    'revenue_this_month_pkr',    (select coalesce(sum(amount_pkr), 0) from public.payments
                                   where status = 'approved' and reviewed_at >= date_trunc('month', now())),
    'new_profiles_7d',           (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'meetings_upcoming',         (select count(*) from public.meetings where status = 'scheduled' and scheduled_for > now()),
    'rishtas_confirmed_total',   (select count(*) from public.conversations where stage in ('rishta_confirmed', 'engaged', 'married'))
  );
end $$;

-- ============================================== bulk import (WhatsApp data) ===
-- p_rows: JSON array of objects using the column names of the Excel template
-- (data-import/offline_clients_template.xlsx). Imported clients are created as
-- 'bureau_offline', status 'active', NOT listed until consent is recorded
-- (column listing_consent = yes). Returns one result object per row.
create function public.admin_import_offline_profiles(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb; i int := 0; v_id uuid; v_code text; v_results jsonb := '[]'::jsonb;
  v_dob date; v_height smallint; v_consent boolean; v_note text;
begin
  perform private.require_staff(array['matchmaker']::public.staff_role[]);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', hint = 'Send an array of at most 2000 rows.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      if coalesce(r ->> 'first_name', '') = '' or coalesce(r ->> 'gender', '') = '' then
        raise exception 'first_name and gender are required';
      end if;
      v_note := null;
      if coalesce(r ->> 'date_of_birth', '') <> '' then
        v_dob := (r ->> 'date_of_birth')::date;
      elsif coalesce(r ->> 'age', '') <> '' then
        v_dob := make_date(extract(year from current_date)::int - (r ->> 'age')::int, 1, 1);
        v_note := 'Date of birth estimated from age ' || (r ->> 'age') || ' at import.';
      else
        raise exception 'date_of_birth or age is required';
      end if;
      v_height := case when coalesce(r ->> 'height_feet', '') <> ''
                       then round(((r ->> 'height_feet')::numeric * 12 + coalesce(nullif(r ->> 'height_inches', '')::numeric, 0)) * 2.54)
                       end;
      v_consent := lower(coalesce(r ->> 'listing_consent', 'no')) in ('yes', 'y', 'true', '1', 'haan', 'ha');

      insert into public.profiles (
        source, managed_by, status, first_name, gender, date_of_birth, marital_status, children_count, height_cm,
        sect, caste, mother_tongue, city, country, willing_to_relocate, education_level, degree_title, profession,
        monthly_income_pkr, religiosity, father_occupation, mother_occupation, brothers_count, sisters_count,
        married_siblings, family_type, house_ownership, house_size, socioeconomic_class, about, family_about,
        legacy_ref, listing_consent, listing_consent_by, listing_consent_at, approved_at, approved_by)
      values (
        'bureau_offline', 'bureau', 'active', trim(r ->> 'first_name'), lower(r ->> 'gender')::public.gender, v_dob,
        coalesce(nullif(lower(r ->> 'marital_status'), ''), 'never_married')::public.marital_status,
        coalesce(nullif(r ->> 'children_count', '')::smallint, 0), v_height,
        nullif(lower(r ->> 'sect'), ''), nullif(lower(r ->> 'caste'), ''), nullif(lower(r ->> 'mother_tongue'), ''),
        nullif(lower(r ->> 'city'), ''), coalesce(nullif(lower(r ->> 'country'), ''), 'pakistan'),
        lower(coalesce(r ->> 'willing_to_relocate', 'no')) in ('yes', 'y', 'true', '1'),
        nullif(lower(r ->> 'education_level'), '')::public.education_level, nullif(r ->> 'degree_title', ''),
        nullif(r ->> 'profession', ''), nullif(r ->> 'monthly_income_pkr', '')::int,
        nullif(lower(r ->> 'religiosity'), '')::public.religiosity,
        nullif(r ->> 'father_occupation', ''), nullif(r ->> 'mother_occupation', ''),
        coalesce(nullif(r ->> 'brothers_count', '')::smallint, 0), coalesce(nullif(r ->> 'sisters_count', '')::smallint, 0),
        coalesce(nullif(r ->> 'married_siblings', '')::smallint, 0),
        nullif(lower(r ->> 'family_type'), '')::public.family_type,
        nullif(lower(r ->> 'house_ownership'), '')::public.house_ownership, nullif(r ->> 'house_size', ''),
        nullif(lower(r ->> 'socioeconomic_class'), '')::public.socioeconomic_class,
        nullif(r ->> 'about', ''), nullif(r ->> 'family_about', ''),
        nullif(trim(r ->> 'legacy_ref'), ''), v_consent,
        case when v_consent then auth.uid() end, case when v_consent then now() end, now(), auth.uid())
      returning id, public_code into v_id, v_code;

      update public.profile_private
         set last_name = nullif(r ->> 'last_name', ''), contact_phone = nullif(r ->> 'contact_phone', ''),
             whatsapp_number = nullif(r ->> 'whatsapp_number', ''), address = nullif(r ->> 'address', '')
       where profile_id = v_id;

      update public.partner_preferences
         set age_min = nullif(r ->> 'pref_age_min', '')::smallint,
             age_max = nullif(r ->> 'pref_age_max', '')::smallint,
             education_min = nullif(lower(r ->> 'pref_education_min'), '')::public.education_level,
             cities = coalesce(array(select lower(trim(x)) from unnest(string_to_array(r ->> 'pref_cities', ',')) x where trim(x) <> ''), '{}'),
             sects  = coalesce(array(select lower(trim(x)) from unnest(string_to_array(r ->> 'pref_sects', ',')) x where trim(x) <> ''), '{}'),
             castes = coalesce(array(select lower(trim(x)) from unnest(string_to_array(r ->> 'pref_castes', ',')) x where trim(x) <> ''), '{}'),
             notes = nullif(r ->> 'pref_notes', '')
       where profile_id = v_id;

      if v_note is not null or coalesce(r ->> 'staff_notes', '') <> '' then
        insert into public.profile_notes (profile_id, author_id, body)
        values (v_id, auth.uid(), concat_ws(E'\n', v_note, nullif(r ->> 'staff_notes', '')));
      end if;

      v_results := v_results || jsonb_build_object('row', i, 'ok', true, 'profile_id', v_id, 'public_code', v_code);
    exception when others then
      v_results := v_results || jsonb_build_object('row', i, 'ok', false, 'legacy_ref', r ->> 'legacy_ref', 'error', sqlerrm);
    end;
  end loop;

  perform private.log_audit('offline_import', 'profile', null,
    jsonb_build_object('rows', i, 'imported', (select count(*) from jsonb_array_elements(v_results) e where (e ->> 'ok')::boolean)));
  return v_results;
end $$;

-- ===================================================== daily maintenance ===
-- Scheduled nightly (pg_cron, see 0900). Safe to run any number of times.
create function public.run_daily_maintenance() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_expired int; v_reminders int;
begin
  if auth.uid() is not null and not private.has_staff_role(array['super_admin']::public.staff_role[]) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.interests set status = 'expired', responded_at = now()
   where status = 'pending' and created_at < now() - interval '30 days';
  get diagnostics v_expired = row_count;

  -- plan expiry reminders, 7 days and 1 day before (once each)
  with due as (
    select s.profile_id, s.plan_id, s.ends_at,
           case when s.ends_at < now() + interval '1 day' then '1d' else '7d' end as kind
      from public.subscriptions s
     where s.cancelled_at is null and s.ends_at > now() and s.ends_at < now() + interval '7 days'
       and not exists (select 1 from public.subscriptions s2   -- already renewed
                        where s2.profile_id = s.profile_id and s2.plan_id = s.plan_id
                          and s2.cancelled_at is null and s2.starts_at >= s.ends_at)
  ), todo as (
    select d.* from due d
     where not exists (select 1 from public.notifications n
                        where n.profile_id = d.profile_id and n.type = 'plan_expiring'
                          and n.data ->> 'kind' = d.kind and (n.data ->> 'ends_at')::timestamptz = d.ends_at)
  )
  select count(*) into v_reminders from todo,
    lateral (select private.notify_profile(todo.profile_id, 'plan_expiring',
             jsonb_build_object('plan', todo.plan_id, 'ends_at', todo.ends_at, 'kind', todo.kind))) x;

  return jsonb_build_object('interests_expired', v_expired, 'expiry_reminders', v_reminders);
end $$;
