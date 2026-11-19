-- ============================================================================
-- 1003 EXPLICIT TABLE / SEQUENCE GRANTS
-- Newer Supabase projects no longer auto-grant select/insert/update/delete on
-- new tables to the API roles (they only get truncate/references/trigger).
-- Grant exactly what the app needs; Row-Level Security still decides WHICH
-- rows each person can touch. Re-applies the restrictions from 0800 / 1000.
-- Rule for future migrations: every new table needs its own explicit grants.
-- ============================================================================

-- API roles never need these (TRUNCATE would even bypass RLS).
revoke truncate, references, trigger on all tables in schema public from anon, authenticated, service_role;

-- service_role = trusted server code (Edge Functions); it bypasses RLS.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- anon (not signed in): public reference data only.
revoke all on all tables in schema public from anon;
grant select on public.lookups, public.plans, public.app_settings to anon;

-- authenticated (signed-in members and staff): read via RLS on every table ...
grant select on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ... and direct writes ONLY where an RLS write policy exists for them.
grant insert, update, delete on public.profiles to authenticated;
grant update on public.profile_private, public.partner_preferences to authenticated;
grant insert, update, delete on public.profile_photos to authenticated;
grant insert, delete on public.profile_guardians to authenticated;           -- insert: staff only (RLS)
grant delete on public.blocks to authenticated;                              -- unblock
grant insert, update, delete on public.profile_notes to authenticated;       -- staff only (RLS)
grant insert, update, delete on public.staff_members to authenticated;       -- super_admin only (RLS)
grant insert, update, delete on public.lookups to authenticated;             -- super_admin only (RLS)
grant update on public.plans to authenticated;                               -- accountant (RLS)
grant update on public.app_settings to authenticated;                        -- super_admin (RLS)
grant insert, update, delete on public.payment_accounts to authenticated;    -- accountant (RLS)
grant update (full_name, preferred_language) on public.app_users to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Everything else (interests, chat, payments, subscriptions, photo/contact access,
-- meetings, reports, suggestions, verification, guardian invites, audit log) is
-- written only through the checked RPC functions, so no direct write grants.
