-- Add track_offline field to epic_success_configs table
-- This allows epics to indicate they will track metrics offline (not automated)
-- Epics with track_offline = true should not be counted in digest as missing metrics

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic_success_configs' AND table_schema = 'public') THEN
    RAISE NOTICE 'Table epic_success_configs does not exist, skipping migration';
    RETURN;
  END IF;
  
  -- Add track_offline column
  ALTER TABLE public.epic_success_configs
    ADD COLUMN IF NOT EXISTS track_offline boolean NOT NULL DEFAULT false;

  -- Create index for queries filtering by track_offline
  CREATE INDEX IF NOT EXISTS idx_epic_success_configs_track_offline 
    ON public.epic_success_configs(track_offline) 
    WHERE track_offline = true;

  -- Add comment for documentation
  COMMENT ON COLUMN public.epic_success_configs.track_offline IS 
    'If true, indicates this epic will track success metrics offline (not automated). These epics should not be counted in digest as missing metrics.';
END $check$;
