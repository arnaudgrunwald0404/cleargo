-- Fix Auth RLS Initialization Plan (Supabase linter 0003)
-- Wrap auth.jwt() in (select auth.jwt()) so the planner evaluates once per query (InitPlan).
-- Policies from 20260129000001_rls_restrict_to_app_user; launch_stages and release_schedule omitted (already fixed in 20260129000002/000003).

-- app_settings
DROP POLICY IF EXISTS "Authenticated users can update app_settings" ON public.app_settings;
CREATE POLICY "Authenticated users can update app_settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- app_user
DROP POLICY IF EXISTS "Authenticated users can insert app_user" ON public.app_user;
CREATE POLICY "Authenticated users can insert app_user" ON public.app_user
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update app_user" ON public.app_user;
CREATE POLICY "Authenticated users can update app_user" ON public.app_user
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- audit_log
DROP POLICY IF EXISTS "Authenticated users can insert audit_log" ON public.audit_log;
CREATE POLICY "Authenticated users can insert audit_log" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- criterion
DROP POLICY IF EXISTS "Authenticated users can insert criterion" ON public.criterion;
CREATE POLICY "Authenticated users can insert criterion" ON public.criterion
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update criterion" ON public.criterion;
CREATE POLICY "Authenticated users can update criterion" ON public.criterion
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- decision_snapshot
DROP POLICY IF EXISTS "Authenticated users can insert decision_snapshot" ON public.decision_snapshot;
CREATE POLICY "Authenticated users can insert decision_snapshot" ON public.decision_snapshot
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- epic
DROP POLICY IF EXISTS "Authenticated users can insert epic" ON public.epic;
CREATE POLICY "Authenticated users can insert epic" ON public.epic
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update epic" ON public.epic;
CREATE POLICY "Authenticated users can update epic" ON public.epic
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can delete epic" ON public.epic;
CREATE POLICY "Authenticated users can delete epic" ON public.epic
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- epic_criterion_status
DROP POLICY IF EXISTS "Authenticated users can insert epic_criterion_status" ON public.epic_criterion_status;
CREATE POLICY "Authenticated users can insert epic_criterion_status" ON public.epic_criterion_status
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update epic_criterion_status" ON public.epic_criterion_status;
CREATE POLICY "Authenticated users can update epic_criterion_status" ON public.epic_criterion_status
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- epic_scorecards
DROP POLICY IF EXISTS "Allow write access to system" ON public.epic_scorecards;
CREATE POLICY "Allow write access to system" ON public.epic_scorecards
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Allow update access to system" ON public.epic_scorecards;
CREATE POLICY "Allow update access to system" ON public.epic_scorecards
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- epic_success_reviews
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON public.epic_success_reviews;
CREATE POLICY "Allow insert access to authenticated users" ON public.epic_success_reviews
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Allow update access to authenticated users" ON public.epic_success_reviews;
CREATE POLICY "Allow update access to authenticated users" ON public.epic_success_reviews
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- feedback
DROP POLICY IF EXISTS "Allow create access to authenticated users" ON public.feedback;
CREATE POLICY "Allow create access to authenticated users" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- google_calendar_integrations
DROP POLICY IF EXISTS "Authenticated users can insert calendar integrations" ON public.google_calendar_integrations;
CREATE POLICY "Authenticated users can insert calendar integrations" ON public.google_calendar_integrations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update calendar integrations" ON public.google_calendar_integrations;
CREATE POLICY "Authenticated users can update calendar integrations" ON public.google_calendar_integrations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- meeting
DROP POLICY IF EXISTS "Authenticated users can insert meetings" ON public.meeting;
CREATE POLICY "Authenticated users can insert meetings" ON public.meeting
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update meetings" ON public.meeting;
CREATE POLICY "Authenticated users can update meetings" ON public.meeting
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can delete meetings" ON public.meeting;
CREATE POLICY "Authenticated users can delete meetings" ON public.meeting
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- meeting_epic
DROP POLICY IF EXISTS "Authenticated users can insert meeting epics" ON public.meeting_epic;
CREATE POLICY "Authenticated users can insert meeting epics" ON public.meeting_epic
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can delete meeting epics" ON public.meeting_epic;
CREATE POLICY "Authenticated users can delete meeting epics" ON public.meeting_epic
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- meeting_snippet
DROP POLICY IF EXISTS "Authenticated users can insert snippets" ON public.meeting_snippet;
CREATE POLICY "Authenticated users can insert snippets" ON public.meeting_snippet
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update snippets" ON public.meeting_snippet;
CREATE POLICY "Authenticated users can update snippets" ON public.meeting_snippet
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can delete snippets" ON public.meeting_snippet;
CREATE POLICY "Authenticated users can delete snippets" ON public.meeting_snippet
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- meeting_transcript
DROP POLICY IF EXISTS "Authenticated users can insert transcripts" ON public.meeting_transcript;
CREATE POLICY "Authenticated users can insert transcripts" ON public.meeting_transcript
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update transcripts" ON public.meeting_transcript;
CREATE POLICY "Authenticated users can update transcripts" ON public.meeting_transcript
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- notification_log
DROP POLICY IF EXISTS "Authenticated users can insert notification_log" ON public.notification_log;
CREATE POLICY "Authenticated users can insert notification_log" ON public.notification_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- product
DROP POLICY IF EXISTS "Authenticated users can insert product" ON public.product;
CREATE POLICY "Authenticated users can insert product" ON public.product
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update product" ON public.product;
CREATE POLICY "Authenticated users can update product" ON public.product
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

-- roster
DROP POLICY IF EXISTS "Authenticated users can insert roster" ON public.roster;
CREATE POLICY "Authenticated users can insert roster" ON public.roster
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can update roster" ON public.roster;
CREATE POLICY "Authenticated users can update roster" ON public.roster
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));

DROP POLICY IF EXISTS "Authenticated users can delete roster" ON public.roster;
CREATE POLICY "Authenticated users can delete roster" ON public.roster
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')));
