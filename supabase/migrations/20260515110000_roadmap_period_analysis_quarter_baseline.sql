-- Allow Plan vs Actual AI cache for quarter baseline mode (distinct from quarter-end quarterly).

ALTER TABLE public.roadmap_period_analysis
  DROP CONSTRAINT IF EXISTS roadmap_period_analysis_period_type_check;

ALTER TABLE public.roadmap_period_analysis
  ADD CONSTRAINT roadmap_period_analysis_period_type_check
  CHECK (period_type IN ('monthly', 'quarterly', 'quarter_baseline', 'quarter_progress'));

COMMENT ON CONSTRAINT roadmap_period_analysis_period_type_check ON public.roadmap_period_analysis IS
  'Plan vs Actual cache: monthly/quarterly legacy; quarter_baseline = opening snapshot; quarter_progress = in-quarter month slice.';
