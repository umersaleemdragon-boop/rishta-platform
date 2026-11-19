-- ============================================================================
-- 0400 CONNECTIONS: blocks, reports, interests, conversations, messages,
-- photo access, contact sharing, meetings, bureau suggestions, notifications.
-- All writes go through public.* RPC functions (0600), never direct inserts.
-- ============================================================================

create table public.blocks (
  blocker_profile_id uuid not null references public.profiles (id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id)
);
create index blocks_blocked_idx on public.blocks (blocked_profile_id);

create table public.reports (
  id                  uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles (id) on delete cascade,
  reported_profile_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id     uuid,
  reason              public.report_reason not null,
  details             text check (char_length(details) <= 2000),
  status              public.report_status not null default 'open',
  handled_by          uuid references public.app_users (id),
  handled_at          timestamptz,
  resolution_note     text,
  created_at          timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at);

create table public.interests (
  id                  uuid primary key default gen_random_uuid(),
  sender_profile_id   uuid not null references public.profiles (id) on delete cascade,
  receiver_profile_id uuid not null references public.profiles (id) on delete cascade,
  message             text check (char_length(message) <= 300),
  status              public.interest_status not null default 'pending',
  created_at          timestamptz not null default now(),
  responded_at        timestamptz,
  check (sender_profile_id <> receiver_profile_id)
);
create index interests_receiver_idx on public.interests (receiver_profile_id, status, created_at desc);
create index interests_sender_idx   on public.interests (sender_profile_id, created_at desc);
-- only one pending interest per pair (either direction)
create unique index interests_one_pending_per_pair on public.interests
  (least(sender_profile_id, receiver_profile_id), greatest(sender_profile_id, receiver_profile_id))
  where status = 'pending';

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  profile_a        uuid not null references public.profiles (id) on delete cascade,
  profile_b        uuid not null references public.profiles (id) on delete cascade,
  interest_id      uuid references public.interests (id) on delete set null,
  stage            public.connection_stage not null default 'chatting',
  a_confirmed_at   timestamptz,   -- "Rishta confirmed" needs BOTH families
  b_confirmed_at   timestamptz,
  a_last_read_at   timestamptz,
  b_last_read_at   timestamptz,
  last_message_at  timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  check (profile_a < profile_b),
  unique (profile_a, profile_b)
);
create index conversations_b_idx on public.conversations (profile_b);

alter table public.reports add constraint reports_conversation_fk
  foreign key (conversation_id) references public.conversations (id) on delete set null;

create table public.messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations (id) on delete cascade,
  sender_profile_id uuid references public.profiles (id) on delete set null,  -- null = system message
  kind              public.message_kind not null default 'text',
  body              text not null check (char_length(body) between 1 and 2000),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- "Request Photo" permission. owner = whose photos, viewer = who may see them.
create table public.photo_access (
  id                uuid primary key default gen_random_uuid(),
  owner_profile_id  uuid not null references public.profiles (id) on delete cascade,
  viewer_profile_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id   uuid references public.conversations (id) on delete set null,
  status            public.access_status not null default 'pending',
  requested_at      timestamptz not null default now(),
  responded_at      timestamptz,
  revoked_at        timestamptz,
  check (owner_profile_id <> viewer_profile_id)
);
create unique index photo_access_one_open on public.photo_access (owner_profile_id, viewer_profile_id)
  where status in ('pending', 'approved');
create index photo_access_viewer_idx on public.photo_access (viewer_profile_id);

-- Premium: phone / WhatsApp sharing after the owner approves.
create table public.contact_shares (
  id                uuid primary key default gen_random_uuid(),
  owner_profile_id  uuid not null references public.profiles (id) on delete cascade,
  viewer_profile_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id   uuid references public.conversations (id) on delete set null,
  status            public.access_status not null default 'pending',
  requested_at      timestamptz not null default now(),
  responded_at      timestamptz,
  revoked_at        timestamptz,
  check (owner_profile_id <> viewer_profile_id)
);
create unique index contact_shares_one_open on public.contact_shares (owner_profile_id, viewer_profile_id)
  where status in ('pending', 'approved');

