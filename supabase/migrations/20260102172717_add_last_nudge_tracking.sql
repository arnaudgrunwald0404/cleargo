-- Add last_nudge_sent_at field to epic_criterion_status table
-- Used to prevent duplicate daily nudges on the same day

ALTER TABLE epic_criterion_status ADD COLUMN IF NOT EXISTS last_nudge_sent_at date;

COMMENT ON COLUMN epic_criterion_status.last_nudge_sent_at IS 'Date when the last nudge notification was sent for this criterion. Used to prevent duplicate daily nudges.';

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_ecs_last_nudge_sent_at ON epic_criterion_status(last_nudge_sent_at);

