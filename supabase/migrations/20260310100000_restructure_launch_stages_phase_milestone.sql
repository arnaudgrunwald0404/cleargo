-- Phase vs Milestone: add stage_type, rename GTM Access, restructure ui_rollout (remove CS Prep, add GTM Access and Prep), remap rating_timing.

-- 1. Add stage_type column
ALTER TABLE public.launch_stages
  ADD COLUMN IF NOT EXISTS stage_type TEXT CHECK (stage_type IN ('phase', 'milestone'));

-- 2. Release schedule: set stage_type and rename GTM Access
UPDATE public.launch_stages
SET stage_type = CASE
  WHEN name = 'Product Definition Complete' THEN 'milestone'
  WHEN name = 'GTM Access' THEN 'phase'
  WHEN name = 'Internal Readiness' THEN 'phase'
  WHEN name = 'Cohort 1 Live' THEN 'milestone'
  WHEN name ILIKE '%GA%' OR name ILIKE '%Cohort 2%' THEN 'milestone'
  ELSE 'phase'
END
WHERE scope = 'release_schedule';

UPDATE public.launch_stages
SET name = 'GTM Access and Prep'
WHERE scope = 'release_schedule' AND name = 'GTM Access';

-- 3. UI Rollout: set stage_type on existing rows (before restructure)
UPDATE public.launch_stages
SET stage_type = CASE
  WHEN name = 'UX Preview' THEN 'phase'
  WHEN name = 'Internal Readiness' THEN 'phase'
  WHEN name = 'CS Prep' THEN 'phase'
  WHEN name IN ('GTM Prep', 'GTM Access') THEN 'phase'
  WHEN name = 'Cohort 1' THEN 'milestone'
  WHEN name ILIKE '%Cohort 2%' OR name ILIKE '%GA%' THEN 'milestone'
  ELSE 'phase'
END
WHERE scope = 'ui_rollout';

-- 4. UI Rollout: add GTM Access and Prep, remove CS Prep or redundant GTM Access, remap rating_timing
DO $$
DECLARE
  cs_prep_id BIGINT;
  gtm_prep_id BIGINT;
  cs_prep_dur INTEGER;
  cs_prep_ld JSONB;
  gtm_prep_at_2_id BIGINT;
  gtm_access_id BIGINT;
BEGIN
  SELECT id, duration_days, level_durations INTO cs_prep_id, cs_prep_dur, cs_prep_ld
  FROM public.launch_stages WHERE scope = 'ui_rollout' AND name = 'CS Prep' LIMIT 1;

  IF cs_prep_id IS NOT NULL THEN
    -- Original seed: CS Prep at 3. Free 2, insert GTM Access and Prep at 2, remove CS Prep.
    UPDATE public.launch_stages SET sort_order = 30 WHERE scope = 'ui_rollout' AND id = cs_prep_id;
    UPDATE public.launch_stages SET sort_order = 3 WHERE scope = 'ui_rollout' AND name = 'Internal Readiness';
    INSERT INTO public.launch_stages (name, sort_order, duration_days, details, scope, level_durations, is_gate, stage_type)
    VALUES (
      'GTM Access and Prep', 2, COALESCE(cs_prep_dur, 14),
      'GTM access and customer success prep. Duration varies by Impact Level.', 'ui_rollout',
      COALESCE(cs_prep_ld, '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 7, "max_days": 14}}'::jsonb),
      TRUE, 'phase'
    )
    RETURNING id INTO gtm_prep_id;
    UPDATE public.criterion SET rating_timing = gtm_prep_id::text WHERE rating_timing = (cs_prep_id::text);
    DELETE FROM public.launch_stages WHERE id = cs_prep_id;

  ELSIF EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND sort_order = 2 AND name IN ('GTM Prep', 'GTM Access and Prep')) THEN
    -- Manual layout: "GTM Prep" (or already renamed) at 2, possibly "GTM Access" at 6. Rename row at 2, remap and remove extra GTM Access.
    SELECT id INTO gtm_prep_at_2_id
    FROM public.launch_stages WHERE scope = 'ui_rollout' AND sort_order = 2 AND name IN ('GTM Prep', 'GTM Access and Prep') LIMIT 1;
    UPDATE public.launch_stages
    SET name = 'GTM Access and Prep', is_gate = TRUE, stage_type = 'phase'
    WHERE scope = 'ui_rollout' AND id = gtm_prep_at_2_id;
    SELECT id INTO gtm_access_id FROM public.launch_stages WHERE scope = 'ui_rollout' AND name = 'GTM Access' LIMIT 1;
    IF gtm_access_id IS NOT NULL THEN
      UPDATE public.criterion SET rating_timing = gtm_prep_at_2_id::text WHERE rating_timing = (gtm_access_id::text);
      DELETE FROM public.launch_stages WHERE id = gtm_access_id;
    END IF;

  ELSIF NOT EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND name = 'GTM Access and Prep')
    AND EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND sort_order = 1) THEN
    -- No CS Prep, no GTM Prep at 2: free 2 by shifting high-to-low, then insert at 2.
    UPDATE public.launch_stages SET sort_order = 50 WHERE scope = 'ui_rollout' AND sort_order = 5;
    UPDATE public.launch_stages SET sort_order = 5 WHERE scope = 'ui_rollout' AND sort_order = 4;
    UPDATE public.launch_stages SET sort_order = 4 WHERE scope = 'ui_rollout' AND sort_order = 3;
    UPDATE public.launch_stages SET sort_order = 3 WHERE scope = 'ui_rollout' AND name = 'Internal Readiness';
    INSERT INTO public.launch_stages (name, sort_order, duration_days, details, scope, level_durations, is_gate, stage_type)
    VALUES ('GTM Access and Prep', 2, 14,
      'GTM access and customer success prep. Duration varies by Impact Level.', 'ui_rollout',
      '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 7, "max_days": 14}}'::jsonb,
      TRUE, 'phase');
    UPDATE public.launch_stages SET sort_order = 5 WHERE scope = 'ui_rollout' AND sort_order = 50;
  END IF;
END $$;

-- 5. Set default for new rows
ALTER TABLE public.launch_stages
  ALTER COLUMN stage_type SET DEFAULT 'phase';