create table public.meetings (
  id                     uuid primary key default gen_random_uuid(),
  conversation_id        uuid not null references public.conversations (id) on delete cascade,
  proposed_by_profile_id uuid not null references public.profiles (id) on delete cascade,
  meeting_type           public.meeting_type not null,
  scheduled_for          timestamptz not null,
  location               text check (char_length(location) <= 300),   -- in-person address / venue
  video_link             text check (char_length(video_link) <= 500),
  notes                  text check (char_length(notes) <= 1000),
  status                 public.meeting_status not null default 'requested',
  responded_at           timestamptz,
  outcome_note           text check (char_length(outcome_note) <= 1000),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index meetings_conversation_idx on public.meetings (conversation_id, scheduled_for);
create index meetings_upcoming_idx on public.meetings (status, scheduled_for);
create trigger meetings_updated_at before update on public.meetings
  for each row execute function private.set_updated_at();

-- Matches hand-picked by bureau staff.
create table public.bureau_suggestions (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null references public.profiles (id) on delete cascade,  -- recipient
  suggested_profile_id  uuid not null references public.profiles (id) on delete cascade,
  suggested_by          uuid references public.app_users (id),
  note                  text check (char_length(note) <= 1000),
  status                public.suggestion_status not null default 'sent',
  created_at            timestamptz not null default now(),
  responded_at          timestamptz,
  check (profile_id <> suggested_profile_id),
  unique (profile_id, suggested_profile_id)
);

-- In-app notifications (push / WhatsApp delivery is added in Step 9).
-- user_id null = goes to the bureau staff inbox (e.g. for offline clients).
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.app_users (id) on delete cascade,
  profile_id  uuid references public.profiles (id) on delete cascade,
  type        text not null,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_staff_inbox_idx on public.notifications (created_at desc) where user_id is null;

-- ------------------------------------------------------------- helpers ----
create function private.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.blocks
                  where (blocker_profile_id = a and blocked_profile_id = b)
                     or (blocker_profile_id = b and blocked_profile_id = a))
$$;

create function private.can_view_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conversation
       and (private.is_profile_member(c.profile_a) or private.is_profile_member(c.profile_b)
            or private.can_manage_profile(c.profile_a) or private.can_manage_profile(c.profile_b)
            or private.has_staff_role(array['super_admin']::public.staff_role[]))
  )
$$;

create function private.has_photo_access(p_owner uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.photo_access
                  where owner_profile_id = p_owner and viewer_profile_id = p_viewer and status = 'approved')
     and not private.is_blocked_between(p_owner, p_viewer)
$$;

-- Sends an in-app notification to the profile owner + guardians
-- (or to the bureau staff inbox for offline clients).
create function private.notify_profile(p_profile uuid, p_type text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid; v_source public.profile_source;
begin
  select owner_user_id, source into v_owner, v_source from public.profiles where id = p_profile;
  if v_source = 'bureau_offline' or v_owner is null then
    insert into public.notifications (user_id, profile_id, type, data) values (null, p_profile, p_type, p_data);
    return;
  end if;
  insert into public.notifications (user_id, profile_id, type, data)
  select u, p_profile, p_type, p_data
    from (select v_owner as u
          union
          select g.user_id from public.profile_guardians g where g.profile_id = p_profile) t;
end $$;

-- Blocks phone numbers / emails / WhatsApp handles in chat so contact details are
-- exchanged only through the consent-based "share contact" flow.
create function private.contains_contact_info(p_text text) returns boolean
language plpgsql immutable as $$
declare
  t text := lower(coalesce(p_text, ''));
  digits text;
begin
  -- Urdu / Arabic-Indic digits -> ASCII
  t := translate(t, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  if t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then return true; end if;
  if t ~ '(whats\s*app|watsapp|wa\.me|telegram|t\.me/|instagram\.com|facebook\.com|snapchat)' then return true; end if;
  -- remove separators people use to dodge filters: spaces, dashes, dots, brackets
  digits := regexp_replace(t, '[\s\-\.\(\)\/_]', '', 'g');
  if digits ~ '(\+?92|0092|0)3[0-9]{9}' then return true; end if;   -- Pakistani mobile
  if digits ~ '[0-9]{10,}' then return true; end if;                -- any long number
  return false;
end $$;
