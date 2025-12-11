-- Add notification logging table
-- This table tracks all notifications sent via Slack, email, etc.

CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  launch_id uuid REFERENCES launch(id) ON DELETE CASCADE,
  type text NOT NULL,
  delivery_channel text NOT NULL CHECK (delivery_channel IN ('slack', 'email', 'sms')),
  payload jsonb,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'pending')) DEFAULT 'pending',
  error text,
  slack_ts text, -- Slack message timestamp for threading/updates
  slack_channel text,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_launch ON notification_log(launch_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_log_type ON notification_log(type);

-- Comments for documentation
COMMENT ON TABLE notification_log IS 'Tracks all notifications sent to users via various channels';
COMMENT ON COLUMN notification_log.type IS 'Type of notification: stale_criterion, launch_risk_alert, go_no_go_decision, leadership_digest, launch_status_change';
COMMENT ON COLUMN notification_log.delivery_channel IS 'Channel used to deliver notification: slack, email, sms';
COMMENT ON COLUMN notification_log.slack_ts IS 'Slack message timestamp for threading and message updates';
COMMENT ON COLUMN notification_log.payload IS 'JSON payload containing notification-specific data';
