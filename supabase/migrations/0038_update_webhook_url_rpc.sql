-- Simple RPC function to update aha_webhook_url bypassing PostgREST schema cache
-- This is a workaround until PostgREST refreshes its schema cache
CREATE OR REPLACE FUNCTION public.update_webhook_url(new_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE app_settings
  SET aha_webhook_url = new_url,
      updated_at = now()
  WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_webhook_url(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_webhook_url(text) TO anon;

