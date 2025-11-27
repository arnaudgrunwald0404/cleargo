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
