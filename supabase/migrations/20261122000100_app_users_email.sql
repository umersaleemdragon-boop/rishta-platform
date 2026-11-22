-- ============================================================================
-- 1004 EMAIL SIGN-IN SUPPORT
-- Members can now sign in with an email code instead of an SMS code. Keep the
-- login email on app_users so staff (who cannot read auth.users) can see it.
-- ============================================================================

alter table public.app_users add column email text;

update public.app_users u set email = a.email from auth.users a where a.id = u.id and u.email is null;

create or replace function private.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.app_users (id, full_name, phone, phone_verified_at, email)
  values (new.id,
          nullif(new.raw_user_meta_data ->> 'full_name', ''),
          new.phone,
          new.phone_confirmed_at,
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function private.handle_auth_user_phone_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.app_users
     set phone = new.phone, phone_verified_at = new.phone_confirmed_at, email = new.email
   where id = new.id;
  return new;
end $$;

drop trigger on_auth_user_phone_changed on auth.users;
create trigger on_auth_user_contact_changed after update of phone, phone_confirmed_at, email on auth.users
  for each row execute function private.handle_auth_user_phone_change();

-- Users may not change their own stored email directly (it mirrors the login).
-- (Column-level update grants on app_users remain full_name, preferred_language.)
