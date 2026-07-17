-- Repair: launch tables were created without role grants (same issue previously
-- fixed for roadmap_period_analysis in 20260511100000). Every role — anon,
-- authenticated, service_role — gets 42501 "permission denied" on these tables,
-- which breaks all /api/launches* and /api/gtm-launches* endpoints.
-- RLS policies from 20260314000001 still govern row access.
GRANT ALL ON public.launch TO anon, authenticated, service_role;
GRANT ALL ON public.launch_epic TO anon, authenticated, service_role;
GRANT ALL ON public.launch_criterion_status TO anon, authenticated, service_role;
