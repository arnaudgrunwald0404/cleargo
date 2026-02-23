-- Bootstrap success_metrics, epic_success_metrics, and epic_success_metric_history when missing.
-- Use when the remote DB never ran 20250104 (or success measurement migrations were skipped).
-- Idempotent: uses IF NOT EXISTS / conditional creation throughout.
-- Includes GRANTs so authenticated and service_role can access tables.

-- ---------------------------------------------------------------------------
-- 1. success_metrics (catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.success_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('ADOPTION', 'REVENUE', 'RETENTION', 'ENABLEMENT', 'FRICTION')),
  description text NULL,
  measurement_type text NOT NULL CHECK (measurement_type IN ('PERCENTAGE', 'COUNT', 'DURATION', 'BOOLEAN')),
  source text NOT NULL CHECK (source IN ('PENDO', 'SNOWFLAKE', 'MANUAL')),
  pendo_event_id text NULL,
  leading_or_lagging text NOT NULL CHECK (leading_or_lagging IN ('LEADING', 'LAGGING')),
  thresholds jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'success_metrics' AND schemaname = 'public') THEN
    ALTER TABLE public.success_metrics ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow read access to authenticated users" ON public.success_metrics
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Allow write access to admins" ON public.success_metrics
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.app_user
          WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
          AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.success_metrics TO authenticated;
GRANT ALL ON public.success_metrics TO service_role;

-- ---------------------------------------------------------------------------
-- 2. epic_success_metrics (per-epic metric mapping with target/config)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epic_success_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.success_metrics(id) ON DELETE CASCADE,
  threshold_override jsonb NULL,
  target numeric NULL,
  pendo_event_id text NULL,
  snowflake_query text NULL,
  manual_label text NULL,
  pendo_segment_ids text[] NULL,
  pendo_segment_names text[] NULL,
  pendo_app_ids text[] NULL,
  pendo_app_names text[] NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(epic_id, metric_id)
);

CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_epic ON public.epic_success_metrics(epic_id);
CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_metric_id ON public.epic_success_metrics(metric_id);
CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_target ON public.epic_success_metrics(target) WHERE target IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_pendo_event ON public.epic_success_metrics(pendo_event_id) WHERE pendo_event_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'epic_success_metrics' AND schemaname = 'public') THEN
    ALTER TABLE public.epic_success_metrics ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow read access to authenticated users" ON public.epic_success_metrics
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Allow insert access to PMs and admins" ON public.epic_success_metrics
      FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.app_user
          WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
          AND (roles @> ARRAY['PM']::text[] OR roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
        )
      );
    CREATE POLICY "Allow update access to PMs and admins" ON public.epic_success_metrics
      FOR UPDATE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.app_user
          WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
          AND (roles @> ARRAY['PM']::text[] OR roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
        )
      );
    CREATE POLICY "Allow delete access to PMs and admins" ON public.epic_success_metrics
      FOR DELETE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.app_user
          WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
          AND (roles @> ARRAY['PM']::text[] OR roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_success_metrics TO authenticated;
GRANT ALL ON public.epic_success_metrics TO service_role;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_epic_success_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_epic_success_metrics_updated_at_trigger ON public.epic_success_metrics;
CREATE TRIGGER update_epic_success_metrics_updated_at_trigger
  BEFORE UPDATE ON public.epic_success_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_epic_success_metrics_updated_at();

-- ---------------------------------------------------------------------------
-- 3. epic_success_metric_history (only if not already present)
-- ---------------------------------------------------------------------------
DO $history$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'epic_success_metric_history') THEN
    RETURN;
  END IF;

  CREATE TABLE public.epic_success_metric_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    epic_success_metric_id uuid NULL REFERENCES public.epic_success_metrics(id) ON DELETE CASCADE,
    epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
    metric_id uuid NOT NULL REFERENCES public.success_metrics(id) ON DELETE CASCADE,
    change_type text NOT NULL CHECK (change_type IN (
      'METRIC_ADDED', 'METRIC_REMOVED', 'TARGET_SET', 'TARGET_UPDATED', 'EVENT_CONFIG_UPDATED'
    )),
    changed_by uuid NOT NULL REFERENCES public.app_user(id),
    old_value jsonb NULL,
    new_value jsonb NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_epic ON public.epic_success_metric_history(epic_id, changed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_epic_metric ON public.epic_success_metric_history(epic_success_metric_id);
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_metric ON public.epic_success_metric_history(metric_id);
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_change_type ON public.epic_success_metric_history(change_type);
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_changed_by ON public.epic_success_metric_history(changed_by);

  ALTER TABLE public.epic_success_metric_history ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow read access to authenticated users" ON public.epic_success_metric_history
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Allow write access to PMs and admins" ON public.epic_success_metric_history
    FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.app_user
        WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
        AND (roles @> ARRAY['PM']::text[] OR roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
      )
    );

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_success_metric_history TO authenticated;
  GRANT ALL ON public.epic_success_metric_history TO service_role;

  RAISE NOTICE 'Created table public.epic_success_metric_history (bootstrap).';
