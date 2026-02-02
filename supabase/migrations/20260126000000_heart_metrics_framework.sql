-- HEART Metrics Framework Migration
-- Implements Google's HEART framework for feature success measurement
-- Replaces the complex manual metric configuration with AI-assisted setup

-- ============================================================================
-- HEART Categories (System-defined, immutable reference table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.heart_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL, -- emoji for UI display
  sort_order int NOT NULL,
  requires_survey boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the 5 HEART categories
INSERT INTO public.heart_categories (id, name, description, icon, sort_order, requires_survey) VALUES
  ('happiness', 'Happiness', 'User satisfaction and sentiment', '😊', 1, true),
  ('engagement', 'Engagement', 'Depth and frequency of feature usage', '📈', 2, false),
  ('adoption', 'Adoption', 'Percentage of eligible users trying the feature', '🚀', 3, false),
  ('retention', 'Retention', 'Users returning to use the feature again', '🔄', 4, false),
  ('task_success', 'Task Success', 'Users completing key workflows successfully', '✅', 5, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- HEART Measurement Types (how metrics are calculated)
-- ============================================================================
CREATE TYPE heart_measurement_type AS ENUM (
  'events_per_user',           -- Engagement: total events / unique users
  'events_per_user_per_week',  -- Engagement: events per user per week
  'unique_users_percentage',    -- Adoption: unique users / total eligible users
  'unique_users_count',         -- Adoption: raw count of users who used feature
  'return_rate_7_days',         -- Retention: % who used again within 7 days
  'return_rate_14_days',        -- Retention: % who used again within 14 days
  'return_rate_30_days',        -- Retention: % who used again within 30 days
  'completion_rate',            -- Task Success: completions / starts
  'success_rate',               -- Task Success: successes / attempts
  'survey_score',               -- Happiness: average survey response
  'nps_score'                   -- Happiness: Net Promoter Score
);

-- ============================================================================
-- Epic HEART Configs (Per-epic HEART setup)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.epic_heart_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  setup_method text NOT NULL CHECK (setup_method IN ('auto', 'ai_assisted', 'manual')),
  ai_model_version text NULL, -- Track which AI model made suggestions
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_by uuid NOT NULL REFERENCES public.app_user(id),
  approved_by uuid NULL REFERENCES public.app_user(id),
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(epic_id)
);

CREATE INDEX IF NOT EXISTS idx_epic_heart_configs_epic 
  ON public.epic_heart_configs(epic_id);

CREATE INDEX IF NOT EXISTS idx_epic_heart_configs_status 
  ON public.epic_heart_configs(status);

-- ============================================================================
-- Epic HEART Metrics (Individual metrics per HEART category per epic)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.epic_heart_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_heart_config_id uuid NOT NULL REFERENCES public.epic_heart_configs(id) ON DELETE CASCADE,
  heart_category text NOT NULL REFERENCES public.heart_categories(id),
  
  -- Metric definition
  name text NOT NULL, -- Human-readable name for this metric
  description text NULL, -- Optional description
  measurement_type heart_measurement_type NOT NULL,
  
  -- Pendo configuration
  pendo_event_ids text[] NOT NULL DEFAULT '{}', -- One or more Pendo events
  pendo_segment_id text NULL, -- Optional segment filter
  pendo_app_id text NULL, -- Optional app filter
  
  -- Targets
  target_value numeric NULL, -- Target to achieve (e.g., 80 for 80%)
  target_timeframe_days int NULL, -- Days to achieve target (e.g., 60)
  
  -- AI metadata
  ai_suggested boolean NOT NULL DEFAULT false,
  ai_rationale text NULL, -- Why AI suggested this metric
  
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One metric per category per config
  UNIQUE(epic_heart_config_id, heart_category)
);

CREATE INDEX IF NOT EXISTS idx_epic_heart_metrics_config 
  ON public.epic_heart_metrics(epic_heart_config_id);

CREATE INDEX IF NOT EXISTS idx_epic_heart_metrics_category 
  ON public.epic_heart_metrics(heart_category);

