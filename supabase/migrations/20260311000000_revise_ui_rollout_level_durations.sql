-- Revise UI Rollout level_durations to align with framework timelines.
-- Level 1: 18-24 weeks, Level 2: 6-9 weeks, Level 3: 3-6 weeks.
-- min_days = target (aggressive plan date), max_days = buffer ceiling.

DO $$
DECLARE
  st text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'launch_stages') THEN
    st := 'launch_stages';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'release_stages') THEN
    st := 'release_stages';
  ELSE
    RAISE EXCEPTION '20260311000000_revise_ui_rollout_level_durations: expected launch_stages or release_stages';
  END IF;

  EXECUTE format($q$
    UPDATE public.%I SET level_durations = '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 7, "max_days": 10}, "3": {"min_days": 3, "max_days": 7}}'::jsonb,
      duration_days = 21
    WHERE scope = 'ui_rollout' AND name = 'Product Definition Complete'
  $q$, st);

  EXECUTE format($q$
    UPDATE public.%I SET level_durations = '{"1": {"min_days": 42, "max_days": 56}, "2": {"min_days": 7, "max_days": 14}, "3": {"min_days": 3, "max_days": 5}}'::jsonb,
      duration_days = 42
    WHERE scope = 'ui_rollout' AND name = 'UX Preview'
  $q$, st);

  EXECUTE format($q$
    UPDATE public.%I SET level_durations = '{"1": {"min_days": 14, "max_days": 21}, "2": {"min_days": 7, "max_days": 10}, "3": {"min_days": 3, "max_days": 7}}'::jsonb,
      duration_days = 14
    WHERE scope = 'ui_rollout' AND name = 'GTM Access and Prep'
  $q$, st);

  EXECUTE format($q$
    UPDATE public.%I SET level_durations = '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 7, "max_days": 10}, "3": {"min_days": 5, "max_days": 7}}'::jsonb,
      duration_days = 21
    WHERE scope = 'ui_rollout' AND name = 'Internal Readiness'
  $q$, st);

  EXECUTE format($q$
    UPDATE public.%I SET level_durations = '{"1": {"min_days": 28, "max_days": 35}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 5, "max_days": 14}}'::jsonb,
      duration_days = 28
    WHERE scope = 'ui_rollout' AND name = 'Cohort 1'
  $q$, st);
END $$;
