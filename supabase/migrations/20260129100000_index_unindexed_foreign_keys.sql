-- 20260129100000_index_unindexed_foreign_keys.sql
-- Add covering indexes for foreign keys identified by Supabase database linter.
-- Improves JOIN and CASCADE delete performance.

CREATE INDEX IF NOT EXISTS idx_epic_criterion_status_last_updated_by
  ON public.epic_criterion_status(last_updated_by);

CREATE INDEX IF NOT EXISTS idx_epic_retros_submitted_by
  ON public.epic_retros(submitted_by);

CREATE INDEX IF NOT EXISTS idx_epic_success_metric_history_changed_by
  ON public.epic_success_metric_history(changed_by);

CREATE INDEX IF NOT EXISTS idx_epic_success_metrics_metric_id
  ON public.epic_success_metrics(metric_id);

CREATE INDEX IF NOT EXISTS idx_feedback_created_by_id
  ON public.feedback(created_by_id);

CREATE INDEX IF NOT EXISTS idx_manual_metric_values_entered_by
  ON public.manual_metric_values(entered_by);

CREATE INDEX IF NOT EXISTS idx_meeting_created_by
  ON public.meeting(created_by);

CREATE INDEX IF NOT EXISTS idx_meeting_snippet_extracted_by
  ON public.meeting_snippet(extracted_by);

CREATE INDEX IF NOT EXISTS idx_meeting_transcript_uploaded_by
  ON public.meeting_transcript(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_product_owner_id
  ON public.product(owner_id);

CREATE INDEX IF NOT EXISTS idx_roster_user_id
  ON public.roster(user_id);