-- ============================================================================
-- Epic HEART Snapshots (Daily metric values)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.epic_heart_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_heart_metric_id uuid NOT NULL REFERENCES public.epic_heart_metrics(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  
  -- Metric value
  value numeric NULL, -- The calculated value
  target_at_snapshot numeric NULL, -- What the target was at this point
  
  -- Status calculation
  status text NOT NULL CHECK (status IN ('ON_TRACK', 'AT_RISK', 'MISSED', 'PENDING')),
  
  -- Raw data for debugging
  pendo_raw_data jsonb NULL,
  
  -- Metadata
  calculated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(epic_heart_metric_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_epic_heart_snapshots_metric_date 
  ON public.epic_heart_snapshots(epic_heart_metric_id, snapshot_date DESC);

-- ============================================================================
-- HEART Surveys (for Happiness metric)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.heart_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_heart_metric_id uuid NOT NULL REFERENCES public.epic_heart_metrics(id) ON DELETE CASCADE,
  
  -- Survey definition
  survey_type text NOT NULL CHECK (survey_type IN ('nps', 'satisfaction', 'yes_no', 'custom')),
  question text NOT NULL,
  
  -- Targeting
  target_event_ids text[] NULL, -- Users who triggered these events
  target_segment_id text NULL,
  min_uses_before_survey int DEFAULT 1,
  days_after_first_use int DEFAULT 14,
  
  -- Lifecycle
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'active', 'paused', 'completed', 'cancelled')),
  
  -- Audit trail
  created_by uuid NOT NULL REFERENCES public.app_user(id),
  activated_by uuid NULL REFERENCES public.app_user(id),
  activated_at timestamptz NULL,
  paused_by uuid NULL REFERENCES public.app_user(id),
  paused_at timestamptz NULL,
  
  -- Pendo integration
  pendo_guide_id text NULL, -- Filled when created in Pendo
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heart_surveys_metric 
  ON public.heart_surveys(epic_heart_metric_id);

CREATE INDEX IF NOT EXISTS idx_heart_surveys_status 
  ON public.heart_surveys(status);

-- ============================================================================
-- HEART Survey Responses (pulled from Pendo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.heart_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heart_survey_id uuid NOT NULL REFERENCES public.heart_surveys(id) ON DELETE CASCADE,
  pendo_visitor_id text NOT NULL,
  response_value numeric NOT NULL, -- 1-5, 0-10, or 0/1 for yes/no
  responded_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(heart_survey_id, pendo_visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_heart_survey_responses_survey 
  ON public.heart_survey_responses(heart_survey_id);

-- ============================================================================
-- Pendo Events Cache (for AI agent context)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pendo_events_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL UNIQUE,
  product_area text NULL,
  description text NULL,
  user_count int NULL,
  event_count int NULL,
  last_seen_at timestamptz NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pendo_events_cache_product_area 
  ON public.pendo_events_cache(product_area);

CREATE INDEX IF NOT EXISTS idx_pendo_events_cache_synced 
  ON public.pendo_events_cache(synced_at);

-- ============================================================================
-- Row-Level Security Policies
-- ============================================================================

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

-- Only CS, Product Ops, CPO, Superadmin can activate/update surveys
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

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_heart_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS epic_heart_configs_updated_at ON public.epic_heart_configs;
CREATE TRIGGER epic_heart_configs_updated_at
  BEFORE UPDATE ON public.epic_heart_configs
  FOR EACH ROW EXECUTE FUNCTION update_heart_updated_at();

DROP TRIGGER IF EXISTS epic_heart_metrics_updated_at ON public.epic_heart_metrics;
CREATE TRIGGER epic_heart_metrics_updated_at
  BEFORE UPDATE ON public.epic_heart_metrics
  FOR EACH ROW EXECUTE FUNCTION update_heart_updated_at();

DROP TRIGGER IF EXISTS heart_surveys_updated_at ON public.heart_surveys;
CREATE TRIGGER heart_surveys_updated_at
  BEFORE UPDATE ON public.heart_surveys
  FOR EACH ROW EXECUTE FUNCTION update_heart_updated_at();

-- ============================================================================
-- Comments for Documentation
-- ============================================================================
COMMENT ON TABLE public.heart_categories IS 'The 5 HEART framework categories: Happiness, Engagement, Adoption, Retention, Task Success';
COMMENT ON TABLE public.epic_heart_configs IS 'Per-epic HEART metrics configuration with setup method tracking';
COMMENT ON TABLE public.epic_heart_metrics IS 'Individual metric definitions for each HEART category per epic';
COMMENT ON TABLE public.epic_heart_snapshots IS 'Daily snapshots of HEART metric values from Pendo';
COMMENT ON TABLE public.heart_surveys IS 'Survey configurations for Happiness metric (requires CS approval to activate)';
COMMENT ON TABLE public.heart_survey_responses IS 'Survey responses synced from Pendo';
COMMENT ON TABLE public.pendo_events_cache IS 'Cached Pendo events for AI agent context';
