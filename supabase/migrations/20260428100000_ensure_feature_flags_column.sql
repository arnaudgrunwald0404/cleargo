-- Defensive re-run of 20260129100001_add_feature_flags_to_app_settings.sql.
--
-- That migration was idempotent (ADD COLUMN IF NOT EXISTS), but at least one
-- environment had its supabase_migrations.schema_migrations row recorded
-- without the column actually being created (drifted history). Re-running the
-- ALTER under a fresh migration timestamp ensures `supabase db push` picks it
-- up everywhere it hasn't actually landed.
--
-- Safe to apply repeatedly: the IF NOT EXISTS guards no-op when the column
-- is already present.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS feature_flags text[] DEFAULT '{}';

COMMENT ON COLUMN app_settings.feature_flags IS 'Enabled feature flag keys (e.g. ai_pruning, meetings, not_applicable, roadmap_rewind). Surfaced via Settings > Other Settings.';

-- Tell PostgREST to reload its schema cache so the column is immediately
-- available via the REST API rather than waiting up to 10 minutes.
NOTIFY pgrst, 'reload schema';
