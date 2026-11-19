-- ============================================================================
-- 0600 USER ACTIONS (RPC functions called by the app via supabase.rpc()).
-- Every function checks: who is calling, which profile they act for, the
-- profile's plan, blocks, and state transitions. Error codes (exception
-- messages) are stable strings the app translates:
--   not_authorized, not_found, upgrade_required (hint = plan), profile_not_active,
--   daily_limit_reached, contact_policy_restricted, contact_info_not_allowed,
--   interest_already_exists, already_connected, invalid_state, conversation_closed,
--   already_requested, duplicate_transaction, invalid_input
-- ============================================================================

-- Public bureau settings (office phone, WhatsApp, address) shown in the app.
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('bureau_contact', '{"name": "Rishta Bureau", "phone": "", "whatsapp": "", "address": "", "office_hours": ""}');

-- ------------------------------------------------------------- helpers ----
create function private.get_conversation_for(p_conversation uuid, p_profile uuid)
returns public.conversations
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.conversations;
begin
  perform private.require_manage(p_profile);
  select * into v from public.conversations where id = p_conversation;
  if v.id is null or p_profile not in (v.profile_a, v.profile_b) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v;
end $$;

create function private.other_party(v public.conversations, p_me uuid) returns uuid
language sql immutable as $$ select case when v.profile_a = p_me then v.profile_b else v.profile_a end $$;

