-- ============================================================================
-- 0800 SECURITY: Row-Level Security on EVERY table + least-privilege grants.
-- Rule of thumb: users read their own data through RLS; everything that
-- touches another person (interests, chat, photos, contacts, payments) goes
-- through the checked RPC functions in 0600/0700.
-- ============================================================================

-- ------------------------------------------------------------ enable RLS ----
alter table public.lookups               enable row level security;
alter table public.app_users             enable row level security;
alter table public.staff_members         enable row level security;
alter table public.audit_log             enable row level security;
alter table public.profiles              enable row level security;
alter table public.profile_private       enable row level security;
alter table public.profile_guardians     enable row level security;
alter table public.partner_preferences   enable row level security;
alter table public.profile_photos        enable row level security;
alter table public.verification_requests enable row level security;
alter table public.profile_notes         enable row level security;
alter table public.plans                 enable row level security;
alter table public.payment_accounts      enable row level security;
alter table public.payments              enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.blocks                enable row level security;
alter table public.reports               enable row level security;
alter table public.interests             enable row level security;
alter table public.conversations         enable row level security;
alter table public.messages              enable row level security;
alter table public.photo_access          enable row level security;
alter table public.contact_shares        enable row level security;
alter table public.meetings              enable row level security;
alter table public.bureau_suggestions    enable row level security;
alter table public.notifications         enable row level security;
alter table public.app_settings          enable row level security;

-- ------------------------------------------------------- reference data ----
create policy lookups_read  on public.lookups  for select to anon, authenticated using (true);
create policy lookups_admin on public.lookups  for all to authenticated
  using (private.has_staff_role(array['super_admin']::public.staff_role[]))
  with check (private.has_staff_role(array['super_admin']::public.staff_role[]));

create policy plans_read  on public.plans for select to anon, authenticated using (true);
create policy plans_admin on public.plans for update to authenticated
  using (private.has_staff_role(array['accountant']::public.staff_role[]))
  with check (private.has_staff_role(array['accountant']::public.staff_role[]));

create policy app_settings_read  on public.app_settings for select to anon, authenticated using (true);
create policy app_settings_admin on public.app_settings for update to authenticated
  using (private.has_staff_role(array['super_admin']::public.staff_role[]))
  with check (private.has_staff_role(array['super_admin']::public.staff_role[]));

create policy payment_accounts_read on public.payment_accounts for select to authenticated
  using (is_active or private.is_staff());
create policy payment_accounts_admin on public.payment_accounts for all to authenticated
  using (private.has_staff_role(array['accountant']::public.staff_role[]))
  with check (private.has_staff_role(array['accountant']::public.staff_role[]));

-- ---------------------------------------------------------- users/staff ----
create policy app_users_read on public.app_users for select to authenticated
  using (id = auth.uid() or private.is_staff());
create policy app_users_update_self on public.app_users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy staff_read on public.staff_members for select to authenticated
  using (user_id = auth.uid() or private.is_staff());
create policy staff_admin on public.staff_members for all to authenticated
  using (private.has_staff_role(array['super_admin']::public.staff_role[]))
  with check (private.has_staff_role(array['super_admin']::public.staff_role[]));

create policy audit_read on public.audit_log for select to authenticated
  using (private.has_staff_role(array['super_admin']::public.staff_role[]));