END $history$;

-- History logging function and trigger
CREATE OR REPLACE FUNCTION public.log_epic_success_metric_history()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_change_type text;
  v_old_value jsonb;
  v_new_value jsonb;
BEGIN
  v_email := (auth.jwt()->>'email');
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM public.app_user WHERE LOWER(email) = LOWER(v_email) LIMIT 1;
  END IF;
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.epic_success_metric_history (
      epic_success_metric_id, epic_id, metric_id, change_type, changed_by, new_value
    ) VALUES (
      NEW.id, NEW.epic_id, NEW.metric_id, 'METRIC_ADDED', v_user_id,
      jsonb_build_object('target', NEW.target, 'pendo_event_id', NEW.pendo_event_id, 'snowflake_query', NEW.snowflake_query, 'manual_label', NEW.manual_label, 'threshold_override', NEW.threshold_override)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_value := jsonb_build_object('target', OLD.target, 'pendo_event_id', OLD.pendo_event_id, 'snowflake_query', OLD.snowflake_query, 'manual_label', OLD.manual_label, 'threshold_override', OLD.threshold_override);
    v_new_value := jsonb_build_object('target', NEW.target, 'pendo_event_id', NEW.pendo_event_id, 'snowflake_query', NEW.snowflake_query, 'manual_label', NEW.manual_label, 'threshold_override', NEW.threshold_override);
    IF OLD.target IS NULL AND NEW.target IS NOT NULL THEN
      v_change_type := 'TARGET_SET';
    ELSIF OLD.target IS DISTINCT FROM NEW.target THEN
      v_change_type := 'TARGET_UPDATED';
    ELSE
      v_change_type := 'EVENT_CONFIG_UPDATED';
    END IF;
    INSERT INTO public.epic_success_metric_history (
      epic_success_metric_id, epic_id, metric_id, change_type, changed_by, old_value, new_value
    ) VALUES (NEW.id, NEW.epic_id, NEW.metric_id, v_change_type, v_user_id, v_old_value, v_new_value);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.epic_success_metric_history (
      epic_success_metric_id, epic_id, metric_id, change_type, changed_by, old_value
    ) VALUES (
      OLD.id, OLD.epic_id, OLD.metric_id, 'METRIC_REMOVED', v_user_id,
      jsonb_build_object('target', OLD.target, 'pendo_event_id', OLD.pendo_event_id, 'snowflake_query', OLD.snowflake_query, 'manual_label', OLD.manual_label, 'threshold_override', OLD.threshold_override)
    );
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS epic_success_metric_history_trigger ON public.epic_success_metrics;
CREATE TRIGGER epic_success_metric_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.epic_success_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.log_epic_success_metric_history();
