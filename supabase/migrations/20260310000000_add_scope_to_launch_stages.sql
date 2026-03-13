-- Add scope, level_durations, and is_gate to launch_stages for UI Rollout stage sets.
-- scope: 'release_schedule' (legacy) | 'ui_rollout'
-- level_durations: JSONB for UI Rollout stages only, e.g. {"1": {"min_days": 42, "max_days": 56}, ...}
-- is_gate: marks stage boundary as a Go/No-Go checkpoint

-- Add new columns (nullable first for backfill)
ALTER TABLE public.launch_stages
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS level_durations JSONB,
  ADD COLUMN IF NOT EXISTS is_gate BOOLEAN DEFAULT FALSE;

-- Backfill existing rows as release_schedule
UPDATE public.launch_stages SET scope = 'release_schedule' WHERE scope IS NULL;

-- Make scope NOT NULL and set default for new rows
ALTER TABLE public.launch_stages
  ALTER COLUMN scope SET DEFAULT 'release_schedule',
  ALTER COLUMN scope SET NOT NULL;

-- Composite unique so each scope has its own sort_order sequence
CREATE UNIQUE INDEX IF NOT EXISTS launch_stages_scope_sort_order_key
  ON public.launch_stages (scope, sort_order);

-- Mark GTM Access as gate for Release Schedule (existing Go/No-Go behavior)
UPDATE public.launch_stages
SET is_gate = TRUE
WHERE scope = 'release_schedule' AND name = 'GTM Access';

-- Seed UI Rollout stages (only if none exist yet)
INSERT INTO public.launch_stages (name, sort_order, duration_days, details, scope, level_durations, is_gate)
SELECT 'UX Preview', 1, 63, 'Internal feedback and UX validation. Duration varies by Impact Level (Level 1: 8-10 wk, Level 2: 2-3 wk, Level 3: 1-2 wk).', 'ui_rollout',
  '{"1": {"min_days": 56, "max_days": 70}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 7, "max_days": 14}}'::jsonb,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND sort_order = 1);

INSERT INTO public.launch_stages (name, sort_order, duration_days, details, scope, level_durations, is_gate)
SELECT 'Internal Readiness', 2, 21, 'Product Education and internal enablement ready. Docs, training, and customer-facing materials in progress.', 'ui_rollout',
  '{"1": {"min_days": 28, "max_days": 42}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 7, "max_days": 14}}'::jsonb,
  FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND sort_order = 2);

INSERT INTO public.launch_stages (name, sort_order, duration_days, details, scope, level_durations, is_gate)
SELECT 'CS Prep', 3, 14, 'Customer Success prep: Slack, FAQ, KB, support training. Customer email draft and outreach plan where required by level.', 'ui_rollout',
  '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 7, "max_days": 14}}'::jsonb,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND sort_order = 3);

INSERT INTO public.launch_stages (name, sort_order, duration_days, details, scope, level_durations, is_gate)
SELECT 'Cohort 1', 4, 28, 'First cohort of customers live. Customer-facing training, Pendo, help center complete. Support ready.', 'ui_rollout',
  '{"1": {"min_days": 28, "max_days": 42}, "2": {"min_days": 21, "max_days": 28}, "3": {"min_days": 14, "max_days": 21}}'::jsonb,
  FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND sort_order = 4);

INSERT INTO public.launch_stages (name, sort_order, duration_days, details, scope, level_durations, is_gate)
SELECT 'Cohort 2 / GA', 5, NULL, 'All customers live with the UI change.', 'ui_rollout', NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND sort_order = 5);
