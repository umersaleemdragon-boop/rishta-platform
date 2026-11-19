-- ============================================================================
-- 0500 MATCHMAKING ENGINE + SEARCH
--
-- Stage 1 - dealbreakers (must pass BOTH ways): opposite gender, accepted
--           marital status, age within range (+/- 3 yrs), sect/caste/city when
--           marked "must".
-- Stage 2 - one-way score 0..100 = how well C fits S's preferences:
--             age 15 | sect 15 | education 15 | family status 15 | caste 10
--             city 10 | religiosity 10 | height 5 | mother tongue 5
-- Mutual score = sqrt(score(A->B) * score(B->A)) so one-sided matches rank lower.
-- ============================================================================

create function private.age_years(p_dob date) returns int
language sql stable as $$ select extract(year from age(current_date, p_dob))::int $$;

create function private.income_band(p_income int) returns text
language sql immutable as $$
  select case
    when p_income is null      then null
    when p_income < 50000      then 'under_50k'
    when p_income < 100000     then '50k_100k'
    when p_income < 200000     then '100k_200k'
    when p_income < 500000     then '200k_500k'
    else '500k_plus' end
$$;

-- Does candidate c pass seeker's dealbreakers (sp = seeker's preferences)?
create function private.passes_dealbreakers(sp public.partner_preferences, c public.profiles) returns boolean
language sql stable as $$
  select
        (cardinality(coalesce(sp.marital_statuses, '{}')) = 0 or c.marital_status = any (sp.marital_statuses))
    and (sp.age_min is null or private.age_years(c.date_of_birth) >= sp.age_min - 3)
    and (sp.age_max is null or private.age_years(c.date_of_birth) <= sp.age_max + 3)
    and (not coalesce(sp.sect_is_must, false)  or cardinality(sp.sects)  = 0 or coalesce(c.sect  = any (sp.sects),  false))
    and (not coalesce(sp.caste_is_must, false) or cardinality(sp.castes) = 0 or coalesce(c.caste = any (sp.castes), false))
    and (not coalesce(sp.city_is_must, false)  or cardinality(sp.cities) = 0 or coalesce(c.city  = any (sp.cities), false))
$$;

create function private.match_score_one_way(s public.profiles, sp public.partner_preferences, c public.profiles)
returns int
language sql stable as $$
  select (
    -- age (15)
    (case when sp.age_min is null and sp.age_max is null then 15
          when a.age between coalesce(sp.age_min, 18) and coalesce(sp.age_max, 99) then 15
          when a.age between coalesce(sp.age_min, 18) - 2 and coalesce(sp.age_max, 99) + 2 then 8
          else 0 end)
    -- sect (15)
  + (case when cardinality(coalesce(sp.sects, '{}')) = 0 then 15
          when c.sect is null then 5
          when c.sect = any (sp.sects) then 15 else 0 end)
    -- education (15)
  + (case when sp.education_min is null then 15
          when c.education_level is null then 5
          when c.education_level >= sp.education_min then 15
          when private.enum_pos(c.education_level) = private.enum_pos(sp.education_min) - 1 then 7
          else 0 end)
    -- family socioeconomic status (15): minimum requirement + similarity of the two families
  + (case when sp.socioeconomic_min is not null and c.socioeconomic_class < sp.socioeconomic_min then 0
          when s.socioeconomic_class is null or c.socioeconomic_class is null then 7
          else (array[15, 10, 4, 0])[abs(private.enum_pos(s.socioeconomic_class) - private.enum_pos(c.socioeconomic_class)) + 1]
     end)
    -- caste / biradari (10)
  + (case when cardinality(coalesce(sp.castes, '{}')) = 0 then 10
          when c.caste is null then 3
          when c.caste = any (sp.castes) then 10 else 0 end)
    -- city (10)
  + (case when cardinality(coalesce(sp.cities, '{}')) = 0 then 10
          when c.city = any (sp.cities) then 10
          when c.willing_to_relocate or s.willing_to_relocate then 6 else 0 end)
    -- religiosity similarity (10)
  + (case when s.religiosity is null or c.religiosity is null then 5
          else (array[10, 6, 2, 0])[abs(private.enum_pos(s.religiosity) - private.enum_pos(c.religiosity)) + 1]
     end)
    -- height (5)
  + (case when sp.height_min_cm is null and sp.height_max_cm is null then 5
          when c.height_cm is null then 2
          when c.height_cm between coalesce(sp.height_min_cm, 0) and coalesce(sp.height_max_cm, 999) then 5
          when c.height_cm between coalesce(sp.height_min_cm, 0) - 5 and coalesce(sp.height_max_cm, 999) + 5 then 2
          else 0 end)
    -- mother tongue (5)
  + (case when cardinality(coalesce(sp.mother_tongues, '{}')) = 0 then 5
          when c.mother_tongue is null then 2
          when c.mother_tongue = any (sp.mother_tongues) then 5 else 0 end)
  )::int
  from (select private.age_years(c.date_of_birth) as age) a
