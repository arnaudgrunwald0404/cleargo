-- Grant EXECUTE on the Roadmap Rewind RPCs to the `authenticated` role so
-- PostgREST exposes them to logged-in browser clients (otherwise calls return
-- 403 Forbidden). The original 20260427120000_roadmap_rewind_functions.sql
-- forgot the GRANTs; this migration fixes that for every overload of every
-- roadmap-related function in the `public` schema.
--
-- Idempotent: GRANT EXECUTE is a no-op if the role already has the privilege.

DO $$
DECLARE
  fn record;
  grant_sql text;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_release_delivery_metrics',
        'get_period_release_delivery_metrics',
        'get_year_movements_with_impact',
        'get_all_year_release_movements',
        'get_year_movements_impact_summary',
        'get_weekly_roadmap_changes',
        'get_quarter_to_date_roadmap_changes',
        'get_year_to_date_roadmap_changes',
        'get_latest_and_previous_roadmap_versions',
        'get_priority_goals_delivery_metrics',
        'get_strategic_items_detail',
        'debug_release_items'
      )
  LOOP
    grant_sql := format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
      fn.schema_name, fn.proname, fn.args
    );
    EXECUTE grant_sql;
  END LOOP;
END
$$;

-- Tell PostgREST to refresh its schema cache so the newly-granted functions
-- become callable immediately rather than waiting up to 10 minutes.
NOTIFY pgrst, 'reload schema';
