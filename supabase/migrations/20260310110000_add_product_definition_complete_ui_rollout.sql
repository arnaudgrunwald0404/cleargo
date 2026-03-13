-- Add "Product Definition Complete" as sort_order 0 for UI Rollout (Rank 0 in the framework).
-- Shift existing ui_rollout stages up by one so the new stage sits at 0.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.launch_stages WHERE scope = 'ui_rollout' AND name = 'Product Definition Complete') THEN
    -- Free sort_order 0 by shifting high-to-low: 5->6, 4->5, 3->4, 2->3, 1->2
    UPDATE public.launch_stages SET sort_order = 6 WHERE scope = 'ui_rollout' AND sort_order = 5;
    UPDATE public.launch_stages SET sort_order = 5 WHERE scope = 'ui_rollout' AND sort_order = 4;
    UPDATE public.launch_stages SET sort_order = 4 WHERE scope = 'ui_rollout' AND sort_order = 3;
    UPDATE public.launch_stages SET sort_order = 3 WHERE scope = 'ui_rollout' AND sort_order = 2;
    UPDATE public.launch_stages SET sort_order = 2 WHERE scope = 'ui_rollout' AND sort_order = 1;

    INSERT INTO public.launch_stages (name, sort_order, duration_days, details, scope, level_durations, is_gate, stage_type)
    VALUES (
      'Product Definition Complete',
      0,
      31,
      'Product definition is complete and ready for GTM planning.',
      'ui_rollout',
      '{"1": {"min_days": 28, "max_days": 35}, "2": {"min_days": 21, "max_days": 28}, "3": {"min_days": 14, "max_days": 21}}'::jsonb,
      FALSE,
      'milestone'
    );
  END IF;
END $$;
