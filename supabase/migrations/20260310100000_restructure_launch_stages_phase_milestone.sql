-- Phase vs Milestone: add stage_type, rename GTM Access, restructure ui_rollout (remove CS Prep, add GTM Access and Prep), remap rating_timing.
-- Targets launch_stages or release_stages (see 20260310000000).

DO $$
DECLARE
  st text;
  cs_prep_id BIGINT;
  gtm_prep_id BIGINT;
  cs_prep_dur INTEGER;
  cs_prep_ld JSONB;
  gtm_prep_at_2_id BIGINT;
  gtm_access_id BIGINT;
  branch2 boolean;
  branch3 boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'launch_stages') THEN
    st := 'launch_stages';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'release_stages') THEN
    st := 'release_stages';
  ELSE
    RAISE EXCEPTION '20260310100000_restructure_launch_stages_phase_milestone: expected launch_stages or release_stages';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS stage_type TEXT CHECK (stage_type IN (''phase'', ''milestone''))',
    st
  );

  EXECUTE format($q$
    UPDATE public.%I SET stage_type = CASE
      WHEN name = 'Product Definition Complete' THEN 'milestone'
      WHEN name = 'GTM Access' THEN 'phase'
      WHEN name = 'Internal Readiness' THEN 'phase'
      WHEN name = 'Cohort 1 Live' THEN 'milestone'
      WHEN name ILIKE '%%GA%%' OR name ILIKE '%%Cohort 2%%' THEN 'milestone'
      ELSE 'phase'
    END
    WHERE scope = 'release_schedule'
  $q$, st);

  EXECUTE format($q$
    UPDATE public.%I SET name = 'GTM Access and Prep'
    WHERE scope = 'release_schedule' AND name = 'GTM Access'
  $q$, st);

  EXECUTE format($q$
    UPDATE public.%I SET stage_type = CASE
      WHEN name = 'UX Preview' THEN 'phase'
      WHEN name = 'Internal Readiness' THEN 'phase'
      WHEN name = 'CS Prep' THEN 'phase'
      WHEN name IN ('GTM Prep', 'GTM Access') THEN 'phase'
      WHEN name = 'Cohort 1' THEN 'milestone'
      WHEN name ILIKE '%%Cohort 2%%' OR name ILIKE '%%GA%%' THEN 'milestone'
      ELSE 'phase'
    END
    WHERE scope = 'ui_rollout'
  $q$, st);

  EXECUTE format('SELECT id, duration_days, level_durations FROM public.%I WHERE scope = $1 AND name = $2 LIMIT 1', st)
    USING 'ui_rollout', 'CS Prep'
    INTO cs_prep_id, cs_prep_dur, cs_prep_ld;

  IF cs_prep_id IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET sort_order = 30 WHERE scope = $1 AND id = $2', st)
      USING 'ui_rollout', cs_prep_id;
    EXECUTE format('UPDATE public.%I SET sort_order = 3 WHERE scope = $1 AND name = $2', st)
      USING 'ui_rollout', 'Internal Readiness';
    EXECUTE format($q$
      INSERT INTO public.%I (name, sort_order, duration_days, details, scope, level_durations, is_gate, stage_type)
      VALUES (
        'GTM Access and Prep', 2, $1,
        'GTM access and customer success prep. Duration varies by Impact Level.', 'ui_rollout',
        $2,
        TRUE, 'phase'
      ) RETURNING id
    $q$, st)
      USING COALESCE(cs_prep_dur, 14), COALESCE(cs_prep_ld, '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 7, "max_days": 14}}'::jsonb)
      INTO gtm_prep_id;
    UPDATE public.criterion SET rating_timing = gtm_prep_id WHERE rating_timing = cs_prep_id;
    EXECUTE format('DELETE FROM public.%I WHERE id = $1', st) USING cs_prep_id;

  ELSE
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.%I WHERE scope = $1 AND sort_order = 2 AND name IN (''GTM Prep'', ''GTM Access and Prep''))',
      st
    ) USING 'ui_rollout' INTO branch2;

    IF branch2 THEN
      EXECUTE format(
        'SELECT id FROM public.%I WHERE scope = $1 AND sort_order = 2 AND name IN (''GTM Prep'', ''GTM Access and Prep'') LIMIT 1',
        st
      ) USING 'ui_rollout' INTO gtm_prep_at_2_id;
      EXECUTE format($q$
        UPDATE public.%I
        SET name = 'GTM Access and Prep', is_gate = TRUE, stage_type = 'phase'
        WHERE scope = 'ui_rollout' AND id = $1
      $q$, st)
        USING gtm_prep_at_2_id;
      EXECUTE format(
        'SELECT id FROM public.%I WHERE scope = $1 AND name = $2 LIMIT 1',
        st
      ) USING 'ui_rollout', 'GTM Access' INTO gtm_access_id;
      IF gtm_access_id IS NOT NULL THEN
        UPDATE public.criterion SET rating_timing = gtm_prep_at_2_id WHERE rating_timing = gtm_access_id;
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', st) USING gtm_access_id;
      END IF;

    ELSE
      EXECUTE format(
        'SELECT (NOT EXISTS (SELECT 1 FROM public.%I WHERE scope = $1 AND name = ''GTM Access and Prep''))
           AND (EXISTS (SELECT 1 FROM public.%I WHERE scope = $1 AND sort_order = 1))',
        st, st
      ) USING 'ui_rollout' INTO branch3;

      IF branch3 THEN
        EXECUTE format('UPDATE public.%I SET sort_order = 50 WHERE scope = $1 AND sort_order = 5', st) USING 'ui_rollout';
        EXECUTE format('UPDATE public.%I SET sort_order = 5 WHERE scope = $1 AND sort_order = 4', st) USING 'ui_rollout';
        EXECUTE format('UPDATE public.%I SET sort_order = 4 WHERE scope = $1 AND sort_order = 3', st) USING 'ui_rollout';
        EXECUTE format('UPDATE public.%I SET sort_order = 3 WHERE scope = $1 AND name = $2', st) USING 'ui_rollout', 'Internal Readiness';
        EXECUTE format($q$
          INSERT INTO public.%I (name, sort_order, duration_days, details, scope, level_durations, is_gate, stage_type)
          VALUES ('GTM Access and Prep', 2, 14,
            'GTM access and customer success prep. Duration varies by Impact Level.', 'ui_rollout',
            '{"1": {"min_days": 21, "max_days": 28}, "2": {"min_days": 14, "max_days": 21}, "3": {"min_days": 7, "max_days": 14}}'::jsonb,
            TRUE, 'phase')
        $q$, st);
        EXECUTE format('UPDATE public.%I SET sort_order = 5 WHERE scope = $1 AND sort_order = 50', st) USING 'ui_rollout';
      END IF;
    END IF;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN stage_type SET DEFAULT ''phase''', st);
END $$;
