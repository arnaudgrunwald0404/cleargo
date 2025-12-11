-- Add notification logging table
-- This table tracks all notifications sent via Slack, email, etc.

-- Handle migration from launch_id to epic_id if table already exists
DO $$
BEGIN
    -- If launch_id column exists, rename it to epic_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_log' 
        AND column_name = 'launch_id'
    ) THEN
        -- Drop old index if it exists
        DROP INDEX IF EXISTS idx_notification_log_launch;
        -- Drop old foreign key constraint if it exists
        ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_launch_id_fkey;
        -- Rename column
        ALTER TABLE notification_log RENAME COLUMN launch_id TO epic_id;
    END IF;
    
    -- If epic_id column doesn't exist at all, add it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_log' 
        AND column_name = 'epic_id'
    ) THEN
        ALTER TABLE notification_log ADD COLUMN epic_id uuid;
    END IF;
END $$;

-- Create table if it doesn't exist (without foreign key constraints)
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  epic_id uuid,
  type text,
  delivery_channel text,
  payload jsonb,
  status text DEFAULT 'pending',
  error text,
  slack_ts text,
  slack_channel text,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add constraints if they don't exist
DO $$
BEGIN
    -- Add delivery_channel constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'notification_log_delivery_channel_check'
    ) THEN
        ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_delivery_channel_check;
        ALTER TABLE notification_log ADD CONSTRAINT notification_log_delivery_channel_check 
            CHECK (delivery_channel IN ('slack', 'email', 'sms'));
    END IF;
    
    -- Add status constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'notification_log_status_check'
    ) THEN
        ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_status_check;
        ALTER TABLE notification_log ADD CONSTRAINT notification_log_status_check 
            CHECK (status IN ('sent', 'failed', 'pending'));
    END IF;
    
    -- Make type NOT NULL if it's nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_log' 
        AND column_name = 'type' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE notification_log ALTER COLUMN type SET NOT NULL;
    END IF;
    
    -- Make delivery_channel NOT NULL if it's nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_log' 
        AND column_name = 'delivery_channel' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE notification_log ALTER COLUMN delivery_channel SET NOT NULL;
    END IF;
END $$;

-- Add foreign key constraint if epic table exists and constraint doesn't exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'notification_log_epic_id_fkey'
        ) THEN
            ALTER TABLE notification_log ADD CONSTRAINT notification_log_epic_id_fkey 
                FOREIGN KEY (epic_id) REFERENCES epic(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add slack_ts if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_log' AND column_name = 'slack_ts'
    ) THEN
        ALTER TABLE notification_log ADD COLUMN slack_ts text;
    END IF;
    
    -- Add slack_channel if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_log' AND column_name = 'slack_channel'
    ) THEN
        ALTER TABLE notification_log ADD COLUMN slack_channel text;
    END IF;
END $$;

-- Indexes for common queries (only create if column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_log' 
        AND column_name = 'epic_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_notification_log_launch ON notification_log(epic_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_log_type ON notification_log(type);

-- Comments for documentation
COMMENT ON TABLE notification_log IS 'Tracks all notifications sent to users via various channels';
COMMENT ON COLUMN notification_log.type IS 'Type of notification: stale_criterion, launch_risk_alert, go_no_go_decision, leadership_digest, launch_status_change';
COMMENT ON COLUMN notification_log.delivery_channel IS 'Channel used to deliver notification: slack, email, sms';
COMMENT ON COLUMN notification_log.slack_ts IS 'Slack message timestamp for threading and message updates';
COMMENT ON COLUMN notification_log.payload IS 'JSON payload containing notification-specific data';
