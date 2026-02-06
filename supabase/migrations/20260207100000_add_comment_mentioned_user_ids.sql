-- Add mentioned_user_ids to criterion_comment for @mention support and Slack multi-recipient
ALTER TABLE criterion_comment
ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[];

COMMENT ON COLUMN criterion_comment.mentioned_user_ids IS 'User IDs (@mentioned) in the comment; used for Slack notifications in same thread as owner.';
