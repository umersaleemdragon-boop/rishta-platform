-- ============================================================================
-- 0300 PLANS, PAYMENTS, SUBSCRIPTIONS
-- Manual flow: user pays via JazzCash / Easypaisa / bank, uploads receipt +
-- transaction ID -> accountant approves -> subscription is created.
-- Subscriptions belong to a PROFILE (a parent pays per child).
-- ============================================================================

create table public.plans (
  id                    text primary key check (id in ('free', 'basic', 'premium')),
  rank                  smallint not null unique,
  name_en               text not null,
  name_ur               text,
  price_pkr             integer not null check (price_pkr >= 0),
  duration_days         integer not null check (duration_days >= 0),
  daily_interest_limit  integer not null check (daily_interest_limit >= 0),
  features              jsonb not null default '[]'::jsonb,
  is_active             boolean not null default true
);

insert into public.plans (id, rank, name_en, name_ur, price_pkr, duration_days, daily_interest_limit, features) values
  ('free',    0, 'Free',    'مفت',    0,    0,  0,
   '["Create your rishta profile", "Limited match previews", "Reply to interests sent to you"]'),
  ('basic',   1, 'Basic',   'بنیادی', 4000, 90, 10,
   '["Full profiles (without photos)", "Smart match suggestions", "Send interest requests", "In-app chat", "Request photos"]'),
  ('premium', 2, 'Premium', 'پریمیم', 8500, 90, 25,
   '["Everything in Basic", "Unlock phone / WhatsApp after mutual approval", "Priority listing", "Personal bureau matchmaker"]');

-- The bureau's receiving accounts, shown on the payment screen.
create table public.payment_accounts (
  id              uuid primary key default gen_random_uuid(),
  method          public.payment_method not null check (method in ('jazzcash', 'easypaisa', 'bank_transfer')),
  account_title   text not null,
  account_number  text not null,
  bank_name       text,
  iban            text,
  instructions    text,
  is_active       boolean not null default true,
  sort_order      smallint not null default 0,
  created_at      timestamptz not null default now()
);

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles (id) on delete restrict,
  submitted_by     uuid references public.app_users (id),
  plan_id          text not null references public.plans (id) check (plan_id <> 'free'),
  amount_pkr       integer not null check (amount_pkr > 0),
  method           public.payment_method not null,
  transaction_ref  text check (char_length(transaction_ref) <= 64),  -- JazzCash / Easypaisa TID or bank ref
  sender_name      text check (char_length(sender_name) <= 120),
  sender_account   text check (char_length(sender_account) <= 40),
  paid_on          date,
  receipt_path     text,       -- private "payment-receipts" bucket
  receipt_sha256   text,       -- fingerprint of the uploaded screenshot
  status           public.payment_status not null default 'pending',
  reviewed_by      uuid references public.app_users (id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  check (method in ('cash', 'card') or transaction_ref is not null)
);
create index payments_status_idx  on public.payments (status, created_at);
create index payments_profile_idx on public.payments (profile_id, created_at desc);

-- Anti-fraud: one transaction ID / one receipt image can never be used twice.
create unique index payments_unique_tid on public.payments
  (method, upper(regexp_replace(transaction_ref, '\s', '', 'g')))
  where status in ('pending', 'approved') and transaction_ref is not null;
create unique index payments_unique_receipt on public.payments (receipt_sha256)
  where status in ('pending', 'approved') and receipt_sha256 is not null;

create table public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  plan_id       text not null references public.plans (id) check (plan_id <> 'free'),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  payment_id    uuid unique references public.payments (id),
  granted_by    uuid references public.app_users (id),
  note          text,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index subscriptions_profile_idx on public.subscriptions (profile_id, ends_at desc);

-- Current plan of a profile: highest-ranked active subscription, else 'free'.
create function private.profile_tier(p_profile uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select s.plan_id
      from public.subscriptions s
      join public.plans pl on pl.id = s.plan_id
     where s.profile_id = p_profile
       and s.cancelled_at is null
       and now() >= s.starts_at and now() < s.ends_at
     order by pl.rank desc
     limit 1), 'free')
$$;

create function private.tier_rank(p_profile uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select rank from public.plans where id = private.profile_tier(p_profile)
$$;

-- Creates the subscription for an approved payment. Renewals of the same plan
-- are stacked after the current end date so no paid days are lost.
create function private.activate_subscription(p_payment uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pay   public.payments;
  v_plan  public.plans;
  v_start timestamptz;
  v_id    uuid;
begin
  select * into v_pay from public.payments where id = p_payment;
  select * into v_plan from public.plans where id = v_pay.plan_id;

  select greatest(now(), coalesce(max(ends_at), now())) into v_start
    from public.subscriptions
   where profile_id = v_pay.profile_id and plan_id = v_pay.plan_id
     and cancelled_at is null and ends_at > now();

  insert into public.subscriptions (profile_id, plan_id, starts_at, ends_at, payment_id, granted_by)
  values (v_pay.profile_id, v_pay.plan_id, v_start, v_start + make_interval(days => v_plan.duration_days),
          p_payment, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
