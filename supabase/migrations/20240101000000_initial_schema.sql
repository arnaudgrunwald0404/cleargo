-- Complete schema for Launch Readiness Console with Aha integration
-- This migration creates all tables needed for the application

-- Users table
CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'OTHER',
  slack_handle text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Products table
CREATE TABLE IF NOT EXISTS product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pillar text NOT NULL,
  pod text NOT NULL,
  owner_id uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Launches table (with Aha integration fields)
CREATE TABLE IF NOT EXISTS launch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aha_id text UNIQUE,
  aha_url text,
  name text NOT NULL,
  product_id uuid REFERENCES product(id) ON DELETE SET NULL,
  tier text NOT NULL CHECK (tier IN ('TIER_1','TIER_2','TIER_3')),
  target_launch_date date,
  scheduled_ga_dev_date date,
  status text NOT NULL DEFAULT 'PLANNED',
  readiness_score numeric,
  readiness_status text,
  risk_level text,
  last_go_no_go_decision_date date,
  console_url text,
  owner_id uuid REFERENCES app_user(id),
  owner_email text,
  product_component text,
  pod text,
  business_priority text,
  csm_priority text,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launch_aha_id ON launch(aha_id);
CREATE INDEX IF NOT EXISTS idx_launch_product ON launch(product_id);
CREATE INDEX IF NOT EXISTS idx_launch_tier ON launch(tier);
CREATE INDEX IF NOT EXISTS idx_launch_status ON launch(status);
CREATE INDEX IF NOT EXISTS idx_launch_target_date ON launch(target_launch_date);
CREATE INDEX IF NOT EXISTS idx_launch_owner ON launch(owner_id);

-- Criteria table (already exists but ensure it has all fields)
CREATE TABLE IF NOT EXISTS criterion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  description text,
  category text NOT NULL,
  gate boolean NOT NULL DEFAULT false,
  tier_applicability text NOT NULL DEFAULT 'ALL',
  decision_owner_role text NOT NULL,
  status_definition_go text,
  status_definition_conditional text,
  status_definition_no_go text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Launch criterion status table
CREATE TABLE IF NOT EXISTS launch_criterion_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id uuid NOT NULL REFERENCES launch(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES criterion(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'NOT_SET',
  current_status_notes text,
  condition text,
  condition_type text,
  condition_due_date date,
  condition_owner_id uuid REFERENCES app_user(id),
  decision_owner_id uuid REFERENCES app_user(id),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by uuid REFERENCES app_user(id),
  score_value int
);

CREATE INDEX IF NOT EXISTS idx_lcs_launch ON launch_criterion_status(launch_id);
CREATE INDEX IF NOT EXISTS idx_lcs_criterion ON launch_criterion_status(criterion_id);
CREATE INDEX IF NOT EXISTS idx_lcs_decision_owner ON launch_criterion_status(decision_owner_id);

-- Decision snapshots table
CREATE TABLE IF NOT EXISTS decision_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id uuid NOT NULL REFERENCES launch(id) ON DELETE CASCADE,
  taken_at timestamptz NOT NULL DEFAULT now(),
  decision_type text NOT NULL,
  verdict text NOT NULL,
  notes text,
  created_by uuid REFERENCES app_user(id),
  snapshot_data jsonb NOT NULL
);

-- Notification log table
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_user(id),
  type text NOT NULL,
  payload jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivery_channel text NOT NULL,
  status text NOT NULL
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES app_user(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  json_diff jsonb NOT NULL
);

-- Settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id int PRIMARY KEY DEFAULT 1,
  threshold_tier1 numeric NOT NULL DEFAULT 0.9,
  threshold_tier2 numeric NOT NULL DEFAULT 0.8,
  threshold_tier3 numeric NOT NULL DEFAULT 0.7,
  staleness_days int NOT NULL DEFAULT 14,
  digest_schedule text NOT NULL DEFAULT 'MON_09_00',
  timezone text NOT NULL DEFAULT 'America/New_York',
  allowlisted_domains text[] NOT NULL DEFAULT '{"clearcompany.com"}',
  fallback_user_email text NOT NULL DEFAULT 'agrunwald@clearcompany.com',
  aha_webhook_secret text,
  email_sender text NOT NULL DEFAULT 'noreply@tacticalsync.com',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Roster table
CREATE TABLE IF NOT EXISTS roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES product(id) ON DELETE CASCADE,
  pod text NOT NULL,
  role text NOT NULL,
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_roster ON roster(product_id, pod, role);

-- Enable RLS on all tables
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch ENABLE ROW LEVEL SECURITY;
ALTER TABLE criterion ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_criterion_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;

-- RLS Policies (basic - allow authenticated users)
CREATE POLICY "Allow authenticated read" ON app_user FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read" ON product FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read" ON launch FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read" ON criterion FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read" ON launch_criterion_status FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read" ON decision_snapshot FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read" ON app_settings FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert/update (refine later based on roles)
CREATE POLICY "Allow authenticated write" ON criterion FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write" ON launch FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write" ON launch_criterion_status FOR ALL USING (auth.role() = 'authenticated');
