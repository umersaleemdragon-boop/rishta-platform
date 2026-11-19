# Database & Backend (Step 1)

Supabase (PostgreSQL 15+). All rules — plans, privacy, photo permissions,
anti-fraud — are enforced **inside the database**, so the web app, the Android/iOS
apps and the admin panel can never disagree or bypass them.

## Files

| File | What it contains |
|---|---|
| `supabase/migrations/…0100_foundation.sql` | enums, `app_users`, `staff_members`, `audit_log`, `lookups` |
| `…0200_profiles.sql` | `profiles`, `profile_private`, `profile_guardians`, `partner_preferences`, `profile_photos`, `verification_requests`, `profile_notes`, field-lock triggers |
| `…0300_plans_payments.sql` | `plans` (Free / Basic 4,000 / Premium 8,500, 90 days), `payment_accounts`, `payments`, `subscriptions` |
| `…0400_connections.sql` | `interests`, `conversations`, `messages`, `photo_access`, `contact_shares`, `meetings`, `bureau_suggestions`, `blocks`, `reports`, `notifications` |
| `…0500_matchmaking.sql` | scoring engine, `search_profiles`, `get_profile_detail`, `admin_top_matches` |
| `…0600_user_actions.sql` | every user action (RPC functions) |
| `…0700_admin.sql` | staff actions, WhatsApp/Excel import, dashboard stats, nightly job |
| `…0800_security.sql` | Row-Level Security policies on all 26 tables + grants |
| `…0900_storage_realtime_cron.sql` | private storage buckets, realtime, nightly schedule, city/sect/caste lists |
| `supabase/seed.sql` | demo staff + demo profiles (local development only) |
| `supabase/tests/local/` | end-to-end test suite (runs on plain PostgreSQL) |

## Core ideas

**Accounts vs profiles.** A login (`app_users`) can manage up to 5 rishta
`profiles` — e.g. a mother managing two children. Subscriptions belong to a
profile. Extra family logins can be attached as **guardians** (wali mode): they
can read the profile and its chats but cannot act.

**Offline bureau clients.** Profiles with `source = 'bureau_offline'` have no
login. Matchmakers act for them (reply to interests, chat, share photos). They
are only visible to app members after `admin_record_listing_consent()`.

**Profile lifecycle.** `draft → pending_review → active ⇄ paused → matched`
(+ `suspended`, `deleted`). Users can't activate themselves; a verifier approves.
Changing name or date of birth after approval sends the profile back to review.

## What each plan can do (enforced in SQL)

| Action | Free | Basic | Premium |
|---|:-:|:-:|:-:|
| Create profile, limited previews (10 cards, no names/professions) | ✅ | ✅ | ✅ |
| View full profile of someone who contacted you / bureau suggestion | ✅ | ✅ | ✅ |
| Accept / decline interests and chat back with a paying member | ✅ | ✅ | ✅ |
| Browse full profiles, smart suggestions | – | ✅ | ✅ |
| Send interests (per 24 h) | – | 10 | 25 |
| Start chats, request photos | – | ✅ | ✅ |
| Unlock phone / WhatsApp (after the other side approves) | – | – | ✅ |
| Priority listing (+5 ranking boost) | – | – | ✅ |

Chat stays open while **at least one** participant has a paid plan.

## Privacy model

* Nobody reads another person's `profiles` row directly. Other profiles are seen
  only through `search_profiles()` / `get_profile_detail()`, which hide private
  fields and apply plan limits. Last name, phone, address and the CNIC hash sit in
  `profile_private` and are never returned to other members.
* **Photos** are in a private bucket. Every photo must be approved by staff.
  Another member sees photos only with an `approved` row in `photo_access`; the
  owner can revoke at any time; blocking or closing a chat revokes automatically.
  The apps will get 60-second signed links from an Edge Function (Step 6).
* **Contact numbers** are revealed only by `get_contact_details()`: the viewer must
  be Premium AND the owner must have approved. Each reveal is written to the audit
  log. For offline clients, the bureau's own number is returned instead.
* **Chat filter.** Messages, interest notes and meeting notes containing phone
  numbers (including spaced-out or Urdu digits), emails, or WhatsApp/Telegram/social
  links are rejected. That protects both safety and the Premium plan.
* **CNIC.** Images go to a bucket only verifiers can read. The verifier types the
  number; only a salted SHA-256 hash is stored, and one CNIC can back only one
  profile (fake / duplicate account detection).
* **Staff.** Four roles (super_admin, verifier, matchmaker, accountant). Only
  super_admin can read private chats (for handling reports). Every staff decision,
  and every contact reveal, is recorded in `audit_log`.

## Payments (manual flow)

1. App shows the `payment_accounts` (JazzCash / Easypaisa / bank).
2. User uploads the receipt to `payment-receipts/<profile_id>/…` and calls
   `submit_payment(profile, plan, method, transaction_id, receipt_path, receipt_sha256)`.
   The amount always comes from the `plans` table.
3. The same transaction ID or the same receipt image can't be used twice.
4. Accountant calls `approve_payment()` → subscription created (renewals stack
   after the current end date) → user notified. Or `reject_payment(reason)`.
5. Cash at the office: `admin_record_payment()`. Goodwill/free months:
   `admin_grant_subscription()`.

## Matchmaking score

1. **Dealbreakers**, checked in both directions: accepted marital status, age within
   the preferred range ± 3 years, and sect, caste or city when marked "must".
2. **One-way score (0–100)** = how well B fits A's preferences:
   age 15 · sect 15 · education 15 · family status 15 · caste 10 · city 10 ·
   religiosity 10 · height 5 · mother tongue 5.
3. **Mutual score** = √(A→B × B→A), so a one-sided "perfect match" ranks lower.

Matchmakers use `admin_top_matches(profile)` to see the best candidates with
both one-way scores, then `admin_suggest_match()` to send a gold "Bureau
Suggestion".

## Grants (important for new migrations)

Newer Supabase projects do **not** automatically grant table privileges to the
API roles. Migration `…1003_explicit_grants.sql` grants exactly what the app
needs: `authenticated` may read every table (RLS filters the rows) and write
directly only where an RLS write policy exists; everything else is written via
RPC functions. **Every new table must get explicit grants in its migration.**
The local test shim mimics these defaults, so a forgotten grant fails the tests.

## Error codes returned to the apps

`not_authorized`, `not_found`, `upgrade_required` (hint = `basic`/`premium`),
`profile_not_active`, `profile_incomplete`, `daily_limit_reached`,
`contact_policy_restricted`, `contact_info_not_allowed`, `interest_already_exists`,
`already_connected`, `conversation_closed`, `already_requested`,
`photo_access_required`, `contact_not_shared`, `duplicate_transaction`,
`cnic_already_registered`, `invalid_state`, `invalid_input`, `field_locked`,
`must_be_18_or_older`. English and Urdu messages are in `packages/shared/src/errors.ts`.

## Tests

`supabase/tests/local/test_01_core_flows.sql` logs in as real users (RLS on) and
covers: profile creation and field locks, privacy between users and guardians,
staff approval, free-vs-paid limits, interests, the chat filter, photo request,
approve, revoke and re-share, payments (duplicate TID and receipt, wrong role,
renewal), contact unlock, meetings, two-sided rishta confirmation, blocking and
reporting, CNIC duplicate detection, the WhatsApp import, offline clients
handled by the bureau, the nightly job, and match scoring. Everything is rolled
back at the end.
