-- 20260419000003_create_epic_history_table.sql
-- Create the epic_history table for audit-trail tracking of field-level changes
-- on epics (e.g. status transitions, readiness score updates, date changes).

-- =============================================================================
-- 1. Create epic_history table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.epic_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id     UUID NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  changed_by  UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  field_name  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. Enable RLS
-- =============================================================================

ALTER TABLE public.epic_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epic_history_select_authenticated" ON public.epic_history;
CREATE POLICY "epic_history_select_authenticated" ON public.epic_history
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "epic_history_insert_app_user" ON public.epic_history;
CREATE POLICY "epic_history_insert_app_user" ON public.epic_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- history rows are immutable — no UPDATE or DELETE policies

-- =============================================================================
-- 3. Indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_epic_history_epic       ON public.epic_history (epic_id);
CREATE INDEX IF NOT EXISTS idx_epic_history_changed_at ON public.epic_history (changed_at);
