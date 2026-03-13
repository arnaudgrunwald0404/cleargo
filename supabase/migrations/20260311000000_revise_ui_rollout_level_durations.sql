-- Revise UI Rollout level_durations to align with framework timelines.
-- Level 1: 18-24 weeks, Level 2: 6-9 weeks, Level 3: 3-6 weeks.
-- min_days = target (aggressive plan date), max_days = buffer ceiling.

-- Product Definition Complete (sort 0): L1 21-28, L2 7-10, L3 3-7
UPDATE public.launch_stages
SET level_durations = '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 7, "max_days": 10}, "3": {"min_days": 3, "max_days": 7}}'::jsonb,
    duration_days = 21
WHERE scope = 'ui_rollout' AND name = 'Product Definition Complete';

-- UX Preview (sort 1): L1 42-56, L2 7-14, L3 3-5
UPDATE public.launch_stages
SET level_durations = '{"1": {"min_days": 42, "max_days": 56}, "2": {"min_days": 7, "max_days": 14}, "3": {"min_days": 3, "max_days": 5}}'::jsonb,
    duration_days = 42
WHERE scope = 'ui_rollout' AND name = 'UX Preview';

-- GTM Access and Prep (sort 2): L1 14-21, L2 7-10, L3 3-7
UPDATE public.launch_stages
SET level_durations = '{"1": {"min_days": 14, "max_days": 21}, "2": {"min_days": 7, "max_days": 10}, "3": {"min_days": 3, "max_days": 7}}'::jsonb,
    duration_days = 14
WHERE scope = 'ui_rollout' AND name = 'GTM Access and Prep';

-- Internal Readiness (sort 3): L1 21-28, L2 7-10, L3 5-7
UPDATE public.launch_stages
SET level_durations = '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 7, "max_days": 10}, "3": {"min_days": 5, "max_days": 7}}'::jsonb,
    duration_days = 21
WHERE scope = 'ui_rollout' AND name = 'Internal Readiness';

-- Cohort 1 (sort 4): L1 28-35, L2 14-21, L3 5-14
UPDATE public.launch_stages
SET level_durations = '{"1": {"min_days": 28, "max_days": 35}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 5, "max_days": 14}}'::jsonb,
    duration_days = 28
WHERE scope = 'ui_rollout' AND name = 'Cohort 1';