-- -------------------------------------------------------------- profiles ----
-- Other users NEVER read this table directly: they use search_profiles() /
-- get_profile_detail(), which apply plan limits and hide private fields.
create policy profiles_read on public.profiles for select to authenticated
  using (owner_user_id = auth.uid() or private.can_view_own_profile(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (owner_user_id = auth.uid()
              or private.has_staff_role(array['verifier', 'matchmaker']::public.staff_role[]));
create policy profiles_update on public.profiles for update to authenticated
  using (private.can_manage_profile(id) or private.has_staff_role(array['verifier', 'matchmaker']::public.staff_role[]))
  with check (private.can_manage_profile(id) or private.has_staff_role(array['verifier', 'matchmaker']::public.staff_role[]));
create policy profiles_delete on public.profiles for delete to authenticated
  using (private.has_staff_role(array['super_admin']::public.staff_role[]));

create policy profile_private_read on public.profile_private for select to authenticated
  using (private.can_view_own_profile(profile_id));
create policy profile_private_update on public.profile_private for update to authenticated
  using (private.can_manage_profile(profile_id) or private.has_staff_role(array['verifier', 'matchmaker']::public.staff_role[]))
  with check (private.can_manage_profile(profile_id) or private.has_staff_role(array['verifier', 'matchmaker']::public.staff_role[]));

create policy guardians_read on public.profile_guardians for select to authenticated
  using (user_id = auth.uid() or private.is_profile_member(profile_id) or private.is_staff());
create policy guardians_insert on public.profile_guardians for insert to authenticated
  with check (private.can_manage_profile(profile_id) or private.has_staff_role(array['matchmaker']::public.staff_role[]));
create policy guardians_delete on public.profile_guardians for delete to authenticated
  using (user_id = auth.uid() or private.can_manage_profile(profile_id) or private.has_staff_role(array['matchmaker']::public.staff_role[]));

create policy prefs_read on public.partner_preferences for select to authenticated
  using (private.can_view_own_profile(profile_id));
create policy prefs_update on public.partner_preferences for update to authenticated
  using (private.can_manage_profile(profile_id) or private.has_staff_role(array['verifier', 'matchmaker']::public.staff_role[]))
  with check (private.can_manage_profile(profile_id) or private.has_staff_role(array['verifier', 'matchmaker']::public.staff_role[]));

-- photo ROWS: owner/guardians/staff only. Other people get files only via the
-- photo-urls Edge Function after get_photo_paths() approves.
create policy photos_read on public.profile_photos for select to authenticated
  using (private.can_view_own_profile(profile_id));
create policy photos_insert on public.profile_photos for insert to authenticated
  with check (private.can_manage_profile(profile_id) or private.has_staff_role(array['verifier']::public.staff_role[]));
create policy photos_update on public.profile_photos for update to authenticated
  using (private.can_manage_profile(profile_id) or private.has_staff_role(array['verifier']::public.staff_role[]))
  with check (private.can_manage_profile(profile_id) or private.has_staff_role(array['verifier']::public.staff_role[]));
create policy photos_delete on public.profile_photos for delete to authenticated
  using (private.can_manage_profile(profile_id) or private.has_staff_role(array['verifier']::public.staff_role[]));

create policy verification_read on public.verification_requests for select to authenticated
  using (private.is_profile_member(profile_id) or private.can_manage_profile(profile_id)
         or private.has_staff_role(array['verifier']::public.staff_role[]));

create policy notes_staff on public.profile_notes for all to authenticated
  using (private.is_staff()) with check (private.is_staff() and author_id = auth.uid());

-- -------------------------------------------------------------- payments ----
create policy payments_read on public.payments for select to authenticated
  using (private.is_profile_member(profile_id) or private.can_manage_profile(profile_id)
         or private.has_staff_role(array['accountant']::public.staff_role[]));
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (private.can_view_own_profile(profile_id));

-- ----------------------------------------------------------- connections ----
create policy blocks_read on public.blocks for select to authenticated
  using (private.can_read_as(blocker_profile_id) or private.is_staff());
create policy blocks_delete on public.blocks for delete to authenticated
  using (private.can_manage_profile(blocker_profile_id));

create policy reports_read on public.reports for select to authenticated
  using (private.can_read_as(reporter_profile_id) or private.has_staff_role(array['verifier']::public.staff_role[]));

create policy interests_read on public.interests for select to authenticated
  using (private.can_read_as(sender_profile_id) or private.can_read_as(receiver_profile_id) or private.is_staff());

create policy conversations_read on public.conversations for select to authenticated
  using (private.can_view_conversation(id));
create policy messages_read on public.messages for select to authenticated
  using (private.can_view_conversation(conversation_id));
create policy meetings_read on public.meetings for select to authenticated
  using (private.can_view_conversation(conversation_id) or private.is_staff());

create policy photo_access_read on public.photo_access for select to authenticated
  using (private.can_read_as(owner_profile_id) or private.can_read_as(viewer_profile_id) or private.is_staff());
create policy contact_shares_read on public.contact_shares for select to authenticated
  using (private.can_read_as(owner_profile_id) or private.can_read_as(viewer_profile_id) or private.is_staff());

create policy suggestions_read on public.bureau_suggestions for select to authenticated
  using (private.can_read_as(profile_id) or private.is_staff());

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid() or (user_id is null and private.is_staff()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid() or (user_id is null and private.is_staff()))
  with check (user_id = auth.uid() or (user_id is null and private.is_staff()));

-- ================================================================ grants ====
-- anon (not logged in): only public reference data.
revoke all on all tables in schema public from anon;
grant select on public.lookups, public.plans, public.app_settings to anon;

-- RPC-only tables: no direct writes even if a policy were added by mistake.
revoke insert, update, delete on
  public.audit_log, public.verification_requests, public.payments, public.subscriptions,
  public.reports, public.interests, public.conversations, public.messages, public.photo_access,
  public.contact_shares, public.meetings, public.bureau_suggestions
from authenticated;
revoke insert, update on public.blocks from authenticated;
revoke insert, delete on public.profile_private, public.partner_preferences from authenticated;

-- column-level: users may only change these columns
revoke update on public.app_users from authenticated;
grant update (full_name, preferred_language) on public.app_users to authenticated;
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- functions: never callable by anon; every public RPC checks permissions itself.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- private helpers: needed inside RLS policies/triggers (schema is not exposed via the API).
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on function
  private.log_audit(text, text, text, jsonb),
  private.notify_profile(uuid, text, jsonb),
  private.post_system_message(uuid, text, jsonb),
  private.close_connection(uuid, uuid, text),
  private.activate_subscription(uuid),
  private.cnic_hash(text),
  private.handle_new_auth_user(),
  private.handle_auth_user_phone_change()
from authenticated;
