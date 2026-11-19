-- ============================================================================
-- 0200 PROFILES: rishta profiles, private details, guardians, partner
-- preferences, photos, verification requests, staff notes.
-- ============================================================================

create sequence public.profile_code_seq start 10001;

create table public.profiles (
  id                    uuid primary key default gen_random_uuid(),
  -- short human-friendly code staff and families can quote on the phone / WhatsApp
  public_code           text not null unique default ('RB-' || nextval('public.profile_code_seq')),
  owner_user_id         uuid references public.app_users (id) on delete set null,
  managed_by            public.managed_by not null default 'self',
  source                public.profile_source not null default 'self_registered',
  status                public.profile_status not null default 'draft',
  verification_level    public.verification_level not null default 'none',

  -- candidate
  first_name            text not null check (char_length(first_name) between 1 and 60),
  gender                public.gender not null,
  date_of_birth         date not null,
  marital_status        public.marital_status not null default 'never_married',
  children_count        smallint not null default 0 check (children_count between 0 and 20),
  height_cm             smallint check (height_cm between 120 and 230),
  religion              text not null default 'islam',
  sect                  text,
  caste                 text,
  mother_tongue         text,
  city                  text,
  country               text not null default 'pakistan',
  willing_to_relocate   boolean not null default false,
  education_level       public.education_level,
  degree_title          text check (char_length(degree_title) <= 120),
  institution           text check (char_length(institution) <= 120),
  profession            text check (char_length(profession) <= 120),
  monthly_income_pkr    integer check (monthly_income_pkr >= 0),
  religiosity           public.religiosity,
  is_hafiz              boolean not null default false,
  smokes                boolean,
  about                 text check (char_length(about) <= 2000),

  -- family
  father_occupation     text check (char_length(father_occupation) <= 120),
  mother_occupation     text check (char_length(mother_occupation) <= 120),
  brothers_count        smallint not null default 0 check (brothers_count between 0 and 20),
  sisters_count         smallint not null default 0 check (sisters_count between 0 and 20),
  married_siblings      smallint not null default 0 check (married_siblings between 0 and 40),
  family_type           public.family_type,
  house_ownership       public.house_ownership,
  house_size            text check (char_length(house_size) <= 60),   -- e.g. "10 marla"
  socioeconomic_class   public.socioeconomic_class,
  family_about          text check (char_length(family_about) <= 2000),

  -- who may send interests to this profile
  contact_policy        public.contact_policy not null default 'anyone',

  -- bureau fields
  is_featured           boolean not null default false,
  listing_consent       boolean not null default false,  -- offline clients must consent before being listed
  listing_consent_by    uuid references public.app_users (id),
  listing_consent_at    timestamptz,
  legacy_ref            text,                              -- e.g. WhatsApp / register reference
  review_note           text,                              -- reason shown to user when sent back for changes
  approved_at           timestamptz,
  approved_by           uuid references public.app_users (id),
  completeness          smallint not null default 0,
  last_active_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint offline_profiles_have_no_owner check (source = 'self_registered' or owner_user_id is null)
);

create index profiles_owner_idx  on public.profiles (owner_user_id);
create index profiles_search_idx on public.profiles (status, gender, city);
create index profiles_status_idx on public.profiles (status, created_at desc);
create index profiles_name_trgm  on public.profiles using gin (first_name extensions.gin_trgm_ops);
create unique index profiles_legacy_ref_idx on public.profiles (legacy_ref) where legacy_ref is not null;

-- Private details: only the profile's own account, its guardians and staff can read.
-- Contact numbers are revealed to others ONLY via public.get_contact_details().
create table public.profile_private (
  profile_id       uuid primary key references public.profiles (id) on delete cascade,
  last_name        text check (char_length(last_name) <= 60),
  contact_phone    text check (char_length(contact_phone) <= 20),
  whatsapp_number  text check (char_length(whatsapp_number) <= 20),
  email            text check (char_length(email) <= 200),
  address          text check (char_length(address) <= 300),
  -- salted hash of the CNIC number, set by a verifier; unique => one CNIC, one profile
  cnic_hash        text unique,
  updated_at       timestamptz not null default now()
);

