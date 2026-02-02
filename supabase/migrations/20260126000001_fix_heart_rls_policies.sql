-- Fix HEART tables RLS policies
-- Re-apply policies that may not have been created correctly

-- HEART Categories (read-only for all authenticated users)
ALTER TABLE public.heart_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.heart_categories;
CREATE POLICY "Allow read access to authenticated users" ON public.heart_categories
  FOR SELECT TO authenticated USING (true);

-- Epic HEART Configs
ALTER TABLE public.epic_heart_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.epic_heart_configs;
CREATE POLICY "Allow read access to authenticated users" ON public.epic_heart_configs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.epic_heart_configs;
CREATE POLICY "Allow write access to PMs and admins" ON public.epic_heart_configs
  FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (
        roles @> ARRAY['PM']::text[] 
        OR roles @> ARRAY['PRODUCT_OPS']::text[] 
        OR roles @> ARRAY['CPO']::text[] 
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

-- Epic HEART Metrics
ALTER TABLE public.epic_heart_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.epic_heart_metrics;
CREATE POLICY "Allow read access to authenticated users" ON public.epic_heart_metrics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.epic_heart_metrics;
CREATE POLICY "Allow write access to PMs and admins" ON public.epic_heart_metrics
  FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (
        roles @> ARRAY['PM']::text[] 
        OR roles @> ARRAY['PRODUCT_OPS']::text[] 
        OR roles @> ARRAY['CPO']::text[] 
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

-- Epic HEART Snapshots
ALTER TABLE public.epic_heart_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.epic_heart_snapshots;
CREATE POLICY "Allow read access to authenticated users" ON public.epic_heart_snapshots
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow write access to system" ON public.epic_heart_snapshots;
CREATE POLICY "Allow write access to system" ON public.epic_heart_snapshots
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update access to system" ON public.epic_heart_snapshots;
CREATE POLICY "Allow update access to system" ON public.epic_heart_snapshots
  FOR UPDATE TO authenticated USING (true);

-- HEART Surveys
ALTER TABLE public.heart_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.heart_surveys;
CREATE POLICY "Allow read access to authenticated users" ON public.heart_surveys
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow create access to PMs and admins" ON public.heart_surveys;
CREATE POLICY "Allow create access to PMs and admins" ON public.heart_surveys
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (
        roles @> ARRAY['PM']::text[] 
        OR roles @> ARRAY['PRODUCT_OPS']::text[] 
        OR roles @> ARRAY['CS']::text[]
        OR roles @> ARRAY['CPO']::text[] 
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

DROP POLICY IF EXISTS "Allow update access to CS and admins" ON public.heart_surveys;
CREATE POLICY "Allow update access to CS and admins" ON public.heart_surveys
  FOR UPDATE TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (
        roles @> ARRAY['PRODUCT_OPS']::text[] 
        OR roles @> ARRAY['CS']::text[]
        OR roles @> ARRAY['CPO']::text[] 
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

-- HEART Survey Responses
ALTER TABLE public.heart_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.heart_survey_responses;
CREATE POLICY "Allow read access to authenticated users" ON public.heart_survey_responses
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow write access to system" ON public.heart_survey_responses;
CREATE POLICY "Allow write access to system" ON public.heart_survey_responses
  FOR INSERT TO authenticated WITH CHECK (true);

-- Pendo Events Cache
ALTER TABLE public.pendo_events_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.pendo_events_cache;
CREATE POLICY "Allow read access to authenticated users" ON public.pendo_events_cache
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow write access to admins" ON public.pendo_events_cache;
CREATE POLICY "Allow write access to admins" ON public.pendo_events_cache
  FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );
