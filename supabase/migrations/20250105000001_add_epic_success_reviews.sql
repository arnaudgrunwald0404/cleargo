-- Add epic_success_reviews table for tracking PM review activity
-- Part of Sprint 8: PM Monitoring Assignment + Reminders + Escalation

CREATE TABLE IF NOT EXISTS public.epic_success_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(epic_id, reviewer_user_id, reviewed_at)
);

CREATE INDEX IF NOT EXISTS idx_epic_success_reviews_epic 
  ON public.epic_success_reviews(epic_id);

CREATE INDEX IF NOT EXISTS idx_epic_success_reviews_reviewer 
  ON public.epic_success_reviews(reviewer_user_id);

CREATE INDEX IF NOT EXISTS idx_epic_success_reviews_reviewed_at 
  ON public.epic_success_reviews(reviewed_at DESC);

-- Row-Level Security
ALTER TABLE public.epic_success_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.epic_success_reviews
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow insert access to authenticated users" ON public.epic_success_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update access to authenticated users" ON public.epic_success_reviews
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.epic_success_reviews IS 'Tracks when PMs review epic success scorecards';

