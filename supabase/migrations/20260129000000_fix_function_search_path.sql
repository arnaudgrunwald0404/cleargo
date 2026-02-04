-- Fix function search_path mutable (Supabase linter 0011)
-- Set immutable search_path on functions to prevent search_path manipulation attacks

ALTER FUNCTION public.update_epic_success_metrics_updated_at() SET search_path = public;
ALTER FUNCTION public.log_epic_success_metric_history() SET search_path = public;
ALTER FUNCTION public.my_items_for_user(text) SET search_path = public;
ALTER FUNCTION public.my_items_for_user(text, boolean) SET search_path = public;
ALTER FUNCTION public.cleanup_expired_tokens() SET search_path = public;
