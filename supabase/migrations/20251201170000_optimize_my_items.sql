-- 20251201170000_optimize_my_items.sql
-- Purpose: speed up /api/my-items by supporting common lookups/expansions used by the page

-- Criterion: filtering by decision owner often relies on this column or placeholder
create index if not exists idx_criterion_decision_owner_email on criterion(decision_owner_email);
-- (optional case-insensitive lookups in future)
create index if not exists idx_criterion_decision_owner_email_lower on criterion(lower(decision_owner_email));

-- Launch: we frequently resolve PM by pod when building My Items
alter table launch
  add column if not exists pod text; -- no-op if exists
create index if not exists idx_launch_pod on launch(pod);

-- Already present: idx_lcs_last_updated on launch_criterion_status(last_updated_at desc)
-- Keeping migration idempotent and focused.
