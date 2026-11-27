-- ============================================================================
-- 1005 Staff contact reveal: the admin panel shows phone numbers masked;
-- "Reveal" calls this function, which returns the details AND writes an
-- audit-log entry naming the staff member. (Staff RLS can still read
-- profile_private directly; the app always goes through this function.)
-- ============================================================================
create function public.admin_reveal_contact(p_profile uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.profile_private; o public.app_users;
begin
  perform private.require_staff();
  select * into v from public.profile_private where profile_id = p_profile;
  if v.profile_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select u.* into o from public.app_users u join public.profiles p on p.owner_user_id = u.id where p.id = p_profile;
  perform private.log_audit('contact_viewed_by_staff', 'profile', p_profile::text);
  return jsonb_build_object('last_name', v.last_name, 'contact_phone', v.contact_phone, 'whatsapp_number', v.whatsapp_number,
                            'email', v.email, 'address', v.address, 'login_email', o.email, 'login_phone', o.phone);
end $$;
revoke execute on function public.admin_reveal_contact(uuid) from public, anon;
grant execute on function public.admin_reveal_contact(uuid) to authenticated, service_role;
