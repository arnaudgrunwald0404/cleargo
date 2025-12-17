-- 20251201170000_optimize_my_items.sql
-- Purpose: speed up /api/my-items by supporting common lookups/expansions used by the page

-- Criterion: filtering by decision owner often relies on this column or placeholder
create index if not exists idx_criterion_decision_owner_email on criterion(decision_owner_email);
-- (optional case-insensitive lookups in future)
create index if not exists idx_criterion_decision_owner_email_lower on criterion(lower(decision_owner_email));

-- Epic: we frequently resolve PM by pod when building My Items
-- Note: table was renamed from 'launch' to 'epic' in migration 20240101000017
alter table epic
  add column if not exists pod text; -- no-op if exists
create index if not exists idx_epic_pod on epic(pod);

-- Already present: idx_ecs_last_updated on epic_criterion_status(last_updated_at desc)
-- Keeping migration idempotent and focused.
