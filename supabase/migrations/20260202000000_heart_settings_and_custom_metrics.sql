-- HEART Settings & Custom Metrics Migration
-- Enables admin-configurable defaults and custom metrics beyond the 5 HEART categories

-- ============================================================================
-- HEART Category Defaults (Admin-configurable default targets)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.heart_category_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heart_category text NOT NULL REFERENCES public.heart_categories(id),
  
  -- Default targets
  default_target_value numeric NULL, -- e.g., 75 for 75%
  default_target_timeframe_days int NULL, -- e.g., 30 days
  
  -- Default measurement type
  default_measurement_type heart_measurement_type NULL,
  
  -- Guidance for users
  guidance_text text NULL, -- Help text shown during setup
  example_events text[] NULL, -- Example Pendo event patterns to look for
  
  -- Metadata
  updated_by uuid NULL REFERENCES public.app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(heart_category)
);

-- Insert default settings for each HEART category
INSERT INTO public.heart_category_defaults (heart_category, default_target_value, default_target_timeframe_days, default_measurement_type, guidance_text) VALUES
  ('happiness', 4.0, 30, 'survey_score', 'Target average satisfaction score (1-5 scale). Consider using NPS for more detailed sentiment.'),
  ('engagement', 3.0, 14, 'events_per_user_per_week', 'Target interactions per user per week. Higher is better for sticky features.'),
  ('adoption', 75, 30, 'unique_users_percentage', 'Target percentage of eligible users who try the feature within the timeframe.'),
  ('retention', 60, 30, 'return_rate_30_days', 'Target percentage of users who return to use the feature again.'),
  ('task_success', 85, 14, 'completion_rate', 'Target percentage of users who successfully complete the key workflow.')
ON CONFLICT (heart_category) DO NOTHING;

-- ============================================================================
-- Custom Metric Templates (Reusable metric definitions beyond HEART)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.heart_custom_metric_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template definition
  name text NOT NULL,
  description text NULL,
  category_label text NOT NULL, -- Custom category name (e.g., "Revenue Impact", "Time Saved")
  icon text NOT NULL DEFAULT '📊', -- Emoji for UI display
  
  -- Measurement configuration
  measurement_type heart_measurement_type NOT NULL,
  pendo_event_pattern text NULL, -- Regex or pattern to help find events
  
  -- Default targets
  default_target_value numeric NULL,
  default_target_timeframe_days int NULL,
  
  -- Template metadata
  is_active boolean NOT NULL DEFAULT true,
  usage_count int NOT NULL DEFAULT 0, -- Track how often this template is used
  
  created_by uuid NOT NULL REFERENCES public.app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heart_custom_metric_templates_active 
  ON public.heart_custom_metric_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- Extend epic_heart_metrics to support custom metrics
-- ============================================================================

-- Add columns for custom metrics (if they don't exist)
DO $$
BEGIN
  -- Add is_custom flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'epic_heart_metrics' AND column_name = 'is_custom' AND table_schema = 'public') THEN
    ALTER TABLE public.epic_heart_metrics ADD COLUMN is_custom boolean NOT NULL DEFAULT false;
  END IF;
  
  -- Add custom_category_label for non-HEART metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'epic_heart_metrics' AND column_name = 'custom_category_label' AND table_schema = 'public') THEN
    ALTER TABLE public.epic_heart_metrics ADD COLUMN custom_category_label text NULL;
  END IF;
  
  -- Add custom_icon for non-HEART metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'epic_heart_metrics' AND column_name = 'custom_icon' AND table_schema = 'public') THEN
    ALTER TABLE public.epic_heart_metrics ADD COLUMN custom_icon text NULL DEFAULT '📊';
  END IF;
  
  -- Add template reference
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'epic_heart_metrics' AND column_name = 'template_id' AND table_schema = 'public') THEN
    ALTER TABLE public.epic_heart_metrics ADD COLUMN template_id uuid NULL REFERENCES public.heart_custom_metric_templates(id);
  END IF;
END $$;

-- Make heart_category nullable for custom metrics
ALTER TABLE public.epic_heart_metrics 
  ALTER COLUMN heart_category DROP NOT NULL;

