-- Simplify success metric thresholds from per-tier to global
-- Collapses existing tiered JSON into a single global threshold object

-- For success_metrics.thresholds, use TIER_1 as the canonical thresholds
UPDATE public.success_metrics
SET thresholds = (thresholds->'TIER_1')
WHERE thresholds IS NOT NULL
  AND jsonb_typeof(thresholds) = 'object'
  AND thresholds ? 'TIER_1';

COMMENT ON COLUMN public.success_metrics.thresholds IS
  'Global thresholds for the metric (min, max, target). No longer tier-specific.';

-- For epic_success_metrics.threshold_override, also collapse to global thresholds
UPDATE public.epic_success_metrics
SET threshold_override = (threshold_override->'TIER_1')
WHERE threshold_override IS NOT NULL
  AND jsonb_typeof(threshold_override) = 'object'
  AND threshold_override ? 'TIER_1';

COMMENT ON COLUMN public.epic_success_metrics.threshold_override IS
  'Global threshold override for the metric on this epic (min, max, target). No longer tier-specific.';

