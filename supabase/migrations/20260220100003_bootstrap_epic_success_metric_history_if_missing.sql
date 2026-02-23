-- Bootstrap epic_success_metric_history when the table is missing (e.g. remote never ran 20260122000001).
-- Idempotent: only creates table, policies, function, trigger, and grants if table doesn't exist.
-- Requires epic_success_metrics and success_metrics to exist.

DO $bootstrap$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'epic_success_metric_history') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'epic_success_metrics') THEN
    RAISE NOTICE 'epic_success_metrics table does not exist, skipping epic_success_metric_history bootstrap';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'success_metrics') THEN
    RAISE NOTICE 'success_metrics table does not exist, skipping epic_success_metric_history bootstrap';
    RETURN;
  END IF;

  CREATE TABLE public.epic_success_metric_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    epic_success_metric_id uuid NULL REFERENCES public.epic_success_metrics(id) ON DELETE CASCADE,
    epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
    metric_id uuid NOT NULL REFERENCES public.success_metrics(id) ON DELETE CASCADE,
    change_type text NOT NULL CHECK (change_type IN (
      'METRIC_ADDED',
      'METRIC_REMOVED',
      'TARGET_SET',
      'TARGET_UPDATED',
      'EVENT_CONFIG_UPDATED'
    )),
    changed_by uuid NOT NULL REFERENCES public.app_user(id),
    old_value jsonb NULL,
    new_value jsonb NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_epic
    ON public.epic_success_metric_history(epic_id, changed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_epic_metric
    ON public.epic_success_metric_history(epic_success_metric_id);
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_metric
    ON public.epic_success_metric_history(metric_id);
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_change_type
    ON public.epic_success_metric_history(change_type);
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_changed_by
    ON public.epic_success_metric_history(changed_by);

  COMMENT ON TABLE public.epic_success_metric_history IS 'History of all changes to epic success metrics, including metric additions/removals, target changes, and event configuration updates.';

  ALTER TABLE public.epic_success_metric_history ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Allow read access to authenticated users" ON public.epic_success_metric_history
    FOR SELECT TO authenticated USING (true);

  CREATE POLICY "Allow write access to PMs and admins" ON public.epic_success_metric_history
    FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.app_user
        WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
        AND (
          roles @> ARRAY['PM']::text[]
          OR roles @> ARRAY['PRODUCT_OPS']::text[]
          OR roles @> ARRAY['CPO']::text[]
          OR roles @> ARRAY['SUPERADMIN']::text[]
        )
      )
    );

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_success_metric_history TO authenticated;
  GRANT ALL ON public.epic_success_metric_history TO service_role;

  RAISE NOTICE 'Created table public.epic_success_metric_history (bootstrap).';
END $bootstrap$;

-- Function: resolve auth email to app_user.id and log history (SECURITY DEFINER)
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
    v_change_type := 'METRIC_ADDED';
    v_new_value := jsonb_build_object(
      'target', NEW.target,
      'pendo_event_id', NEW.pendo_event_id,
      'snowflake_query', NEW.snowflake_query,
      'manual_label', NEW.manual_label,
      'threshold_override', NEW.threshold_override
    );
    INSERT INTO public.epic_success_metric_history (
      epic_success_metric_id, epic_id, metric_id, change_type, changed_by, new_value
    ) VALUES (NEW.id, NEW.epic_id, NEW.metric_id, v_change_type, v_user_id, v_new_value);
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
    v_change_type := 'METRIC_REMOVED';
    v_old_value := jsonb_build_object('target', OLD.target, 'pendo_event_id', OLD.pendo_event_id, 'snowflake_query', OLD.snowflake_query, 'manual_label', OLD.manual_label, 'threshold_override', OLD.threshold_override);
    INSERT INTO public.epic_success_metric_history (
      epic_success_metric_id, epic_id, metric_id, change_type, changed_by, old_value
    ) VALUES (OLD.id, OLD.epic_id, OLD.metric_id, v_change_type, v_user_id, v_old_value);
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger only if table was just created (same connection): create trigger on epic_success_metrics
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'epic_success_metric_history') THEN
    DROP TRIGGER IF EXISTS epic_success_metric_history_trigger ON public.epic_success_metrics;
    CREATE TRIGGER epic_success_metric_history_trigger
      AFTER INSERT OR UPDATE OR DELETE ON public.epic_success_metrics
      FOR EACH ROW
      EXECUTE FUNCTION public.log_epic_success_metric_history();
  END IF;
END $$;
