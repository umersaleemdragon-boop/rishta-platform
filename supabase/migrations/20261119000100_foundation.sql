-- ============================================================================
-- 0100 FOUNDATION: extensions, private schema, enums, users, staff, audit log,
-- lookup lists (cities, sects, castes, languages).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- Internal helper functions live in "private", which is NOT exposed through
-- the Supabase API. Only public.* functions are callable from the apps.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------- enums ----
create type public.gender               as enum ('male', 'female');
create type public.marital_status       as enum ('never_married', 'divorced', 'widowed', 'separated');
create type public.managed_by           as enum ('self', 'parent', 'sibling', 'relative', 'bureau');
create type public.profile_source       as enum ('self_registered', 'bureau_offline');
create type public.profile_status       as enum ('draft', 'pending_review', 'active', 'paused', 'matched', 'suspended', 'deleted');
-- ordered: none < phone < cnic < bureau
create type public.verification_level   as enum ('none', 'phone', 'cnic', 'bureau');
-- ordered lowest -> highest (used for "minimum education" preferences)
create type public.education_level      as enum ('primary', 'matric', 'intermediate', 'diploma', 'bachelors', 'masters', 'mphil', 'doctorate');
create type public.socioeconomic_class  as enum ('lower_middle', 'middle', 'upper_middle', 'upper');
create type public.religiosity          as enum ('liberal', 'moderate', 'practising', 'very_religious');
create type public.family_type          as enum ('nuclear', 'joint');
create type public.house_ownership      as enum ('owned', 'rented', 'family_owned');
create type public.contact_policy       as enum ('anyone', 'verified_only', 'premium_only');
create type public.staff_role           as enum ('super_admin', 'verifier', 'matchmaker', 'accountant');
create type public.review_status        as enum ('pending', 'approved', 'rejected');
create type public.payment_method       as enum ('jazzcash', 'easypaisa', 'bank_transfer', 'card', 'cash');
create type public.payment_status       as enum ('pending', 'approved', 'rejected', 'refunded');
create type public.interest_status      as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired');
create type public.access_status        as enum ('pending', 'approved', 'declined', 'revoked');
create type public.connection_stage     as enum ('chatting', 'meeting_planned', 'rishta_confirmed', 'engaged', 'married', 'closed');
create type public.meeting_type         as enum ('video_call', 'in_person_family');
create type public.meeting_status       as enum ('requested', 'scheduled', 'declined', 'cancelled', 'completed');
create type public.message_kind         as enum ('text', 'system');
create type public.report_reason        as enum ('fake_profile', 'agent_or_middleman', 'harassment', 'asking_for_money', 'inappropriate_content', 'already_married', 'other');
create type public.report_status        as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type public.suggestion_status    as enum ('sent', 'viewed', 'interested', 'not_interested');

-- ------------------------------------------------------------- helpers ----
create function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Position of an enum value inside its type (1-based) - for "distance" maths.
create function private.enum_pos(anyenum) returns int
language sql immutable as $$ select array_position(enum_range($1), $1) $$;

create function private.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- --------------------------------------------------------- reference data ----
create table public.lookups (
  category   text not null check (category in ('city', 'sect', 'caste', 'mother_tongue', 'country')),
  value      text not null check (value ~ '^[a-z0-9_]+$'),
  label_en   text not null,
  label_ur   text,
  sort_order int  not null default 100,
  is_active  boolean not null default true,
  primary key (category, value)
);

-- ------------------------------------------------------------ app users ----
-- One row per login (auth.users). A login can manage several rishta profiles
-- (e.g. a mother managing profiles for two children).
create table public.app_users (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text check (char_length(full_name) <= 120),
  phone              text,
  phone_verified_at  timestamptz,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'ur')),
  is_banned          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger app_users_updated_at before update on public.app_users
  for each row execute function private.set_updated_at();

create function private.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.app_users (id, full_name, phone, phone_verified_at)
  values (new.id,
          nullif(new.raw_user_meta_data ->> 'full_name', ''),
          new.phone,
          new.phone_confirmed_at)
  on conflict (id) do nothing;
  return new;
end $$;

create function private.handle_auth_user_phone_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.app_users
     set phone = new.phone, phone_verified_at = new.phone_confirmed_at
   where id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();
create trigger on_auth_user_phone_changed after update of phone, phone_confirmed_at on auth.users
  for each row execute function private.handle_auth_user_phone_change();

-- ---------------------------------------------------------------- staff ----
create table public.staff_members (
  user_id      uuid primary key references public.app_users (id) on delete cascade,
  role         public.staff_role not null,
  display_name text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- true if the caller is active staff with one of `roles` (super_admin always passes).
-- `roles` null = any staff role.
create function private.has_staff_role(roles public.staff_role[] default null) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.staff_members s
     where s.user_id = auth.uid()
       and s.is_active
       and (roles is null or s.role = 'super_admin' or s.role = any (roles))
  )
$$;

create function private.is_staff() returns boolean
language sql stable as $$ select private.has_staff_role(null) $$;

create function private.require_staff(roles public.staff_role[] default null) returns void
language plpgsql stable as $$
begin
  if not private.has_staff_role(roles) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $$;

-- ------------------------------------------------------------ audit log ----
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

create function private.log_audit(p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb))
$$;
