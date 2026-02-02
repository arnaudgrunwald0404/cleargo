-- Grant table permissions for HEART tables
-- The service role needs explicit permissions even with RLS enabled

-- Grant permissions to authenticated and service_role for all HEART tables
GRANT ALL ON public.heart_categories TO authenticated, service_role;
GRANT ALL ON public.epic_heart_configs TO authenticated, service_role;
GRANT ALL ON public.epic_heart_metrics TO authenticated, service_role;
GRANT ALL ON public.epic_heart_snapshots TO authenticated, service_role;
GRANT ALL ON public.heart_surveys TO authenticated, service_role;
GRANT ALL ON public.heart_survey_responses TO authenticated, service_role;
GRANT ALL ON public.pendo_events_cache TO authenticated, service_role;

-- Also grant usage on any sequences if they exist
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