-- Drop the old unique constraint that enforces one metric per category
ALTER TABLE public.epic_heart_metrics 
  DROP CONSTRAINT IF EXISTS epic_heart_metrics_epic_heart_config_id_heart_category_key;

-- Add a new constraint: for HEART categories, still enforce uniqueness; custom metrics can have multiple
CREATE UNIQUE INDEX IF NOT EXISTS idx_epic_heart_metrics_unique_category
  ON public.epic_heart_metrics(epic_heart_config_id, heart_category) 
  WHERE heart_category IS NOT NULL AND is_custom = false;

-- Add check constraint: custom metrics must have custom_category_label, HEART metrics must have heart_category
ALTER TABLE public.epic_heart_metrics 
  DROP CONSTRAINT IF EXISTS epic_heart_metrics_category_check;
  
ALTER TABLE public.epic_heart_metrics 
  ADD CONSTRAINT epic_heart_metrics_category_check CHECK (
    (is_custom = false AND heart_category IS NOT NULL) OR
    (is_custom = true AND custom_category_label IS NOT NULL)
  );

-- Add index for custom metrics
CREATE INDEX IF NOT EXISTS idx_epic_heart_metrics_custom 
  ON public.epic_heart_metrics(is_custom) WHERE is_custom = true;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- heart_category_defaults: readable by all, writable by admins
ALTER TABLE public.heart_category_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heart_category_defaults_read" ON public.heart_category_defaults;
CREATE POLICY "heart_category_defaults_read" ON public.heart_category_defaults
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "heart_category_defaults_write" ON public.heart_category_defaults;
CREATE POLICY "heart_category_defaults_write" ON public.heart_category_defaults
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.app_user au 
      WHERE au.id = auth.uid() 
      AND (
        au.role IN ('SUPERADMIN', 'CPO', 'PRODUCT_OPS') OR
        'SUPERADMIN' = ANY(au.roles) OR
        'CPO' = ANY(au.roles) OR
        'PRODUCT_OPS' = ANY(au.roles)
      )
    )
  );

-- heart_custom_metric_templates: readable by all, writable by admins
ALTER TABLE public.heart_custom_metric_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heart_custom_metric_templates_read" ON public.heart_custom_metric_templates;
CREATE POLICY "heart_custom_metric_templates_read" ON public.heart_custom_metric_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "heart_custom_metric_templates_write" ON public.heart_custom_metric_templates;
CREATE POLICY "heart_custom_metric_templates_write" ON public.heart_custom_metric_templates
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.app_user au 
      WHERE au.id = auth.uid() 
      AND (
        au.role IN ('SUPERADMIN', 'CPO', 'PRODUCT_OPS') OR
        'SUPERADMIN' = ANY(au.roles) OR
        'CPO' = ANY(au.roles) OR
        'PRODUCT_OPS' = ANY(au.roles)
      )
    )
  );

-- ============================================================================
-- Updated timestamp triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION update_heart_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS heart_category_defaults_updated_at ON public.heart_category_defaults;
CREATE TRIGGER heart_category_defaults_updated_at
  BEFORE UPDATE ON public.heart_category_defaults
  FOR EACH ROW EXECUTE FUNCTION update_heart_settings_updated_at();

DROP TRIGGER IF EXISTS heart_custom_metric_templates_updated_at ON public.heart_custom_metric_templates;
CREATE TRIGGER heart_custom_metric_templates_updated_at
  BEFORE UPDATE ON public.heart_custom_metric_templates
  FOR EACH ROW EXECUTE FUNCTION update_heart_settings_updated_at();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE public.heart_category_defaults IS 'Admin-configurable default targets for each HEART category';
COMMENT ON TABLE public.heart_custom_metric_templates IS 'Reusable custom metric templates beyond the 5 HEART categories';
COMMENT ON COLUMN public.epic_heart_metrics.is_custom IS 'True for custom metrics not part of standard HEART categories';
COMMENT ON COLUMN public.epic_heart_metrics.custom_category_label IS 'Category label for custom metrics (e.g., "Revenue Impact")';
COMMENT ON COLUMN public.epic_heart_metrics.template_id IS 'Reference to custom metric template if created from one';
