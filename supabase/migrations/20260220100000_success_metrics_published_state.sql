-- Add published state for Success Metrics so PMs can configure in draft and publish for everyone
-- When success_metrics_published_at is NULL = draft (only configurers see full content)
-- When set = published (everyone sees success metrics)

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic_success_configs' AND table_schema = 'public') THEN
    RAISE NOTICE 'Table epic_success_configs does not exist, skipping migration';
    RETURN;
  END IF;

  ALTER TABLE public.epic_success_configs
    ADD COLUMN IF NOT EXISTS success_metrics_published_at timestamptz NULL;

  COMMENT ON COLUMN public.epic_success_configs.success_metrics_published_at IS
    'When set, success metrics for this epic are published and visible to all users. When NULL, metrics are in draft and only users with Configure Success Metrics permission see the full configuration.';
END $check$;
