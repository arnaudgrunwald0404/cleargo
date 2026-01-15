-- Add structured feedback type (epic/process/tool)
-- Existing rows are epic feedback by default.

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS feedback_type text;

UPDATE public.feedback
SET feedback_type = 'EPIC'
WHERE feedback_type IS NULL;

ALTER TABLE public.feedback
  ALTER COLUMN feedback_type SET NOT NULL;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_type_check
  CHECK (feedback_type IN ('EPIC', 'PROCESS', 'TOOL'));

CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback(feedback_type);

