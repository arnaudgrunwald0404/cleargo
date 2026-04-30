-- 20260419000001_create_blocker_table.sql
-- Create the blocker table for tracking launch/epic blockers with severity and status.

-- =============================================================================
-- 1. Create blocker table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blocker (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id     UUID NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  severity    TEXT NOT NULL DEFAULT 'medium'
                CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'resolved', 'dismissed')),
  owner_id    UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. Enable RLS
-- =============================================================================

ALTER TABLE public.blocker ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocker_select_authenticated" ON public.blocker;
CREATE POLICY "blocker_select_authenticated" ON public.blocker
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "blocker_insert_app_user" ON public.blocker;
CREATE POLICY "blocker_insert_app_user" ON public.blocker
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "blocker_update_app_user" ON public.blocker;
CREATE POLICY "blocker_update_app_user" ON public.blocker
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

DROP POLICY IF EXISTS "blocker_delete_app_user" ON public.blocker;
CREATE POLICY "blocker_delete_app_user" ON public.blocker
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

CREATE INDEX IF NOT EXISTS idx_blocker_epic     ON public.blocker (epic_id);
CREATE INDEX IF NOT EXISTS idx_blocker_status   ON public.blocker (status);
CREATE INDEX IF NOT EXISTS idx_blocker_severity ON public.blocker (severity);
CREATE INDEX IF NOT EXISTS idx_blocker_owner    ON public.blocker (owner_id);
