-- Add "Product Definition Complete" as sort_order 0 for UI Rollout (Rank 0 in the framework).
-- Shift existing ui_rollout stages up by one so the new stage sits at 0.

DO $$
DECLARE
  st text;
  has_pdc boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'launch_stages') THEN
    st := 'launch_stages';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'release_stages') THEN
    st := 'release_stages';
  ELSE
    RAISE EXCEPTION '20260310110000_add_product_definition_complete_ui_rollout: expected launch_stages or release_stages';
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE scope = $1 AND name = ''Product Definition Complete'')',
    st
  ) USING 'ui_rollout' INTO has_pdc;

  IF NOT has_pdc THEN
    EXECUTE format('UPDATE public.%I SET sort_order = 6 WHERE scope = $1 AND sort_order = 5', st) USING 'ui_rollout';
    EXECUTE format('UPDATE public.%I SET sort_order = 5 WHERE scope = $1 AND sort_order = 4', st) USING 'ui_rollout';
    EXECUTE format('UPDATE public.%I SET sort_order = 4 WHERE scope = $1 AND sort_order = 3', st) USING 'ui_rollout';
    EXECUTE format('UPDATE public.%I SET sort_order = 3 WHERE scope = $1 AND sort_order = 2', st) USING 'ui_rollout';
    EXECUTE format('UPDATE public.%I SET sort_order = 2 WHERE scope = $1 AND sort_order = 1', st) USING 'ui_rollout';
    EXECUTE format($q$
      INSERT INTO public.%I (name, sort_order, duration_days, details, scope, level_durations, is_gate, stage_type)
      VALUES (
        'Product Definition Complete',
        0,
        31,
        'Product definition is complete and ready for GTM planning.',
        'ui_rollout',
        '{"1": {"min_days": 28, "max_days": 35}, "2": {"min_days": 21, "max_days": 28}, "3": {"min_days": 14, "max_days": 21}}'::jsonb,
        FALSE,
        'milestone'
      )
    $q$, st);
  END IF;
END $$;
