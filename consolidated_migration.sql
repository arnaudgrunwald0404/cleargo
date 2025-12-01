-- 0001_initial.sql
-- Core schema for Launch Readiness Console (v1)

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique not null,
  role text not null default 'OTHER',
  slack_handle text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pillar text not null,
  pod text not null,
  owner_id uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists launch (
  id uuid primary key default gen_random_uuid(),
  aha_id text unique,
  aha_url text,
  name text not null,
  product_id uuid references product(id) on delete set null,
  tier text not null check (tier in ('TIER_1','TIER_2','TIER_3')),
  target_launch_date date,
  status text not null default 'PLANNED',
  readiness_score numeric,
  risk_level text,
  owner_id uuid references app_user(id),
  business_priority text,
  csm_priority text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_launch_product on launch(product_id);
create index if not exists idx_launch_tier on launch(tier);
create index if not exists idx_launch_status on launch(status);
create index if not exists idx_launch_target_date on launch(target_launch_date);
create index if not exists idx_launch_owner on launch(owner_id);

create table if not exists criterion (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  description text,
  category text not null,
  gate boolean not null default false,
  tier_applicability text not null default 'ALL',
  decision_owner_role text not null,
  status_definition_go text,
  status_definition_conditional text,
  status_definition_no_go text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists launch_criterion_status (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references launch(id) on delete cascade,
  criterion_id uuid not null references criterion(id) on delete cascade,
  status text not null default 'NOT_SET',
  current_status_notes text,
  condition text,
  condition_type text,
  condition_due_date date,
  condition_owner_id uuid references app_user(id),
  decision_owner_id uuid references app_user(id),
  last_updated_at timestamptz not null default now(),
  last_updated_by uuid references app_user(id),
  score_value int
);

create index if not exists idx_lcs_launch on launch_criterion_status(launch_id);
create index if not exists idx_lcs_criterion on launch_criterion_status(criterion_id);
create index if not exists idx_lcs_decision_owner on launch_criterion_status(decision_owner_id);

create table if not exists decision_snapshot (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references launch(id) on delete cascade,
  taken_at timestamptz not null default now(),
  decision_type text not null,
  verdict text not null,
  notes text,
  created_by uuid references app_user(id),
  snapshot_data jsonb not null
);

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id),
  type text not null,
  payload jsonb,
  sent_at timestamptz not null default now(),
  delivery_channel text not null,
  status text not null
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_user(id),
  entity_type text not null,
  entity_id uuid not null,
  taken_at timestamptz not null default now(),
  json_diff jsonb not null
);

-- Admin-configurable settings (single row advisable)
create table if not exists app_settings (
  id int primary key default 1,
  threshold_tier1 numeric not null default 0.9,
  threshold_tier2 numeric not null default 0.8,
  threshold_tier3 numeric not null default 0.7,
  staleness_days int not null default 14,
  digest_schedule text not null default 'MON_09_00',
  timezone text not null default 'America/New_York',
  allowlisted_domains text[] not null default '{"clearcompany.com"}',
  fallback_user_email text not null default 'agrunwald@clearcompany.com',
  aha_webhook_secret text,
  email_sender text not null default 'noreply@tacticalsync.com',
  updated_at timestamptz not null default now()
);

-- Roster: resolve decision_owner per product/pod/role
create table if not exists roster (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references product(id) on delete cascade,
  pod text not null,
  role text not null,
  user_id uuid references app_user(id) on delete set null
);

create unique index if not exists uq_roster on roster(product_id, pod, role);
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
-- 0002_performance_indexes.sql
-- Additional indexes for performance optimization

-- Audit log indexes
create index if not exists idx_audit_log_actor on audit_log(actor_id);
create index if not exists idx_audit_log_entity on audit_log(entity_type, entity_id);
create index if not exists idx_audit_log_taken_at on audit_log(taken_at desc);

-- Decision snapshot indexes
create index if not exists idx_decision_snapshot_launch on decision_snapshot(launch_id);
create index if not exists idx_decision_snapshot_taken_at on decision_snapshot(taken_at desc);
create index if not exists idx_decision_snapshot_created_by on decision_snapshot(created_by);

