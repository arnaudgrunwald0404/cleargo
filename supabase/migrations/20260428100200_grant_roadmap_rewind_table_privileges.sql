-- Grant base table privileges on the Roadmap Rewind tables to the
-- `authenticated` role. The original schema migration
-- (20260427100000_roadmap_rewind_schema.sql) added RLS policies but forgot the
-- table-level GRANTs. Without them, PostgreSQL rejects every query with
-- "permission denied for table X" (SQLSTATE 42501) before RLS even runs —
-- regardless of how permissive the RLS policies are.
--
-- This migration matches the privilege pattern used by the rest of the
-- project (see e.g. 20260220100002_grant_epic_success_configs.sql,
-- 20260213000001_pendo_api_cache.sql).
--
-- Idempotent: GRANT is a no-op if the privilege is already held.

-- roadmap_snapshot is read-only for authenticated users; writes happen via
-- the cron job using the service_role client which bypasses RLS.
-- Privileges on the partitioned parent propagate to existing and future partitions.
GRANT SELECT ON public.roadmap_snapshot TO authenticated;

-- epic_comment supports full CRUD by authenticated users (RLS scopes
-- update/delete to the row's author).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_comment TO authenticated;

-- confidence_rating: read by everyone, update by PMs (RLS-gated).
GRANT SELECT, UPDATE ON public.confidence_rating TO authenticated;

-- confidence_adjustment_history: append-only audit log written by PMs.
GRANT SELECT, INSERT ON public.confidence_adjustment_history TO authenticated;

-- pm_impact_override: PM-managed override table.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_impact_override TO authenticated;

-- roadmap_hidden_item: per-user UI preference; users hide/unhide their own rows.
GRANT SELECT, INSERT, DELETE ON public.roadmap_hidden_item TO authenticated;

-- service_role bypasses RLS but still needs explicit table privileges in
-- some Supabase setups; granting ALL is the project convention for
-- service-role-managed tables.
GRANT ALL ON public.roadmap_snapshot TO service_role;
GRANT ALL ON public.epic_comment TO service_role;
GRANT ALL ON public.confidence_rating TO service_role;
GRANT ALL ON public.confidence_adjustment_history TO service_role;
GRANT ALL ON public.pm_impact_override TO service_role;
GRANT ALL ON public.roadmap_hidden_item TO service_role;

-- Tell PostgREST to refresh its schema cache so the new privileges take
-- effect immediately rather than waiting up to 10 minutes.
NOTIFY pgrst, 'reload schema';
