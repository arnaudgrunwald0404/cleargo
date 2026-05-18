-- 20260520100000_user_notification_preferences.sql
-- Per-user, per-event notification channel preferences.
-- Values: "email" | "slack" | "both" | "none"
-- An empty object means fall back to the system default for each event type.

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN app_user.notification_preferences IS
  'Per-event notification channel preferences. Keys are event types '
  '(e.g. gate_signoff_ready, criteria_nudge, criteria_assignment, weekly_digest). '
  'Values are "email" | "slack" | "both" | "none". '
  'A missing key means use the system default for that event type.';