-- Wali / guardian mode: extra logins that can READ a profile and its chats.
create table public.profile_guardians (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  user_id     uuid not null references public.app_users (id) on delete cascade,
  relation    text not null check (relation in ('father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'grandparent', 'other')),
  created_at  timestamptz not null default now(),
  primary key (profile_id, user_id)
);
create index profile_guardians_user_idx on public.profile_guardians (user_id);

create table public.partner_preferences (
  profile_id          uuid primary key references public.profiles (id) on delete cascade,
  age_min             smallint check (age_min between 18 and 80),
  age_max             smallint check (age_max between 18 and 80),
  height_min_cm       smallint check (height_min_cm between 120 and 230),
  height_max_cm       smallint check (height_max_cm between 120 and 230),
  marital_statuses    public.marital_status[] not null default '{}',   -- empty = any
  education_min       public.education_level,
  socioeconomic_min   public.socioeconomic_class,
  sects               text[] not null default '{}',
  sect_is_must        boolean not null default false,
  castes              text[] not null default '{}',
  caste_is_must       boolean not null default false,
  cities              text[] not null default '{}',
  city_is_must        boolean not null default false,
  mother_tongues      text[] not null default '{}',
  notes               text check (char_length(notes) <= 1000),
  updated_at          timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max),
  check (height_min_cm is null or height_max_cm is null or height_min_cm <= height_max_cm)
);

-- Photos are stored in the PRIVATE "profile-photos" bucket at "<profile_id>/<file>".
-- Every photo is checked by staff (status) before anyone else can ever see it.
create table public.profile_photos (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  storage_path  text not null unique,
  status        public.review_status not null default 'pending',
  is_primary    boolean not null default false,
  sort_order    smallint not null default 0,
  reviewed_by   uuid references public.app_users (id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  check (storage_path like profile_id::text || '/%')
);
create index profile_photos_profile_idx on public.profile_photos (profile_id);

create table public.verification_requests (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  level           public.verification_level not null check (level in ('cnic', 'bureau')),
  -- private "verification-docs" bucket paths
  cnic_front_path text,
  cnic_back_path  text,
  selfie_path     text,
  status          public.review_status not null default 'pending',
  submitted_by    uuid references public.app_users (id),
  reviewed_by     uuid references public.app_users (id),
  reviewed_at     timestamptz,
  reviewer_note   text,
  created_at      timestamptz not null default now(),
  check (level <> 'cnic' or (cnic_front_path is not null and cnic_back_path is not null and selfie_path is not null))
);
create index verification_requests_status_idx on public.verification_requests (status, created_at);
create unique index verification_requests_one_pending on public.verification_requests (profile_id, level) where status = 'pending';

-- Internal CRM notes. Staff only - never visible to users.
create table public.profile_notes (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  author_id   uuid references public.app_users (id),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index profile_notes_profile_idx on public.profile_notes (profile_id, created_at desc);

-- ------------------------------------------------- access helper functions ----
-- Owner or guardian of the profile (NOT staff).
create function private.is_profile_member(p_profile uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = p_profile and p.owner_user_id = auth.uid())
      or exists (select 1 from public.profile_guardians g where g.profile_id = p_profile and g.user_id = auth.uid())
$$;

-- May ACT for the profile (send interests, chat, approve photo requests):
-- the owner, or a matchmaker/super_admin for offline bureau clients.
create function private.can_manage_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_profile
       and (p.owner_user_id = auth.uid()
            or (p.source = 'bureau_offline' and private.has_staff_role(array['matchmaker']::public.staff_role[])))
  )
$$;

-- May read the profile's own (private) records: members + any staff.
create function private.can_view_own_profile(p_profile uuid) returns boolean
language sql stable as $$
  select private.is_profile_member(p_profile) or private.is_staff()
$$;

create function private.require_manage(p_profile uuid) returns void
language plpgsql stable as $$
begin
  if p_profile is null or not private.can_manage_profile(p_profile) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $$;

-- ----------------------------------------------------------- triggers ----
create function private.profile_completeness(p public.profiles) returns smallint
language sql immutable as $$
  select (round(100.0 * (
      (p.height_cm is not null)::int + (p.sect is not null)::int + (p.caste is not null)::int
    + (p.mother_tongue is not null)::int + (p.city is not null)::int + (p.education_level is not null)::int
    + (p.degree_title is not null)::int + (p.profession is not null)::int + (p.religiosity is not null)::int
    + (p.about is not null)::int + (p.father_occupation is not null)::int + (p.family_type is not null)::int
    + (p.house_ownership is not null)::int + (p.socioeconomic_class is not null)::int + (p.family_about is not null)::int
  ) / 15))::smallint
$$;

-- Validates profiles and stops users from changing bureau-controlled fields.
-- Trusted functions set app.trusted = 'on' (transaction-local) to bypass the guard.
create function private.profiles_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trusted boolean := coalesce(current_setting('app.trusted', true), '') = 'on'
                       or private.is_staff()
                       or auth.uid() is null;   -- service role / migrations
begin
  if new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'must_be_18_or_older' using errcode = '23514';
  end if;

  new.completeness := private.profile_completeness(new);

  if tg_op = 'INSERT' then
    if new.source = 'self_registered' then
      new.listing_consent := true;          -- registering yourself = consent to be listed
      new.listing_consent_at := now();
    end if;
    if not v_trusted then
      if new.owner_user_id is distinct from auth.uid() or new.source <> 'self_registered' then
        raise exception 'not_authorized' using errcode = '42501';
      end if;
      new.status := 'draft';   -- submitted for review later via update (completeness is checked then)
      new.verification_level := 'none';
      new.is_featured := false;
      new.approved_at := null; new.approved_by := null;
      new.legacy_ref := null; new.review_note := null;
      if (select count(*) from public.profiles where owner_user_id = auth.uid() and status <> 'deleted') >= 5 then
        raise exception 'profile_limit_reached' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if not v_trusted then
    if new.owner_user_id      is distinct from old.owner_user_id
    or new.source             is distinct from old.source
    or new.public_code        is distinct from old.public_code
    or new.verification_level is distinct from old.verification_level
    or new.is_featured        is distinct from old.is_featured
    or new.listing_consent    is distinct from old.listing_consent
    or new.listing_consent_by is distinct from old.listing_consent_by
    or new.listing_consent_at is distinct from old.listing_consent_at
    or new.legacy_ref         is distinct from old.legacy_ref
    or new.review_note        is distinct from old.review_note
    or new.approved_at        is distinct from old.approved_at
    or new.approved_by        is distinct from old.approved_by
    or new.gender             is distinct from old.gender then
      raise exception 'field_locked' using errcode = '42501',
        hint = 'This field can only be changed by the bureau team.';
    end if;

    if new.status is distinct from old.status and not (
         (old.status = 'draft'  and new.status = 'pending_review')
      or (old.status = 'active' and new.status = 'paused')
      or (old.status = 'paused' and new.status = 'active' and old.approved_at is not null)
      or (old.status in ('draft', 'pending_review', 'active', 'paused', 'matched') and new.status = 'deleted')
    ) then
      raise exception 'invalid_status_change' using errcode = '42501';
    end if;

    if old.status = 'draft' and new.status = 'pending_review'
       and (new.city is null or new.education_level is null or new.height_cm is null or new.sect is null) then
      raise exception 'profile_incomplete' using errcode = '23514',
        hint = 'city, education_level, height_cm and sect are required before submitting.';
    end if;

    -- Date of birth / name changes after approval need re-review (anti-fraud).
    if old.status in ('active', 'paused')
       and (new.date_of_birth is distinct from old.date_of_birth or new.first_name is distinct from old.first_name) then
      new.status := 'pending_review';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_guard before insert or update on public.profiles
  for each row execute function private.profiles_guard();

-- Create empty private + preference rows with every profile.
create function private.profiles_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profile_private (profile_id) values (new.id) on conflict do nothing;
  insert into public.partner_preferences (profile_id, age_min, age_max)
  values (new.id, null, null) on conflict do nothing;
  return new;
end $$;
create trigger profiles_after_insert after insert on public.profiles
  for each row execute function private.profiles_after_insert();

create trigger profile_private_updated_at before update on public.profile_private
  for each row execute function private.set_updated_at();
create trigger partner_preferences_updated_at before update on public.partner_preferences
  for each row execute function private.set_updated_at();

-- Users may not set the CNIC hash; only verifiers (via admin function) can.
create function private.profile_private_guard() returns trigger
language plpgsql as $$
begin
  if new.cnic_hash is distinct from old.cnic_hash
     and coalesce(current_setting('app.trusted', true), '') <> 'on'
     and auth.uid() is not null
     and not private.has_staff_role(array['verifier']::public.staff_role[]) then
    raise exception 'field_locked' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profile_private_guard before update on public.profile_private
  for each row execute function private.profile_private_guard();

-- Users can upload/reorder photos, but only staff can approve them.
create function private.profile_photos_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or private.has_staff_role(array['verifier']::public.staff_role[]) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.reviewed_by := null; new.reviewed_at := null;
  elsif new.status is distinct from old.status or new.storage_path is distinct from old.storage_path
     or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'field_locked' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profile_photos_guard before insert or update on public.profile_photos
  for each row execute function private.profile_photos_guard();