-- Launch criterion status additional indexes
create index if not exists idx_lcs_last_updated on launch_criterion_status(last_updated_at desc);
create index if not exists idx_lcs_condition_owner on launch_criterion_status(condition_owner_id);
create index if not exists idx_lcs_status on launch_criterion_status(status);

-- Notification log indexes
create index if not exists idx_notification_log_user on notification_log(user_id);
create index if not exists idx_notification_log_sent_at on notification_log(sent_at desc);
create index if not exists idx_notification_log_type on notification_log(type);

-- Composite indexes for common queries
create index if not exists idx_launch_tier_status on launch(tier, status);
create index if not exists idx_launch_target_date_tier on launch(target_launch_date, tier);
create index if not exists idx_lcs_launch_status on launch_criterion_status(launch_id, status);
-- 0003_rls_policies.sql
-- Enable RLS and add basic policies for authenticated users

-- Enable RLS on all tables
alter table app_user enable row level security;
alter table product enable row level security;
alter table launch enable row level security;
alter table criterion enable row level security;
alter table launch_criterion_status enable row level security;
alter table decision_snapshot enable row level security;
alter table notification_log enable row level security;
alter table audit_log enable row level security;
alter table app_settings enable row level security;
alter table roster enable row level security;

-- Policy: Allow authenticated users to read everything (Portfolio view, etc.)
create policy "Authenticated users can select app_user" on app_user for select to authenticated using (true);
create policy "Authenticated users can select product" on product for select to authenticated using (true);
create policy "Authenticated users can select launch" on launch for select to authenticated using (true);
create policy "Authenticated users can select criterion" on criterion for select to authenticated using (true);
create policy "Authenticated users can select launch_criterion_status" on launch_criterion_status for select to authenticated using (true);
create policy "Authenticated users can select decision_snapshot" on decision_snapshot for select to authenticated using (true);
create policy "Authenticated users can select notification_log" on notification_log for select to authenticated using (true);
create policy "Authenticated users can select audit_log" on audit_log for select to authenticated using (true);
create policy "Authenticated users can select app_settings" on app_settings for select to authenticated using (true);
create policy "Authenticated users can select roster" on roster for select to authenticated using (true);

-- Policy: Allow authenticated users to insert/update/delete (Basic "Auth Users" trust for Sprint 1)
-- Note: Strict RBAC (e.g., only Product Ops can edit Settings) will be enforced in application layer or future DB policies.
create policy "Authenticated users can insert app_user" on app_user for insert to authenticated with check (true);
create policy "Authenticated users can update app_user" on app_user for update to authenticated using (true);

create policy "Authenticated users can insert product" on product for insert to authenticated with check (true);
create policy "Authenticated users can update product" on product for update to authenticated using (true);

create policy "Authenticated users can insert launch" on launch for insert to authenticated with check (true);
create policy "Authenticated users can update launch" on launch for update to authenticated using (true);
create policy "Authenticated users can delete launch" on launch for delete to authenticated using (true);

create policy "Authenticated users can insert criterion" on criterion for insert to authenticated with check (true);
create policy "Authenticated users can update criterion" on criterion for update to authenticated using (true);

create policy "Authenticated users can insert launch_criterion_status" on launch_criterion_status for insert to authenticated with check (true);
create policy "Authenticated users can update launch_criterion_status" on launch_criterion_status for update to authenticated using (true);

create policy "Authenticated users can insert decision_snapshot" on decision_snapshot for insert to authenticated with check (true);

create policy "Authenticated users can insert notification_log" on notification_log for insert to authenticated with check (true);

create policy "Authenticated users can insert audit_log" on audit_log for insert to authenticated with check (true);

create policy "Authenticated users can update app_settings" on app_settings for update to authenticated using (true);

create policy "Authenticated users can insert roster" on roster for insert to authenticated with check (true);
create policy "Authenticated users can update roster" on roster for update to authenticated using (true);
create policy "Authenticated users can delete roster" on roster for delete to authenticated using (true);
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
