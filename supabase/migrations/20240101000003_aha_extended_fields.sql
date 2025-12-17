-- 0004_aha_extended_fields.sql
-- Add missing fields from aha-launch-console-mapping.yaml

ALTER TABLE launch
  ADD COLUMN IF NOT EXISTS modified_rice_score jsonb,
  ADD COLUMN IF NOT EXISTS wsjf_score jsonb,
  ADD COLUMN IF NOT EXISTS product_value jsonb,
  ADD COLUMN IF NOT EXISTS gtm_link text,
  ADD COLUMN IF NOT EXISTS activation_process text,
  ADD COLUMN IF NOT EXISTS new_org_setup text,
  ADD COLUMN IF NOT EXISTS existing_org_setup text,
  ADD COLUMN IF NOT EXISTS pricing_model text;

COMMENT ON COLUMN launch.modified_rice_score IS 'Modified RICE score from Aha (JSON)';
COMMENT ON COLUMN launch.wsjf_score IS 'WSJF score from Aha (JSON)';
COMMENT ON COLUMN launch.product_value IS 'Product value score from Aha (JSON)';
COMMENT ON COLUMN launch.gtm_link IS 'Product Marketing/GTM Link';
COMMENT ON COLUMN launch.activation_process IS 'Activation Process description';
COMMENT ON COLUMN launch.new_org_setup IS 'New Org Setup description';
COMMENT ON COLUMN launch.existing_org_setup IS 'Existing Org Setup description';
COMMENT ON COLUMN launch.pricing_model IS 'Pricing Model description';
