# Rishta Platform

Matrimonial platform for a marriage bureau: a member app (web first, then
Android, then iOS) plus a bureau admin panel, sharing one Supabase backend.

```
apps/app        Expo (React Native + Expo Router): web → Android → iOS   (Step 2+)
apps/admin      Next.js admin panel for bureau staff                     (Step 3)
packages/shared Shared TypeScript: enums, plans, error messages (EN/UR)
supabase/       Database migrations, security rules, seed, tests         (Step 1 ✅)
data-import/    Excel template for the bureau's existing WhatsApp clients
docs/           Architecture & database documentation
```

## Roadmap

| Step | | Status |
|---|---|---|
| 1 | Database schema & backend | ✅ done |
| 2 | Auth (phone OTP) & onboarding wizard, web first | next |
| 3 | Admin panel v1 (approvals, payments, import, staff roles) | |
| 4 | Discovery & matchmaking UI | |
| 5 | Interests & realtime chat | |
| 6 | Photo privacy UI + signed-URL Edge Function + watermark | |
| 7 | Meeting scheduler & rishta lifecycle UI | |
| 8 | Payment screens & plan gating | |
| 9 | Notifications (push + WhatsApp), Urdu RTL, performance | |
| 10 | Security review, Android then iOS store release | |

See [`docs/DATABASE.md`](docs/DATABASE.md) for how the backend works.

## Run the database tests locally (no Docker needed)

Needs PostgreSQL 15+ running locally with a superuser:

```bash
PGHOST=localhost PGUSER=postgres bash supabase/tests/local/run.sh
```

This creates a throw-away `rishta_test` database, applies all migrations and the
seed, and runs the test suite. (`supabase/tests/local/supabase_shim.sql` mimics
Supabase's auth and storage schemas and is used for tests only.)

## Deploy the backend to Supabase

1. Create a project at supabase.com (region: Mumbai `ap-south-1` or Singapore).
2. Dashboard → Database → Extensions: enable **pg_cron**. pgcrypto and pg_trgm
   are enabled by the migrations.
3. Install the Supabase CLI, then link the project and push the migrations:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   ```bash
   supabase db push
   ```
4. Dashboard → Authentication → Providers → Phone: enable it and connect an SMS
   provider.
5. Sign up once with the owner's phone number, then make that account super admin
   in the SQL editor:
   ```sql
   insert into public.staff_members (user_id, role, display_name)
   select id, 'super_admin', 'Owner' from public.app_users where phone = '923XXXXXXXXX';
   ```
6. Fill in the real bureau details: `app_settings` (`bureau_contact`) and
   `payment_accounts` (JazzCash, Easypaisa, bank).

`seed.sql` (demo data) is applied only to local databases, never by `db push`.
