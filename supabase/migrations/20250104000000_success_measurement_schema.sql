-- Success Measurement Schema Migration
-- Creates tables for launch success measurement feature

-- ============================================================================
-- Adoption Benchmarks Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.adoption_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  launch_tier text NOT NULL CHECK (launch_tier IN ('TIER_1', 'TIER_2', 'TIER_3')),
  feature_type text NOT NULL,
  target_persona text NOT NULL,
  horizon_days int[] NOT NULL,
  expected_activation numeric[] NOT NULL,
  expected_usage_depth numeric[] NULL,
  expected_ttfv_days int NULL,
  segment_modifiers jsonb NULL,
  is_default boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adoption_benchmarks_tier_type 
  ON public.adoption_benchmarks(launch_tier, feature_type);

-- ============================================================================
-- Success Metrics Catalog Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.success_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('ADOPTION', 'REVENUE', 'RETENTION', 'ENABLEMENT', 'FRICTION')),
  description text NULL,
  measurement_type text NOT NULL CHECK (measurement_type IN ('PERCENTAGE', 'COUNT', 'DURATION', 'BOOLEAN')),
  source text NOT NULL CHECK (source IN ('PENDO', 'SNOWFLAKE', 'MANUAL')),
  pendo_event_id text NULL,
  leading_or_lagging text NOT NULL CHECK (leading_or_lagging IN ('LEADING', 'LAGGING')),
  thresholds jsonb NOT NULL, -- { TIER_1: {...}, TIER_2: {...}, TIER_3: {...} }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Epic Success Configs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.epic_success_configs (
  epic_id uuid PRIMARY KEY REFERENCES public.epic(id) ON DELETE CASCADE,
  benchmark_id uuid NOT NULL REFERENCES public.adoption_benchmarks(id),
  post_launch_owner uuid NOT NULL REFERENCES public.app_user(id),
  locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Epic Success Metrics Mapping Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.epic_success_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.success_metrics(id) ON DELETE CASCADE,
  threshold_override jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(epic_id, metric_id)
);

CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_epic 
  ON public.epic_success_metrics(epic_id);

-- ============================================================================
-- Pendo Integration Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pendo_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_encrypted text NOT NULL,
  environment text NOT NULL DEFAULT 'prod',
  last_sync timestamptz NULL,
  status text NOT NULL DEFAULT 'disconnected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Scorecard Snapshots Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.epic_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  metric_results jsonb NOT NULL,
  benchmark_comparison jsonb NOT NULL,
  overall_status text NOT NULL CHECK (overall_status IN ('ON_TRACK', 'AT_RISK', 'MISSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(epic_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_epic_scorecards_epic_date 
  ON public.epic_scorecards(epic_id, snapshot_date);

-- ============================================================================
-- Retrospectives Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.epic_retros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  day_marker int NOT NULL CHECK (day_marker IN (30, 60, 90)),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUBMITTED')),
  outcome text NULL CHECK (outcome IN ('YES', 'PARTIAL', 'NO')),
  blockers text[] NULL,
  assumptions_wrong text NULL,
  repeat_next_time text NULL,
  change_next_time text NULL,
  action_items jsonb NULL,
  submitted_by uuid NULL REFERENCES public.app_user(id),
  submitted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(epic_id, day_marker)
);

CREATE INDEX IF NOT EXISTS idx_epic_retros_epic 
  ON public.epic_retros(epic_id);

-- ============================================================================
-- Row-Level Security Policies
-- ============================================================================

-- Adoption Benchmarks
ALTER TABLE public.adoption_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.adoption_benchmarks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to admins" ON public.adoption_benchmarks
  FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );

-- Success Metrics
ALTER TABLE public.success_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.success_metrics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to admins" ON public.success_metrics
  FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );

-- Epic Success Configs
ALTER TABLE public.epic_success_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.epic_success_configs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to PMs and admins" ON public.epic_success_configs
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

-- Epic Success Metrics
ALTER TABLE public.epic_success_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.epic_success_metrics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to PMs and admins" ON public.epic_success_metrics
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

-- Pendo Integrations
ALTER TABLE public.pendo_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to admins" ON public.pendo_integrations
  FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );

CREATE POLICY "Allow write access to admins" ON public.pendo_integrations
  FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user 
      WHERE email = (auth.jwt()->>'email')
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );

-- Epic Scorecards
ALTER TABLE public.epic_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.epic_scorecards
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to system" ON public.epic_scorecards
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update access to system" ON public.epic_scorecards
  FOR UPDATE TO authenticated USING (true);

-- Epic Retros
ALTER TABLE public.epic_retros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.epic_retros
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to PMs and admins" ON public.epic_retros
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

-- ============================================================================
-- Comments for Documentation
-- ============================================================================
COMMENT ON TABLE public.adoption_benchmarks IS 'Benchmark adoption curves by tier, feature type, and persona';
COMMENT ON TABLE public.success_metrics IS 'Catalog of success metrics that can be tracked for epics';
COMMENT ON TABLE public.epic_success_configs IS 'Configuration linking epics to benchmarks and post-launch owners';
COMMENT ON TABLE public.epic_success_metrics IS 'Mapping of metrics to track for each epic (3-7 metrics per epic)';
COMMENT ON TABLE public.pendo_integrations IS 'Pendo API integration configuration';
COMMENT ON TABLE public.epic_scorecards IS 'Daily snapshots of epic success metrics vs benchmarks';
COMMENT ON TABLE public.epic_retros IS 'Retrospectives at T+30, T+60, T+90 days post-launch';