$$;

create function private.mutual_score(a public.profiles, ap public.partner_preferences,
                                     b public.profiles, bp public.partner_preferences) returns int
language sql stable as $$
  select round(sqrt(private.match_score_one_way(a, ap, b)::numeric * private.match_score_one_way(b, bp, a)))::int
$$;

-- Can the current user read data AS this profile (owner, guardian, or managing staff)?
create function private.can_read_as(p_profile uuid) returns boolean
language sql stable as $$
  select private.is_profile_member(p_profile) or private.can_manage_profile(p_profile)
$$;

-- ============================================================ search ======
-- Browse compatible profiles. Free tier: max 10 results with limited fields
-- (the app shows them as blurred preview cards). Basic+: full cards, paging.
create function public.search_profiles(
  p_viewer  uuid,
  p_filters jsonb default '{}'::jsonb,
  p_limit   int   default 20,
  p_offset  int   default 0
)
returns table (
  profile_id          uuid,
  public_code         text,
  first_name          text,
  age                 int,
  height_cm           smallint,
  city                text,
  country             text,
  marital_status      public.marital_status,
  education_level     public.education_level,
  degree_title        text,
  profession          text,
  sect                text,
  caste               text,
  mother_tongue       text,
  socioeconomic_class public.socioeconomic_class,
  religiosity         public.religiosity,
  verification_level  public.verification_level,
  match_score         int,
  is_premium          boolean,
  is_featured         boolean,
  has_photos          boolean,
  interest_status     public.interest_status,
  is_limited_preview  boolean
)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_me     public.profiles;
  v_full   boolean;
  v_age_min int := (p_filters ->> 'age_min')::int;
  v_age_max int := (p_filters ->> 'age_max')::int;
  v_cities  text[] := array(select jsonb_array_elements_text(coalesce(p_filters -> 'cities', '[]')));
  v_sects   text[] := array(select jsonb_array_elements_text(coalesce(p_filters -> 'sects', '[]')));
  v_castes  text[] := array(select jsonb_array_elements_text(coalesce(p_filters -> 'castes', '[]')));
  v_marital public.marital_status[] := array(select jsonb_array_elements_text(coalesce(p_filters -> 'marital_statuses', '[]'))::public.marital_status);
  v_edu     public.education_level := (p_filters ->> 'education_min')::public.education_level;
  v_verified boolean := coalesce((p_filters ->> 'verified_only')::boolean, false);
  v_sort    text := coalesce(p_filters ->> 'sort', 'match');
begin
  if not private.can_read_as(p_viewer) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_me from public.profiles where id = p_viewer;
  if v_me.status not in ('active', 'pending_review', 'paused') then
    raise exception 'profile_not_active' using errcode = 'P0001';
  end if;

  v_full := private.tier_rank(p_viewer) >= 1 or private.is_staff();
  if not v_full then
    p_limit := least(p_limit, 10);
    p_offset := 0;
  end if;
  p_limit := least(greatest(p_limit, 1), 50);

  update public.profiles set last_active_at = now() where id = p_viewer and auth.uid() = owner_user_id;

  return query
  select
    c.id,
    c.public_code,
    case when v_full then c.first_name end,
    private.age_years(c.date_of_birth),
    case when v_full then c.height_cm end,
    c.city,
    c.country,
    c.marital_status,
    c.education_level,
    case when v_full then c.degree_title end,
    case when v_full then c.profession end,
    c.sect,
    case when v_full then c.caste end,
    case when v_full then c.mother_tongue end,
    case when v_full then c.socioeconomic_class end,
    case when v_full then c.religiosity end,
    c.verification_level,
    x.score,
    x.premium,
    c.is_featured,
    exists (select 1 from public.profile_photos ph where ph.profile_id = c.id and ph.status = 'approved'),
    (select i.status from public.interests i
      where (i.sender_profile_id = p_viewer and i.receiver_profile_id = c.id)
         or (i.sender_profile_id = c.id and i.receiver_profile_id = p_viewer)
      order by i.created_at desc limit 1),
    not v_full
  from public.profiles m
  join public.partner_preferences mp on mp.profile_id = m.id
  join public.profiles c on c.gender <> m.gender
  join public.partner_preferences cp on cp.profile_id = c.id
  cross join lateral (
    select private.mutual_score(m, mp, c, cp) as score,
           private.profile_tier(c.id) = 'premium' as premium
  ) x
  where m.id = p_viewer
    and c.status = 'active'
    and c.listing_consent
    and not private.is_blocked_between(m.id, c.id)
    and private.passes_dealbreakers(mp, c)
    and private.passes_dealbreakers(cp, m)
    and (v_age_min is null or private.age_years(c.date_of_birth) >= v_age_min)
    and (v_age_max is null or private.age_years(c.date_of_birth) <= v_age_max)
    and (cardinality(v_cities)  = 0 or c.city  = any (v_cities))
    and (cardinality(v_sects)   = 0 or c.sect  = any (v_sects))
    and (cardinality(v_castes)  = 0 or c.caste = any (v_castes))
    and (cardinality(v_marital) = 0 or c.marital_status = any (v_marital))
    and (v_edu is null or c.education_level >= v_edu)
    and (not v_verified or c.verification_level >= 'cnic')
  order by
    case when v_sort = 'newest' then extract(epoch from c.approved_at) end desc nulls last,
    -- priority listing: premium +5, featured +3 (affects order only, not the shown score)
    x.score + (case when x.premium then 5 else 0 end) + (case when c.is_featured then 3 else 0 end) desc,
    c.id
  limit p_limit offset p_offset;
end $$;

