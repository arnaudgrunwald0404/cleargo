-- Add comment_id to criterion_attachment table
-- This allows attachments to be linked to either a criterion status or a comment
-- Note: launch_criterion_status_id should reference epic_criterion_status after migration 0018

-- Add comment_id column (nullable, so existing attachments still work)
ALTER TABLE criterion_attachment 
ADD COLUMN IF NOT EXISTS comment_id uuid REFERENCES criterion_comment(id) ON DELETE CASCADE;

-- Add index for comment attachments
CREATE INDEX IF NOT EXISTS idx_criterion_attachment_comment ON criterion_attachment(comment_id);

-- Update constraint: attachment must be linked to either launch_criterion_status_id (epic_criterion_status) OR comment_id
-- Note: The column name is still launch_criterion_status_id but it references epic_criterion_status after migration 0018
ALTER TABLE criterion_attachment
DROP CONSTRAINT IF EXISTS criterion_attachment_must_have_parent;

ALTER TABLE criterion_attachment
ADD CONSTRAINT criterion_attachment_must_have_parent 
CHECK (
  (launch_criterion_status_id IS NOT NULL AND comment_id IS NULL) OR
  (launch_criterion_status_id IS NULL AND comment_id IS NOT NULL)
);

COMMENT ON COLUMN criterion_attachment.comment_id IS 'Optional link to a comment. If set, attachment belongs to comment. Otherwise belongs to criterion status.';

