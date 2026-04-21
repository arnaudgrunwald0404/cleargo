-- 20260419000002_create_epic_milestone_table.sql
-- Create the epic_milestone table for tracking key dates and completion status
-- against each epic.

-- =============================================================================
-- 1. Create epic_milestone table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.epic_milestone (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id      UUID NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'in_progress', 'completed', 'missed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. Enable RLS
-- =============================================================================

ALTER TABLE public.epic_milestone ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epic_milestone_select_authenticated" ON public.epic_milestone;
CREATE POLICY "epic_milestone_select_authenticated" ON public.epic_milestone
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "epic_milestone_insert_app_user" ON public.epic_milestone;
CREATE POLICY "epic_milestone_insert_app_user" ON public.epic_milestone
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "epic_milestone_update_app_user" ON public.epic_milestone;
CREATE POLICY "epic_milestone_update_app_user" ON public.epic_milestone
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "epic_milestone_delete_app_user" ON public.epic_milestone;
CREATE POLICY "epic_milestone_delete_app_user" ON public.epic_milestone
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- =============================================================================
-- 3. Indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_epic_milestone_epic ON public.epic_milestone (epic_id);
CREATE INDEX IF NOT EXISTS idx_epic_milestone_due  ON public.epic_milestone (due_date);
