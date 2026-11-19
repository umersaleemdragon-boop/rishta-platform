-- ============================================================================
-- 1002 Pin search_path on every function in the private schema
-- (Supabase linter 0011 "function_search_path_mutable"). These helpers are not
-- exposed through the API, but pinning the search path is cheap defence in depth.
-- ============================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'private'::regnamespace
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
  end loop;
end $$;
