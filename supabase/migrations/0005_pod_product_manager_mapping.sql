-- 0005_pod_product_manager_mapping.sql
-- Add pod -> product manager mapping to app_settings

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS pod_product_manager_mapping jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN app_settings.pod_product_manager_mapping IS 'Mapping of pod names to product manager emails. Format: {"pod_name": "email@example.com"}';








