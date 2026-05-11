-- roadmap_period_analysis: RLS policies existed but base table privileges were missing,
-- causing "permission denied for table roadmap_period_analysis" on INSERT/UPDATE (cached AI analysis).

GRANT SELECT, INSERT, UPDATE ON public.roadmap_period_analysis TO authenticated;
GRANT ALL ON public.roadmap_period_analysis TO service_role;
