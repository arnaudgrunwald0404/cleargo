-- Make thresholds optional for success metrics
-- This allows metrics to exist without tier-specific thresholds
-- Note: Only runs if table exists (may not exist in all deployments)

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'success_metrics' AND table_schema = 'public') THEN
    ALTER TABLE public.success_metrics 
      ALTER COLUMN thresholds DROP NOT NULL;
    COMMENT ON COLUMN public.success_metrics.thresholds IS 'Tier-specific thresholds (TIER_1, TIER_2, TIER_3). Optional - metrics can exist without thresholds.';
  END IF;
END $$;
