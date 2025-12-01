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
