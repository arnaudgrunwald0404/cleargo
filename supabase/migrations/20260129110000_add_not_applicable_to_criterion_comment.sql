-- Allow NOT_APPLICABLE in criterion_comment status tracking (for Go/No-Go NA option)

ALTER TABLE criterion_comment
  DROP CONSTRAINT IF EXISTS criterion_comment_status_at_comment_check;
ALTER TABLE criterion_comment
  ADD CONSTRAINT criterion_comment_status_at_comment_check
  CHECK (status_at_comment IS NULL OR status_at_comment IN ('GO', 'CONDITIONAL', 'NO_GO', 'NOT_SET', 'NOT_APPLICABLE'));

ALTER TABLE criterion_comment
  DROP CONSTRAINT IF EXISTS criterion_comment_previous_status_check;
ALTER TABLE criterion_comment
  ADD CONSTRAINT criterion_comment_previous_status_check
  CHECK (previous_status IS NULL OR previous_status IN ('GO', 'CONDITIONAL', 'NO_GO', 'NOT_SET', 'NOT_APPLICABLE'));
