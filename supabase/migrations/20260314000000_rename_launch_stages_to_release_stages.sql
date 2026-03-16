-- 20260314000000_rename_launch_stages_to_release_stages.sql
-- Rename launch_stages -> release_stages, add applies_to and synced_release_stage_id columns,
-- and recreate RLS policies under the new table name.

-- =============================================================================
-- 1. Rename the table
-- =============================================================================
ALTER TABLE public.launch_stages RENAME TO release_stages;

-- =============================================================================
-- 2. Add new columns
-- =============================================================================
ALTER TABLE public.release_stages
  ADD COLUMN applies_to TEXT NOT NULL DEFAULT 'BOTH'
    CHECK (applies_to IN ('RELEASE_ONLY', 'LAUNCH_ONLY', 'BOTH'));

ALTER TABLE public.release_stages
  ADD COLUMN synced_release_stage_id BIGINT
    REFERENCES public.release_stages(id) ON DELETE SET NULL;

-- =============================================================================
-- 3. Drop old RLS policies (use IF EXISTS for idempotency)
--    These policy names come from the chain of migrations:
--      20251202000000 (original), 20260129000001, 20260129000002, 20260129000003
--    After the RENAME, policies live on the renamed table (release_stages).
-- =============================================================================

-- From 20251202000000_create_launch_stages
DROP POLICY IF EXISTS "Allow read access to authenticated users"  ON public.release_stages;
DROP POLICY IF EXISTS "Allow write access to authenticated users" ON public.release_stages;

-- From 20260129000002 (split into separate per-operation policies with USING(true))
-- and 20260129000003 (recreated with app_user subquery check)
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON public.release_stages;
DROP POLICY IF EXISTS "Allow update access to authenticated users" ON public.release_stages;
DROP POLICY IF EXISTS "Allow delete access to authenticated users" ON public.release_stages;

-- From 20260129000001 (original restrict_* names, may or may not still exist)
DROP POLICY IF EXISTS "restrict_select_to_app_user" ON public.release_stages;
DROP POLICY IF EXISTS "restrict_insert_to_app_user" ON public.release_stages;
DROP POLICY IF EXISTS "restrict_update_to_app_user" ON public.release_stages;
DROP POLICY IF EXISTS "restrict_delete_to_app_user" ON public.release_stages;

-- =============================================================================
-- 4. Recreate RLS policies on release_stages
--    Pattern: SELECT open to all authenticated, writes restricted to app_user.
--    Uses (select auth.jwt()) for InitPlan optimisation (Supabase linter 0003).
-- =============================================================================

-- SELECT: any authenticated user can read stages
CREATE POLICY "Allow read access to authenticated users" ON public.release_stages
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: restricted to known app_user
CREATE POLICY "Allow insert access to authenticated users" ON public.release_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- UPDATE: restricted to known app_user
CREATE POLICY "Allow update access to authenticated users" ON public.release_stages
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

-- DELETE: restricted to known app_user
CREATE POLICY "Allow delete access to authenticated users" ON public.release_stages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- =============================================================================
-- 5. Foreign keys referencing the old table name
--    PostgreSQL automatically updates FK constraints when a referenced table is
--    renamed via ALTER TABLE ... RENAME TO, so criterion.rating_timing FK now
--    points to release_stages(id) without any manual intervention.
-- =============================================================================

-- Update the column comment to reflect the new table name
COMMENT ON COLUMN public.criterion.rating_timing
  IS 'Foreign key to release_stages table - the timing by which the criteria needs to be rated';
