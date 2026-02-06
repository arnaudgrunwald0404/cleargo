-- Add updated_at to criterion_comment for "last edited" display
ALTER TABLE criterion_comment
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN criterion_comment.updated_at IS 'Set on insert and on update (edit); used for "last activity" display.';
