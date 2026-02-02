-- Add epic-specific configuration fields to epic_success_metrics table
-- This allows each epic to have its own event/data source and target value
-- Note: Skipped if table doesn't exist

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic_success_metrics' AND table_schema = 'public') THEN
    RAISE NOTICE 'Table epic_success_metrics does not exist, skipping migration';
    RETURN;
  END IF;
  
  -- Add columns
  ALTER TABLE public.epic_success_metrics
    ADD COLUMN IF NOT EXISTS target numeric NULL,
    ADD COLUMN IF NOT EXISTS pendo_event_id text NULL,
    ADD COLUMN IF NOT EXISTS snowflake_query text NULL,
    ADD COLUMN IF NOT EXISTS manual_label text NULL,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

  -- Create index for target queries
  CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_target 
    ON public.epic_success_metrics(target) 
    WHERE target IS NOT NULL;

  -- Create index for pendo_event_id queries
  CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_pendo_event 
    ON public.epic_success_metrics(pendo_event_id) 
    WHERE pendo_event_id IS NOT NULL;
END $check$;

-- Create trigger function (safe to create even if table doesn't exist)
CREATE OR REPLACE FUNCTION update_epic_success_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger only if table exists
DO $trigger$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic_success_metrics' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS update_epic_success_metrics_updated_at_trigger ON public.epic_success_metrics;
    CREATE TRIGGER update_epic_success_metrics_updated_at_trigger
      BEFORE UPDATE ON public.epic_success_metrics
      FOR EACH ROW
      EXECUTE FUNCTION update_epic_success_metrics_updated_at();
  END IF;
END $trigger$;
