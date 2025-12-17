-- 0002_aha_integration.sql
-- Add missing Aha-related fields to launch table

-- Add missing fields for Aha integration
ALTER TABLE launch
  ADD COLUMN IF NOT EXISTS product_component text,
  ADD COLUMN IF NOT EXISTS pod text,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS readiness_status text,
  ADD COLUMN IF NOT EXISTS last_go_no_go_decision_date date,
  ADD COLUMN IF NOT EXISTS console_url text,
  ADD COLUMN IF NOT EXISTS scheduled_ga_dev_date date;

-- Add index on aha_id for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_launch_aha_id ON launch(aha_id);

-- Add comment for documentation
COMMENT ON COLUMN launch.product_component IS 'Component(s) from Aha, read-only';
COMMENT ON COLUMN launch.pod IS 'Dev Backlog/Pod from Aha, read-only';
COMMENT ON COLUMN launch.owner_email IS 'Owner email from Aha assigned_to_user';
COMMENT ON COLUMN launch.readiness_status IS 'Computed readiness status (Go, Conditional Go, No Go, Not Evaluated)';
COMMENT ON COLUMN launch.last_go_no_go_decision_date IS 'Date of last Go/No-Go decision, written back to Aha';
COMMENT ON COLUMN launch.console_url IS 'URL to this launch in the console, written back to Aha';
COMMENT ON COLUMN launch.scheduled_ga_dev_date IS 'Scheduled GA Release (Dev Only) from Aha';
