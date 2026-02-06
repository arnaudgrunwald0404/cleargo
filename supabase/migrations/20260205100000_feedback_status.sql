-- Add acknowledgment status to feedback for superadmin workflow

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unread';

ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_status_check;
ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_status_check
  CHECK (status IN (
    'unread',
    'received',
    'need_more_info',
    'considering',
    'in_progress',
    'completed',
    'no_go'
  ));

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS status_updated_by_id uuid REFERENCES app_user(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback(status);

COMMENT ON COLUMN public.feedback.status IS 'Acknowledgment status: unread, received, need_more_info, considering, in_progress, completed, no_go';
COMMENT ON COLUMN public.feedback.status_updated_at IS 'When status was last changed';
COMMENT ON COLUMN public.feedback.status_updated_by_id IS 'User (e.g. superadmin) who last updated the status';
