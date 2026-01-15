-- Add epic-specific configuration fields to epic_success_metrics table
-- This allows each epic to have its own event/data source and target value

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

-- Add comments
COMMENT ON COLUMN public.epic_success_metrics.target IS 'Epic-specific target value for this metric. Required when metric is added to epic.';
COMMENT ON COLUMN public.epic_success_metrics.pendo_event_id IS 'Epic-specific Pendo event ID. Overrides metric default if provided.';
COMMENT ON COLUMN public.epic_success_metrics.snowflake_query IS 'Epic-specific Snowflake query. Overrides metric default if provided.';
COMMENT ON COLUMN public.epic_success_metrics.manual_label IS 'Label/description for manual metrics at epic level.';
COMMENT ON COLUMN public.epic_success_metrics.updated_at IS 'Timestamp of last update to this epic metric configuration.';

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_epic_success_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_epic_success_metrics_updated_at_trigger
  BEFORE UPDATE ON public.epic_success_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_epic_success_metrics_updated_at();