create function private.post_system_message(p_conversation uuid, p_type text, p_meta jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.messages (conversation_id, sender_profile_id, kind, body, metadata)
  values (p_conversation, null, 'system', p_type, coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('type', p_type));
  update public.conversations set last_message_at = now() where id = p_conversation;
$$;

-- Paid, or an offline bureau client (bureau handles them).
create function private.is_paid_or_bureau(p_profile uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select private.tier_rank(p_profile) >= 1
      or exists (select 1 from public.profiles where id = p_profile and source = 'bureau_offline')
$$;

-- Ends a connection: closes the chat, revokes photo + contact access both ways,
-- withdraws pending interests and requests.
create function private.close_connection(a uuid, b uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_conv uuid;
begin
  update public.conversations
     set closed_at = coalesce(closed_at, now()), stage = 'closed'
   where profile_a = least(a, b) and profile_b = greatest(a, b) and closed_at is null
  returning id into v_conv;
  if v_conv is not null then
    perform private.post_system_message(v_conv, 'conversation_closed', jsonb_build_object('reason', p_reason));
  end if;

  update public.photo_access set status = 'revoked', revoked_at = now()
   where status = 'approved' and ((owner_profile_id = a and viewer_profile_id = b) or (owner_profile_id = b and viewer_profile_id = a));
  update public.photo_access set status = 'declined', responded_at = now()
   where status = 'pending' and ((owner_profile_id = a and viewer_profile_id = b) or (owner_profile_id = b and viewer_profile_id = a));
  update public.contact_shares set status = 'revoked', revoked_at = now()
   where status = 'approved' and ((owner_profile_id = a and viewer_profile_id = b) or (owner_profile_id = b and viewer_profile_id = a));
  update public.contact_shares set status = 'declined', responded_at = now()
   where status = 'pending' and ((owner_profile_id = a and viewer_profile_id = b) or (owner_profile_id = b and viewer_profile_id = a));
  update public.interests set status = 'withdrawn', responded_at = now()
   where status = 'pending' and ((sender_profile_id = a and receiver_profile_id = b) or (sender_profile_id = b and receiver_profile_id = a));
  update public.meetings set status = 'cancelled'
   where conversation_id = v_conv and status in ('requested', 'scheduled');
end $$;

-- =========================================================== entitlements ===
create function public.my_entitlements(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tier text; v_plan public.plans; v_sent int; v_ends timestamptz;
begin
  if not private.can_read_as(p_profile) then raise exception 'not_authorized' using errcode = '42501'; end if;
  v_tier := private.profile_tier(p_profile);
  select * into v_plan from public.plans where id = v_tier;
  select count(*) into v_sent from public.interests
   where sender_profile_id = p_profile and created_at > now() - interval '24 hours';
  select max(ends_at) into v_ends from public.subscriptions
   where profile_id = p_profile and plan_id = v_tier and cancelled_at is null and ends_at > now();
  return jsonb_build_object(
    'tier', v_tier,
    'plan_ends_at', v_ends,
    'daily_interest_limit', v_plan.daily_interest_limit,
    'interests_sent_24h', v_sent,
    'can_browse_full_profiles', v_plan.rank >= 1,
    'can_send_interest', v_plan.rank >= 1,
    'can_start_chat', v_plan.rank >= 1,
    'can_reply_to_interests', true,
    'can_request_photos', v_plan.rank >= 1,
    'can_unlock_contacts', v_tier = 'premium',
    'has_bureau_assistance', v_tier = 'premium'
  );
end $$;

-- ============================================================ interests ===
create function public.send_interest(p_from uuid, p_to uuid, p_message text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_from public.profiles; v_to public.profiles; v_limit int; v_sent int; v_id uuid;
begin
  perform private.require_manage(p_from);
  select * into v_from from public.profiles where id = p_from;
  select * into v_to   from public.profiles where id = p_to;

  if v_from.status <> 'active' then raise exception 'profile_not_active' using errcode = 'P0001'; end if;
  if v_to.id is null or v_to.status <> 'active' or not v_to.listing_consent or v_to.gender = v_from.gender
     or private.is_blocked_between(p_from, p_to) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.is_paid_or_bureau(p_from) then
    raise exception 'upgrade_required' using errcode = 'P0001', hint = 'basic';
  end if;
  if (v_to.contact_policy = 'verified_only' and v_from.verification_level < 'cnic')
  or (v_to.contact_policy = 'premium_only'  and private.profile_tier(p_from) <> 'premium' and v_from.source <> 'bureau_offline') then
    raise exception 'contact_policy_restricted' using errcode = 'P0001';
  end if;

  v_limit := case when v_from.source = 'bureau_offline' then 25
                  else (select daily_interest_limit from public.plans where id = private.profile_tier(p_from)) end;
  select count(*) into v_sent from public.interests
   where sender_profile_id = p_from and created_at > now() - interval '24 hours';
  if v_sent >= v_limit then raise exception 'daily_limit_reached' using errcode = 'P0001'; end if;

  if private.contains_contact_info(p_message) then
    raise exception 'contact_info_not_allowed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.conversations
              where profile_a = least(p_from, p_to) and profile_b = greatest(p_from, p_to) and closed_at is null) then
    raise exception 'already_connected' using errcode = 'P0001';
  end if;

  begin
    insert into public.interests (sender_profile_id, receiver_profile_id, message)
    values (p_from, p_to, nullif(trim(p_message), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'interest_already_exists' using errcode = 'P0001';
  end;

  perform private.notify_profile(p_to, 'interest_received', jsonb_build_object('interest_id', v_id, 'from_profile_id', p_from));
  return v_id;
end $$;

-- Free users CAN accept / decline (business rule: free users may reply to paid users).
create function public.respond_interest(p_interest uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_i public.interests; v_conv uuid;
begin
  select * into v_i from public.interests where id = p_interest for update;
  if v_i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.require_manage(v_i.receiver_profile_id);
  if v_i.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if private.is_blocked_between(v_i.sender_profile_id, v_i.receiver_profile_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not p_accept then
    update public.interests set status = 'declined', responded_at = now() where id = p_interest;
    perform private.notify_profile(v_i.sender_profile_id, 'interest_declined', jsonb_build_object('interest_id', p_interest));
    return null;
  end if;

  update public.interests set status = 'accepted', responded_at = now() where id = p_interest;
  insert into public.conversations (profile_a, profile_b, interest_id)
  values (least(v_i.sender_profile_id, v_i.receiver_profile_id), greatest(v_i.sender_profile_id, v_i.receiver_profile_id), p_interest)
  on conflict (profile_a, profile_b) do update
     set closed_at = null, stage = 'chatting', interest_id = excluded.interest_id,
         a_confirmed_at = null, b_confirmed_at = null
  returning id into v_conv;

  perform private.post_system_message(v_conv, 'interest_accepted', jsonb_build_object('interest_id', p_interest));
  perform private.notify_profile(v_i.sender_profile_id, 'interest_accepted',
                                 jsonb_build_object('interest_id', p_interest, 'conversation_id', v_conv));
  return v_conv;
end $$;

create function public.withdraw_interest(p_interest uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.interests;
begin
  select * into v_i from public.interests where id = p_interest for update;
  if v_i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.require_manage(v_i.sender_profile_id);
  if v_i.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.interests set status = 'withdrawn', responded_at = now() where id = p_interest;
end $$;

-- Inbox lists with the other side's basic card (profiles table itself is private).
create function public.list_interests(p_profile uuid, p_direction text default 'received')
returns table (
  interest_id uuid, status public.interest_status, message text, created_at timestamptz,
  other_profile_id uuid, other_public_code text, other_first_name text, other_age int, other_city text,
  other_education public.education_level, other_profession text, other_verification public.verification_level
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not private.can_read_as(p_profile) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_direction not in ('received', 'sent') then raise exception 'invalid_input' using errcode = '22023'; end if;
  return query
  select i.id, i.status, i.message, i.created_at,
         o.id, o.public_code, o.first_name, private.age_years(o.date_of_birth), o.city,
         o.education_level, o.profession, o.verification_level
    from public.interests i
    join public.profiles o on o.id = case when p_direction = 'received' then i.sender_profile_id else i.receiver_profile_id end
   where (case when p_direction = 'received' then i.receiver_profile_id else i.sender_profile_id end) = p_profile
     and not private.is_blocked_between(p_profile, o.id)
   order by i.created_at desc
   limit 200;
end $$;

-- ================================================================= chat ===
create function public.list_conversations(p_profile uuid)
returns table (
  conversation_id uuid, stage public.connection_stage, closed_at timestamptz, last_message_at timestamptz,
  last_message text, last_message_kind public.message_kind, unread_count int,
  other_profile_id uuid, other_public_code text, other_first_name text, other_age int, other_city text,
  other_verification public.verification_level, i_can_see_their_photos boolean, they_can_see_my_photos boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not private.can_read_as(p_profile) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  select c.id, c.stage, c.closed_at, c.last_message_at,
         lm.body, lm.kind,
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_profile_id is distinct from p_profile
             and m.created_at > coalesce(case when c.profile_a = p_profile then c.a_last_read_at else c.b_last_read_at end, '-infinity')),
         o.id, o.public_code, o.first_name, private.age_years(o.date_of_birth), o.city, o.verification_level,
         private.has_photo_access(o.id, p_profile), private.has_photo_access(p_profile, o.id)
    from public.conversations c
    join public.profiles o on o.id = private.other_party(c, p_profile)
    left join lateral (select m.body, m.kind from public.messages m
                        where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
   where p_profile in (c.profile_a, c.profile_b)
   order by coalesce(c.last_message_at, c.created_at) desc;
end $$;

create function public.send_message(p_conversation uuid, p_from uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations; v_id uuid;
begin
  v := private.get_conversation_for(p_conversation, p_from);
  if v.closed_at is not null or private.is_blocked_between(v.profile_a, v.profile_b) then
    raise exception 'conversation_closed' using errcode = 'P0001';
  end if;
  -- chat is allowed while at least ONE side has a paid plan
  if not (private.is_paid_or_bureau(v.profile_a) or private.is_paid_or_bureau(v.profile_b)) then
    raise exception 'upgrade_required' using errcode = 'P0001', hint = 'basic';
  end if;
  if p_body is null or char_length(trim(p_body)) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if private.contains_contact_info(p_body) then
    raise exception 'contact_info_not_allowed' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_profile_id, kind, body)
  values (p_conversation, p_from, 'text', trim(p_body))
  returning id into v_id;

  update public.conversations
     set last_message_at = now(),
         a_last_read_at = case when profile_a = p_from then now() else a_last_read_at end,
         b_last_read_at = case when profile_b = p_from then now() else b_last_read_at end
   where id = p_conversation;
  return v_id;
end $$;

create function public.mark_conversation_read(p_conversation uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations;
begin
  v := private.get_conversation_for(p_conversation, p_profile);
  update public.conversations
     set a_last_read_at = case when profile_a = p_profile then now() else a_last_read_at end,
         b_last_read_at = case when profile_b = p_profile then now() else b_last_read_at end
   where id = p_conversation;
end $$;

create function public.close_conversation(p_conversation uuid, p_by uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations;
begin
  v := private.get_conversation_for(p_conversation, p_by);
  perform private.close_connection(v.profile_a, v.profile_b, 'closed_by_participant');
end $$;

-- ======================================================== photo privacy ===
create function public.request_photo_access(p_conversation uuid, p_from uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations; v_owner uuid; v_id uuid;
begin
  v := private.get_conversation_for(p_conversation, p_from);
  if v.closed_at is not null then raise exception 'conversation_closed' using errcode = 'P0001'; end if;
  if not private.is_paid_or_bureau(p_from) then
    raise exception 'upgrade_required' using errcode = 'P0001', hint = 'basic';
  end if;
  v_owner := private.other_party(v, p_from);
  begin
    insert into public.photo_access (owner_profile_id, viewer_profile_id, conversation_id)
    values (v_owner, p_from, p_conversation) returning id into v_id;
  exception when unique_violation then
    raise exception 'already_requested' using errcode = 'P0001';
  end;
  perform private.post_system_message(p_conversation, 'photo_requested', jsonb_build_object('request_id', v_id, 'by', p_from));
  perform private.notify_profile(v_owner, 'photo_requested', jsonb_build_object('request_id', v_id, 'conversation_id', p_conversation));
  return v_id;
end $$;

create function public.respond_photo_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.photo_access;
begin
  select * into r from public.photo_access where id = p_request for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.require_manage(r.owner_profile_id);
  if r.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.photo_access
     set status = case when p_approve then 'approved'::public.access_status else 'declined'::public.access_status end,
         responded_at = now()
   where id = p_request;
  if r.conversation_id is not null then
    perform private.post_system_message(r.conversation_id,
      case when p_approve then 'photo_request_approved' else 'photo_request_declined' end,
      jsonb_build_object('request_id', p_request));
  end if;
  perform private.notify_profile(r.viewer_profile_id,
    case when p_approve then 'photo_request_approved' else 'photo_request_declined' end,
    jsonb_build_object('request_id', p_request, 'conversation_id', r.conversation_id));
end $$;

-- Owner shares photos without waiting for a request.
create function public.share_photos(p_conversation uuid, p_owner uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations; v_viewer uuid;
begin
  v := private.get_conversation_for(p_conversation, p_owner);
  if v.closed_at is not null then raise exception 'conversation_closed' using errcode = 'P0001'; end if;
  v_viewer := private.other_party(v, p_owner);
  if private.has_photo_access(p_owner, v_viewer) then return; end if;
  update public.photo_access set status = 'approved', responded_at = now()
   where owner_profile_id = p_owner and viewer_profile_id = v_viewer and status = 'pending';
  if not found then
    insert into public.photo_access (owner_profile_id, viewer_profile_id, conversation_id, status, responded_at)
    values (p_owner, v_viewer, p_conversation, 'approved', now());
  end if;
  perform private.post_system_message(p_conversation, 'photos_shared', jsonb_build_object('by', p_owner));
  perform private.notify_profile(v_viewer, 'photo_request_approved', jsonb_build_object('conversation_id', p_conversation));
end $$;

create function public.revoke_photo_access(p_owner uuid, p_viewer uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.photo_access;
begin
  perform private.require_manage(p_owner);
  update public.photo_access set status = 'revoked', revoked_at = now()
   where owner_profile_id = p_owner and viewer_profile_id = p_viewer and status = 'approved'
  returning * into r;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.conversation_id is not null then
    perform private.post_system_message(r.conversation_id, 'photo_access_revoked', jsonb_build_object('by', p_owner));
  end if;
end $$;

-- Which photo files may the caller see? Used by the "photo-urls" Edge Function,
-- which then signs short-lived (60s) URLs with the service role.
--   p_viewer = null -> caller's own profile photos (incl. pending ones)
create function public.get_photo_paths(p_owner uuid, p_viewer uuid default null)
returns table (photo_id uuid, storage_path text, is_primary boolean, sort_order smallint, status public.review_status)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if p_viewer is null then
    if not (private.can_read_as(p_owner) or private.is_staff()) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    return query select id, storage_path, is_primary, sort_order, status
                   from public.profile_photos where profile_id = p_owner and status <> 'rejected'
                  order by is_primary desc, sort_order;
    return;
  end if;
  if not private.can_read_as(p_viewer) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not private.has_photo_access(p_owner, p_viewer) then raise exception 'photo_access_required' using errcode = '42501'; end if;
  return query select id, storage_path, is_primary, sort_order, status
                 from public.profile_photos where profile_id = p_owner and status = 'approved'
                order by is_primary desc, sort_order;
end $$;

-- ===================================================== contact sharing ===
create function public.request_contact(p_conversation uuid, p_from uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations; v_owner uuid; v_id uuid;
begin
  v := private.get_conversation_for(p_conversation, p_from);
  if v.closed_at is not null then raise exception 'conversation_closed' using errcode = 'P0001'; end if;
  if private.profile_tier(p_from) <> 'premium' then
    raise exception 'upgrade_required' using errcode = 'P0001', hint = 'premium';
  end if;
  v_owner := private.other_party(v, p_from);
  begin
    insert into public.contact_shares (owner_profile_id, viewer_profile_id, conversation_id)
    values (v_owner, p_from, p_conversation) returning id into v_id;
  exception when unique_violation then
    raise exception 'already_requested' using errcode = 'P0001';
  end;
  perform private.post_system_message(p_conversation, 'contact_requested', jsonb_build_object('request_id', v_id, 'by', p_from));
  perform private.notify_profile(v_owner, 'contact_requested', jsonb_build_object('request_id', v_id, 'conversation_id', p_conversation));
  return v_id;
end $$;

create function public.respond_contact_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.contact_shares;
begin
  select * into r from public.contact_shares where id = p_request for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.require_manage(r.owner_profile_id);
  if r.status <> 'pending' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.contact_shares
     set status = case when p_approve then 'approved'::public.access_status else 'declined'::public.access_status end,
         responded_at = now()
   where id = p_request;
  if r.conversation_id is not null then
    perform private.post_system_message(r.conversation_id,
      case when p_approve then 'contact_shared' else 'contact_request_declined' end, jsonb_build_object('request_id', p_request));
  end if;
  perform private.notify_profile(r.viewer_profile_id,
    case when p_approve then 'contact_shared' else 'contact_request_declined' end,
    jsonb_build_object('request_id', p_request, 'conversation_id', r.conversation_id));
end $$;

-- Premium + approved share -> phone / WhatsApp. Offline clients -> bureau's number.
create function public.get_contact_details(p_viewer uuid, p_owner uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_owner public.profiles; v_priv public.profile_private;
begin
  if not private.can_read_as(p_viewer) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if private.profile_tier(p_viewer) <> 'premium' then
    raise exception 'upgrade_required' using errcode = 'P0001', hint = 'premium';
  end if;
  if private.is_blocked_between(p_viewer, p_owner) or not exists (
       select 1 from public.contact_shares
        where owner_profile_id = p_owner and viewer_profile_id = p_viewer and status = 'approved') then
    raise exception 'contact_not_shared' using errcode = '42501';
  end if;
  select * into v_owner from public.profiles where id = p_owner;
  perform private.log_audit('contact_revealed', 'profile', p_owner::text, jsonb_build_object('viewer', p_viewer));
  if v_owner.source = 'bureau_offline' then
    return jsonb_build_object('via_bureau', true,
                              'bureau', (select value from public.app_settings where key = 'bureau_contact'));
  end if;
  select * into v_priv from public.profile_private where profile_id = p_owner;
  return jsonb_build_object('via_bureau', false, 'first_name', v_owner.first_name, 'last_name', v_priv.last_name,
                            'phone', v_priv.contact_phone, 'whatsapp', v_priv.whatsapp_number);
end $$;

-- ============================================================ meetings ===
create function public.propose_meeting(
  p_conversation uuid, p_from uuid, p_type public.meeting_type, p_when timestamptz,
  p_location text default null, p_video_link text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations; v_id uuid;
begin
  v := private.get_conversation_for(p_conversation, p_from);
  if v.closed_at is not null then raise exception 'conversation_closed' using errcode = 'P0001'; end if;
  if p_when <= now() then raise exception 'invalid_input' using errcode = '22023', hint = 'Meeting time must be in the future.'; end if;
  if private.contains_contact_info(p_notes) or private.contains_contact_info(p_location) then
    raise exception 'contact_info_not_allowed' using errcode = 'P0001';
  end if;
  insert into public.meetings (conversation_id, proposed_by_profile_id, meeting_type, scheduled_for, location, video_link, notes)
  values (p_conversation, p_from, p_type, p_when, p_location, p_video_link, p_notes)
  returning id into v_id;
  update public.conversations set stage = 'meeting_planned' where id = p_conversation and stage = 'chatting';
  perform private.post_system_message(p_conversation, 'meeting_proposed',
    jsonb_build_object('meeting_id', v_id, 'meeting_type', p_type, 'scheduled_for', p_when));
  perform private.notify_profile(private.other_party(v, p_from), 'meeting_proposed',
    jsonb_build_object('meeting_id', v_id, 'conversation_id', p_conversation));
  return v_id;
end $$;

create function public.respond_meeting(p_meeting uuid, p_by uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.meetings; v public.conversations;
begin
  select * into m from public.meetings where id = p_meeting for update;
  if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v := private.get_conversation_for(m.conversation_id, p_by);
  if m.proposed_by_profile_id = p_by or m.status <> 'requested' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  update public.meetings
     set status = case when p_accept then 'scheduled'::public.meeting_status else 'declined'::public.meeting_status end,
         responded_at = now()
   where id = p_meeting;
  perform private.post_system_message(m.conversation_id,
    case when p_accept then 'meeting_scheduled' else 'meeting_declined' end, jsonb_build_object('meeting_id', p_meeting));
  perform private.notify_profile(m.proposed_by_profile_id,
    case when p_accept then 'meeting_scheduled' else 'meeting_declined' end,
    jsonb_build_object('meeting_id', p_meeting, 'conversation_id', m.conversation_id));
end $$;

create function public.cancel_meeting(p_meeting uuid, p_by uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.meetings; v public.conversations;
begin
  select * into m from public.meetings where id = p_meeting for update;
  if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v := private.get_conversation_for(m.conversation_id, p_by);
  if m.status not in ('requested', 'scheduled') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.meetings set status = 'cancelled' where id = p_meeting;
  perform private.post_system_message(m.conversation_id, 'meeting_cancelled', jsonb_build_object('meeting_id', p_meeting, 'by', p_by));
  perform private.notify_profile(private.other_party(v, p_by), 'meeting_cancelled',
    jsonb_build_object('meeting_id', p_meeting, 'conversation_id', m.conversation_id));
end $$;

create function public.complete_meeting(p_meeting uuid, p_by uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.meetings; v public.conversations;
begin
  select * into m from public.meetings where id = p_meeting for update;
  if m.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v := private.get_conversation_for(m.conversation_id, p_by);
  if m.status <> 'scheduled' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  update public.meetings set status = 'completed', outcome_note = p_note where id = p_meeting;
  perform private.post_system_message(m.conversation_id, 'meeting_completed', jsonb_build_object('meeting_id', p_meeting));
end $$;

-- Both families must confirm. When both have, both profiles are marked
-- 'matched' and hidden from search.
create function public.confirm_rishta(p_conversation uuid, p_by uuid) returns public.connection_stage
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations;
begin
  v := private.get_conversation_for(p_conversation, p_by);
  if v.closed_at is not null then raise exception 'conversation_closed' using errcode = 'P0001'; end if;
  if v.stage in ('rishta_confirmed', 'engaged', 'married') then return v.stage; end if;

  update public.conversations
     set a_confirmed_at = case when profile_a = p_by then coalesce(a_confirmed_at, now()) else a_confirmed_at end,
         b_confirmed_at = case when profile_b = p_by then coalesce(b_confirmed_at, now()) else b_confirmed_at end
   where id = p_conversation
  returning * into v;

  if v.a_confirmed_at is not null and v.b_confirmed_at is not null then
    update public.conversations set stage = 'rishta_confirmed' where id = p_conversation;
    perform set_config('app.trusted', 'on', true);
    update public.profiles set status = 'matched' where id in (v.profile_a, v.profile_b) and status in ('active', 'paused');
    perform set_config('app.trusted', 'off', true);
    perform private.post_system_message(p_conversation, 'rishta_confirmed');
    perform private.notify_profile(v.profile_a, 'rishta_confirmed', jsonb_build_object('conversation_id', p_conversation));
    perform private.notify_profile(v.profile_b, 'rishta_confirmed', jsonb_build_object('conversation_id', p_conversation));
    insert into public.notifications (user_id, type, data)
    values (null, 'rishta_confirmed', jsonb_build_object('conversation_id', p_conversation, 'profiles', jsonb_build_array(v.profile_a, v.profile_b)));
    perform private.log_audit('rishta_confirmed', 'conversation', p_conversation::text);
    return 'rishta_confirmed';
  end if;

  perform private.post_system_message(p_conversation, 'rishta_confirmation_pending', jsonb_build_object('by', p_by));
  perform private.notify_profile(private.other_party(v, p_by), 'rishta_confirmation_requested',
                                 jsonb_build_object('conversation_id', p_conversation));
  return v.stage;
end $$;

-- rishta_confirmed -> engaged -> married
create function public.update_connection_stage(p_conversation uuid, p_by uuid, p_stage public.connection_stage) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversations;
begin
  v := private.get_conversation_for(p_conversation, p_by);
  if not ((v.stage = 'rishta_confirmed' and p_stage = 'engaged')
       or (v.stage in ('rishta_confirmed', 'engaged') and p_stage = 'married')) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  update public.conversations set stage = p_stage where id = p_conversation;
  perform private.post_system_message(p_conversation, 'stage_' || p_stage::text);
  perform private.log_audit('connection_stage_' || p_stage::text, 'conversation', p_conversation::text);
end $$;

-- ===================================================== safety & reports ===
create function public.block_profile(p_from uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_manage(p_from);
  if p_from = p_target then raise exception 'invalid_input' using errcode = '22023'; end if;
  insert into public.blocks (blocker_profile_id, blocked_profile_id) values (p_from, p_target) on conflict do nothing;
  perform private.close_connection(p_from, p_target, 'blocked');
end $$;

create function public.report_profile(
  p_from uuid, p_target uuid, p_reason public.report_reason, p_details text default null, p_conversation uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform private.require_manage(p_from);
  if p_conversation is not null then perform private.get_conversation_for(p_conversation, p_from); end if;
  insert into public.reports (reporter_profile_id, reported_profile_id, conversation_id, reason, details)
  values (p_from, p_target, p_conversation, p_reason, p_details) returning id into v_id;
  insert into public.notifications (user_id, profile_id, type, data)
  values (null, p_target, 'report_filed', jsonb_build_object('report_id', v_id, 'reason', p_reason));
  return v_id;
end $$;

-- ================================================ payments & verification ===
create function public.submit_payment(
  p_profile uuid, p_plan text, p_method public.payment_method, p_transaction_ref text,
  p_receipt_path text, p_receipt_sha256 text default null,
  p_sender_name text default null, p_sender_account text default null, p_paid_on date default current_date
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plan public.plans; v_id uuid;
begin
  perform private.require_manage(p_profile);
  select * into v_plan from public.plans where id = p_plan and is_active and id <> 'free';
  if v_plan.id is null then raise exception 'invalid_input' using errcode = '22023', hint = 'Unknown plan.'; end if;
  if p_method not in ('jazzcash', 'easypaisa', 'bank_transfer') then
    raise exception 'invalid_input' using errcode = '22023', hint = 'Use JazzCash, Easypaisa or bank transfer.';
  end if;
  if coalesce(trim(p_transaction_ref), '') = '' then
    raise exception 'invalid_input' using errcode = '22023', hint = 'Transaction ID is required.';
  end if;
  if p_receipt_path is null or p_receipt_path not like p_profile::text || '/%' then
    raise exception 'invalid_input' using errcode = '22023', hint = 'Receipt upload is required.';
  end if;
  begin
    insert into public.payments (profile_id, submitted_by, plan_id, amount_pkr, method, transaction_ref,
                                 sender_name, sender_account, paid_on, receipt_path, receipt_sha256)
    values (p_profile, auth.uid(), p_plan, v_plan.price_pkr, p_method, trim(p_transaction_ref),
            p_sender_name, p_sender_account, p_paid_on, p_receipt_path, p_receipt_sha256)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'duplicate_transaction' using errcode = 'P0001';
  end;
  insert into public.notifications (user_id, profile_id, type, data)
  values (null, p_profile, 'payment_submitted', jsonb_build_object('payment_id', v_id, 'plan', p_plan));
  return v_id;
end $$;

create function public.submit_verification(
  p_profile uuid, p_cnic_front_path text, p_cnic_back_path text, p_selfie_path text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_prefix text := p_profile::text || '/%';
begin
  perform private.require_manage(p_profile);
  if p_cnic_front_path not like v_prefix or p_cnic_back_path not like v_prefix or p_selfie_path not like v_prefix then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  begin
    insert into public.verification_requests (profile_id, level, cnic_front_path, cnic_back_path, selfie_path, submitted_by)
    values (p_profile, 'cnic', p_cnic_front_path, p_cnic_back_path, p_selfie_path, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_requested' using errcode = 'P0001';
  end;
  insert into public.notifications (user_id, profile_id, type, data)
  values (null, p_profile, 'verification_submitted', jsonb_build_object('request_id', v_id));
  return v_id;
end $$;

-- p_interested null = just mark as viewed
create function public.respond_bureau_suggestion(p_suggestion uuid, p_interested boolean default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.bureau_suggestions;
begin
  select * into s from public.bureau_suggestions where id = p_suggestion for update;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.require_manage(s.profile_id);
  update public.bureau_suggestions
     set status = case when p_interested is null then (case when status = 'sent' then 'viewed'::public.suggestion_status else status end)
                       when p_interested then 'interested'::public.suggestion_status
                       else 'not_interested'::public.suggestion_status end,
         responded_at = case when p_interested is null then responded_at else now() end
   where id = p_suggestion;
  if p_interested is not null then
    insert into public.notifications (user_id, profile_id, type, data)
    values (null, s.profile_id, 'suggestion_response',
            jsonb_build_object('suggestion_id', p_suggestion, 'interested', p_interested, 'suggested_profile_id', s.suggested_profile_id));
  end if;
end $$;
