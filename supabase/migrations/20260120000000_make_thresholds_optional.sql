-- Make thresholds optional for success metrics
-- This allows metrics to exist without tier-specific thresholds

ALTER TABLE public.success_metrics 
  ALTER COLUMN thresholds DROP NOT NULL;

COMMENT ON COLUMN public.success_metrics.thresholds IS 'Tier-specific thresholds (TIER_1, TIER_2, TIER_3). Optional - metrics can exist without thresholds.';
