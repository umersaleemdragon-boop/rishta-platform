-- ============================================================================
-- 1000 GUARDIAN INVITES
-- Guardians (wali mode) can read a profile and its chats, so they must be
-- linked by invitation: the profile owner creates a one-time code, the
-- guardian signs in and redeems it. Direct inserts are now staff-only.
-- ============================================================================

create table public.guardian_invites (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  code         text not null unique,
  relation     text not null check (relation in ('father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'grandparent', 'other')),
  created_by   uuid references public.app_users (id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  redeemed_by  uuid references public.app_users (id),
  redeemed_at  timestamptz,
  revoked_at   timestamptz
);
create index guardian_invites_profile_idx on public.guardian_invites (profile_id);

alter table public.guardian_invites enable row level security;
create policy guardian_invites_read on public.guardian_invites for select to authenticated
  using (private.can_manage_profile(profile_id) or private.is_staff());
revoke insert, update, delete on public.guardian_invites from authenticated;
revoke all on public.guardian_invites from anon;

-- Replace the old "owner may insert any guardian" policy.
drop policy guardians_insert on public.profile_guardians;
create policy guardians_insert_staff on public.profile_guardians for insert to authenticated
  with check (private.has_staff_role(array['matchmaker']::public.staff_role[]));

create function public.create_guardian_invite(p_profile uuid, p_relation text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_code text; v_inv public.guardian_invites;
begin
  perform private.require_manage(p_profile);
  if (select count(*) from public.guardian_invites
       where profile_id = p_profile and redeemed_at is null and revoked_at is null and expires_at > now()) >= 5 then
    raise exception 'too_many_invites' using errcode = 'P0001';
  end if;
  if (select count(*) from public.profile_guardians where profile_id = p_profile) >= 4 then
    raise exception 'guardian_limit_reached' using errcode = 'P0001';
  end if;
  -- 8 characters, no look-alike letters (0/O, 1/I/L)
  loop
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 31) + 1, 1), '')
                 from extensions.gen_random_bytes(8) b, generate_series(0, 7) i);
    exit when not exists (select 1 from public.guardian_invites where code = v_code);
  end loop;
  insert into public.guardian_invites (profile_id, code, relation, created_by)
  values (p_profile, v_code, p_relation, auth.uid())
  returning * into v_inv;
  return jsonb_build_object('id', v_inv.id, 'code', v_inv.code, 'expires_at', v_inv.expires_at);
end $$;

create function public.redeem_guardian_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_inv public.guardian_invites; v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into v_inv from public.guardian_invites
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
   for update;
  if v_inv.id is null or v_inv.redeemed_at is not null or v_inv.revoked_at is not null or v_inv.expires_at < now() then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  select owner_user_id into v_owner from public.profiles where id = v_inv.profile_id;
  if v_owner = auth.uid() then raise exception 'invalid_invite' using errcode = 'P0001'; end if;

  insert into public.profile_guardians (profile_id, user_id, relation)
  values (v_inv.profile_id, auth.uid(), v_inv.relation)
  on conflict (profile_id, user_id) do update set relation = excluded.relation;
  update public.guardian_invites set redeemed_by = auth.uid(), redeemed_at = now() where id = v_inv.id;
  perform private.notify_profile(v_inv.profile_id, 'guardian_joined', jsonb_build_object('relation', v_inv.relation));
  return v_inv.profile_id;
end $$;

create function public.revoke_guardian_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile uuid;
begin
  select profile_id into v_profile from public.guardian_invites where id = p_invite;
  perform private.require_manage(v_profile);
  update public.guardian_invites set revoked_at = now() where id = p_invite and redeemed_at is null;
end $$;

-- Profiles where the caller is a guardian (they can't read app_users of the owner).
create function public.list_my_guarded_profiles()
returns table (profile_id uuid, public_code text, first_name text, relation text, status public.profile_status)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.public_code, p.first_name, g.relation, p.status
    from public.profile_guardians g join public.profiles p on p.id = g.profile_id
   where g.user_id = auth.uid() and p.status <> 'deleted'
   order by g.created_at
$$;

revoke execute on function public.create_guardian_invite(uuid, text), public.redeem_guardian_invite(text),
  public.revoke_guardian_invite(uuid), public.list_my_guarded_profiles() from public, anon;
grant execute on function public.create_guardian_invite(uuid, text), public.redeem_guardian_invite(text),
  public.revoke_guardian_invite(uuid), public.list_my_guarded_profiles() to authenticated, service_role;
