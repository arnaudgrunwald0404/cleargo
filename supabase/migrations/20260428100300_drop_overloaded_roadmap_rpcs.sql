-- Roadmap Rewind: collapse overloaded RPC signatures so PostgREST can resolve them.
--
-- The 20260427120000_roadmap_rewind_functions.sql migration was concatenated
-- from several historical migration files. Older versions of these functions
-- (no-arg or single-arg variants) were superseded by richer signatures that
-- accept additional optional parameters with sensible defaults — but the older
-- signatures were never explicitly dropped. As a result the database ends up
-- with two coexisting overloads per function name, and PostgREST returns
-- PGRST203 ("Could not choose the best candidate function") whenever the
-- client invokes the RPC with arguments that are ambiguous against both.
--
-- Each remaining (richer) function handles the legacy call pattern via its
-- DEFAULT-valued parameters, so dropping the simpler signature is safe and
-- requires no client-side change.

-- 1. get_all_year_release_movements()  -> kept variant: (as_of_date date DEFAULT NULL)
DROP FUNCTION IF EXISTS public.get_all_year_release_movements();

-- 2. get_year_movements_with_impact()  -> kept variant: (as_of_date date DEFAULT NULL)
DROP FUNCTION IF EXISTS public.get_year_movements_with_impact();

-- 3. get_year_movements_impact_summary()  -> kept variant: (as_of_date date DEFAULT NULL)
DROP FUNCTION IF EXISTS public.get_year_movements_impact_summary();

-- 4. get_period_release_delivery_metrics(text)
--    -> kept variant: (period_type text DEFAULT 'quarterly', as_of_date date DEFAULT NULL)
DROP FUNCTION IF EXISTS public.get_period_release_delivery_metrics(text);

-- The grant_execute migration (20260428100100_grant_execute_roadmap_rewind_rpcs.sql)
-- iterates pg_proc by name, so the surviving overloads keep their EXECUTE grant
-- to `authenticated` on the next deploy. Re-run the grant DO-block here to
-- cover the case where this migration is applied without re-running the grant
-- migration (idempotent).
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_all_year_release_movements',
        'get_year_movements_with_impact',
        'get_year_movements_impact_summary',
        'get_period_release_delivery_metrics'
      )
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
      fn.schema_name, fn.proname, fn.args
    );
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
