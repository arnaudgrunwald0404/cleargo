-- Create epic_success_metric_history table to track all changes
-- This provides accountability for metric and target changes
-- Note: Only runs if required tables exist (may not exist in all deployments)

DO $$ 
BEGIN
  -- Check if required tables exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic_success_metrics' AND table_schema = 'public') THEN
    RAISE NOTICE 'epic_success_metrics table does not exist, skipping migration';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'success_metrics' AND table_schema = 'public') THEN
    RAISE NOTICE 'success_metrics table does not exist, skipping migration';
    RETURN;
  END IF;

  -- Create table if not exists
  CREATE TABLE IF NOT EXISTS public.epic_success_metric_history (
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

  -- Create indexes for efficient querying
  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_epic 
    ON public.epic_success_metric_history(epic_id, changed_at DESC);

  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_epic_metric 
    ON public.epic_success_metric_history(epic_success_metric_id);

  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_metric 
    ON public.epic_success_metric_history(metric_id);

  CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_change_type 
    ON public.epic_success_metric_history(change_type);

  -- Enable RLS
  ALTER TABLE public.epic_success_metric_history ENABLE ROW LEVEL SECURITY;

  -- Allow read access to authenticated users
  DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.epic_success_metric_history;
  CREATE POLICY "Allow read access to authenticated users" ON public.epic_success_metric_history
    FOR SELECT TO authenticated USING (true);

  -- Allow write access to PMs and admins (history is created by triggers)
  DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.epic_success_metric_history;
  CREATE POLICY "Allow write access to PMs and admins" ON public.epic_success_metric_history
    FOR INSERT TO authenticated 
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.app_user 
        WHERE id = (auth.jwt()->>'sub')::uuid
        AND (
          roles @> ARRAY['PM']::text[] 
          OR roles @> ARRAY['PRODUCT_OPS']::text[] 
          OR roles @> ARRAY['CPO']::text[] 
          OR roles @> ARRAY['SUPERADMIN']::text[]
        )
      )
    );

  COMMENT ON TABLE public.epic_success_metric_history IS 'History of all changes to epic success metrics, including metric additions/removals, target changes, and event configuration updates.';
END $$;

-- Function to log history entry (created outside DO block)
CREATE OR REPLACE FUNCTION log_epic_success_metric_history()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_change_type text;
  v_old_value jsonb;
  v_new_value jsonb;
BEGIN
  -- Get current user ID from auth context
  v_user_id := (auth.jwt()->>'sub')::uuid;
  
  -- If no user in context (e.g., system operations), skip logging
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Determine change type and values
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
      epic_success_metric_id,
      epic_id,
      metric_id,
      change_type,
      changed_by,
      new_value
    ) VALUES (
      NEW.id,
      NEW.epic_id,
      NEW.metric_id,
      v_change_type,
      v_user_id,
      v_new_value
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_value := jsonb_build_object(
      'target', OLD.target,
      'pendo_event_id', OLD.pendo_event_id,
      'snowflake_query', OLD.snowflake_query,
      'manual_label', OLD.manual_label,
      'threshold_override', OLD.threshold_override
    );
    v_new_value := jsonb_build_object(
      'target', NEW.target,
      'pendo_event_id', NEW.pendo_event_id,
      'snowflake_query', NEW.snowflake_query,
      'manual_label', NEW.manual_label,
      'threshold_override', NEW.threshold_override
    );
    
    -- Determine specific change type
    IF OLD.target IS NULL AND NEW.target IS NOT NULL THEN
      v_change_type := 'TARGET_SET';
    ELSIF OLD.target IS DISTINCT FROM NEW.target THEN
      v_change_type := 'TARGET_UPDATED';
    ELSIF (
      OLD.pendo_event_id IS DISTINCT FROM NEW.pendo_event_id OR
      OLD.snowflake_query IS DISTINCT FROM NEW.snowflake_query OR
      OLD.manual_label IS DISTINCT FROM NEW.manual_label
    ) THEN
      v_change_type := 'EVENT_CONFIG_UPDATED';
    ELSE
      -- Other changes (like threshold_override), log as EVENT_CONFIG_UPDATED
      v_change_type := 'EVENT_CONFIG_UPDATED';
    END IF;
    
    INSERT INTO public.epic_success_metric_history (
      epic_success_metric_id,
      epic_id,
      metric_id,
      change_type,
      changed_by,
      old_value,
      new_value
    ) VALUES (
      NEW.id,
      NEW.epic_id,
      NEW.metric_id,
      v_change_type,
      v_user_id,
      v_old_value,
      v_new_value
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    v_change_type := 'METRIC_REMOVED';
    v_old_value := jsonb_build_object(
      'target', OLD.target,
      'pendo_event_id', OLD.pendo_event_id,
      'snowflake_query', OLD.snowflake_query,
      'manual_label', OLD.manual_label,
      'threshold_override', OLD.threshold_override
    );
    
    INSERT INTO public.epic_success_metric_history (
      epic_success_metric_id,
      epic_id,
      metric_id,
      change_type,
      changed_by,
      old_value
    ) VALUES (
      OLD.id,
      OLD.epic_id,
      OLD.metric_id,
      v_change_type,
      v_user_id,
      v_old_value
    );
    
    RETURN OLD;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic_success_metrics' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS epic_success_metric_history_trigger ON public.epic_success_metrics;
    CREATE TRIGGER epic_success_metric_history_trigger
      AFTER INSERT OR UPDATE OR DELETE ON public.epic_success_metrics
      FOR EACH ROW
      EXECUTE FUNCTION log_epic_success_metric_history();
  END IF;
END $$;
