-- Fix history trigger to map current auth email to app_user.id, avoiding FK violations
-- and relax policy to check roles by email instead of auth sub UUID
-- Note: Only runs if required tables exist

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic_success_metric_history' AND table_schema = 'public') THEN
    RAISE NOTICE 'epic_success_metric_history table does not exist, skipping migration';
    RETURN;
  END IF;

  -- Update the INSERT policy to check roles by email
  DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.epic_success_metric_history;
  CREATE POLICY "Allow write access to PMs and admins" ON public.epic_success_metric_history
    FOR INSERT TO authenticated
    WITH CHECK (
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
END $$;

-- Replace history logging function
CREATE OR REPLACE FUNCTION public.log_epic_success_metric_history()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_change_type text;
  v_old_value jsonb;
  v_new_value jsonb;
BEGIN
  -- Resolve current user to app_user.id via email claim
  v_email := (auth.jwt()->>'email');
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM public.app_user WHERE email = v_email LIMIT 1;
  END IF;

  -- If we can't map to an app_user row, skip logging rather than failing main DML
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