-- ====================================================== profile detail ======
create function public.get_profile_detail(p_viewer uuid, p_target uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_me   public.profiles;
  v_t    public.profiles;
  v_mp   public.partner_preferences;
  v_tp   public.partner_preferences;
  v_conv public.conversations;
  v_interest public.interests;
  v_has_link boolean;
  v_suggested boolean;
begin
  if not private.can_read_as(p_viewer) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_me from public.profiles where id = p_viewer;
  select * into v_t  from public.profiles where id = p_target;
  if v_t.id is null or v_t.gender = v_me.gender or private.is_blocked_between(p_viewer, p_target) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_conv from public.conversations
   where profile_a = least(p_viewer, p_target) and profile_b = greatest(p_viewer, p_target);
  select * into v_interest from public.interests
   where (sender_profile_id = p_viewer and receiver_profile_id = p_target)
      or (sender_profile_id = p_target and receiver_profile_id = p_viewer)
   order by created_at desc limit 1;
  v_suggested := exists (select 1 from public.bureau_suggestions
                          where profile_id = p_viewer and suggested_profile_id = p_target);
  v_has_link := v_conv.id is not null or v_interest.id is not null or v_suggested;

  if not ((v_t.status = 'active' and v_t.listing_consent) or v_conv.id is not null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (v_has_link or private.tier_rank(p_viewer) >= 1 or private.is_staff()) then
    raise exception 'upgrade_required' using errcode = 'P0001', hint = 'basic';
  end if;

  select * into v_mp from public.partner_preferences where profile_id = p_viewer;
  select * into v_tp from public.partner_preferences where profile_id = p_target;

  return jsonb_build_object(
    'profile_id', v_t.id, 'public_code', v_t.public_code, 'first_name', v_t.first_name,
    'managed_by', v_t.managed_by, 'is_bureau_client', v_t.source = 'bureau_offline',
    'age', private.age_years(v_t.date_of_birth), 'gender', v_t.gender,
    'marital_status', v_t.marital_status, 'children_count', v_t.children_count,
    'height_cm', v_t.height_cm, 'religion', v_t.religion, 'sect', v_t.sect, 'caste', v_t.caste,
    'mother_tongue', v_t.mother_tongue, 'city', v_t.city, 'country', v_t.country,
    'willing_to_relocate', v_t.willing_to_relocate,
    'education_level', v_t.education_level, 'degree_title', v_t.degree_title, 'institution', v_t.institution,
    'profession', v_t.profession, 'income_band', private.income_band(v_t.monthly_income_pkr),
    'religiosity', v_t.religiosity, 'is_hafiz', v_t.is_hafiz, 'smokes', v_t.smokes, 'about', v_t.about,
    'family', jsonb_build_object(
       'father_occupation', v_t.father_occupation, 'mother_occupation', v_t.mother_occupation,
       'brothers_count', v_t.brothers_count, 'sisters_count', v_t.sisters_count,
       'married_siblings', v_t.married_siblings, 'family_type', v_t.family_type,
       'house_ownership', v_t.house_ownership, 'house_size', v_t.house_size,
       'socioeconomic_class', v_t.socioeconomic_class, 'about', v_t.family_about),
    'looking_for', jsonb_build_object(
       'age_min', v_tp.age_min, 'age_max', v_tp.age_max, 'education_min', v_tp.education_min,
       'cities', v_tp.cities, 'sects', v_tp.sects, 'notes', v_tp.notes),
    'verification_level', v_t.verification_level,
    'is_premium', private.profile_tier(v_t.id) = 'premium',
    'has_photos', exists (select 1 from public.profile_photos where profile_id = v_t.id and status = 'approved'),
    'match_score', private.mutual_score(v_me, v_mp, v_t, v_tp),
    'relationship', jsonb_build_object(
       'interest_id', v_interest.id, 'interest_status', v_interest.status,
       'interest_sent_by_me', v_interest.sender_profile_id = p_viewer,
       'conversation_id', v_conv.id, 'stage', v_conv.stage,
       'bureau_suggested', v_suggested,
       'photo_access', (select status from public.photo_access
                         where owner_profile_id = p_target and viewer_profile_id = p_viewer
                         order by requested_at desc limit 1),
       'contact_access', (select status from public.contact_shares
                           where owner_profile_id = p_target and viewer_profile_id = p_viewer
                           order by requested_at desc limit 1))
  );
end $$;

-- ===================================================== admin: top matches ===
create function public.admin_top_matches(p_profile uuid, p_limit int default 25)
returns table (
  profile_id uuid, public_code text, first_name text, age int, city text, sect text, caste text,
  education_level public.education_level, profession text, socioeconomic_class public.socioeconomic_class,
  verification_level public.verification_level, source public.profile_source, tier text,
  match_score int, score_for_client int, score_for_candidate int, already_suggested boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  perform private.require_staff(array['matchmaker']::public.staff_role[]);
  return query
  select c.id, c.public_code, c.first_name, private.age_years(c.date_of_birth), c.city, c.sect, c.caste,
         c.education_level, c.profession, c.socioeconomic_class, c.verification_level, c.source,
         private.profile_tier(c.id),
         private.mutual_score(m, mp, c, cp),
         private.match_score_one_way(m, mp, c),
         private.match_score_one_way(c, cp, m),
         exists (select 1 from public.bureau_suggestions bs where bs.profile_id = m.id and bs.suggested_profile_id = c.id)
    from public.profiles m
    join public.partner_preferences mp on mp.profile_id = m.id
    join public.profiles c on c.gender <> m.gender
    join public.partner_preferences cp on cp.profile_id = c.id
   where m.id = p_profile
     and c.status = 'active' and c.listing_consent
     and not private.is_blocked_between(m.id, c.id)
     and private.passes_dealbreakers(mp, c)
     and private.passes_dealbreakers(cp, m)
   order by 14 desc, c.id
   limit least(greatest(p_limit, 1), 200);
end $$;
