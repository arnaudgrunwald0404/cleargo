-- Happiness composite migration
-- Adds persisted composite config and updates Happiness defaults to survey + frustration

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'epic_heart_metrics'
      AND column_name = 'composite_config'
  ) THEN
    ALTER TABLE public.epic_heart_metrics
      ADD COLUMN composite_config jsonb NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.epic_heart_metrics.composite_config IS
  'Structured per-metric config for composite calculations (e.g., happiness survey + frustration).';

-- Update global defaults for Happiness to use composite scoring
UPDATE public.heart_category_defaults
SET
  default_target_value = 80,
  default_target_timeframe_days = 30,
  default_measurement_type = 'happiness_composite_score',
  guidance_text = 'Composite happiness score (0-100): survey sentiment + frustration health. If survey responses are missing, use optimistic baseline and let frustration signals adjust the score downward.'
WHERE heart_category = 'happiness';

-- Backfill existing happiness metrics to composite behavior
UPDATE public.epic_heart_metrics
SET
  measurement_type = 'happiness_composite_score',
  target_value = COALESCE(target_value, 80),
  target_timeframe_days = COALESCE(target_timeframe_days, 30),
  composite_config = COALESCE(
    composite_config,
    jsonb_build_object(
      'happiness',
      jsonb_build_object(
        'surveyWeight', 0.7,
        'frustrationWeight', 0.3,
        'optimisticSurveyBaseline', 80,
        'frustrationEventIds', COALESCE(to_jsonb(pendo_event_ids), '[]'::jsonb),
        'frustrationSegmentId', to_jsonb(pendo_segment_id),
        'frustrationEventsPer100UsersAtMaxPenalty', 30
      )
    )
  )
WHERE heart_category = 'happiness';
