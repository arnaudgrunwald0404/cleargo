-- Repair: migration 20260314000000 was recorded as applied but the rename
-- never executed.  Re-run the rename + column additions + RLS policy
-- recreation idempotently.

-- 1. Rename if still called launch_stages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'launch_stages') THEN
    ALTER TABLE public.launch_stages RENAME TO release_stages;
  END IF;
END $$;

-- 2. Add columns the original migration expected to add
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'release_stages' AND column_name = 'applies_to') THEN
    ALTER TABLE public.release_stages
      ADD COLUMN applies_to TEXT NOT NULL DEFAULT 'BOTH'
        CHECK (applies_to IN ('RELEASE_ONLY', 'LAUNCH_ONLY', 'BOTH'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'release_stages' AND column_name = 'synced_release_stage_id') THEN
    ALTER TABLE public.release_stages
      ADD COLUMN synced_release_stage_id BIGINT
        REFERENCES public.release_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Drop old-named policies (idempotent)
DROP POLICY IF EXISTS "Allow read access to authenticated users"  ON public.release_stages;
DROP POLICY IF EXISTS "Allow write access to authenticated users" ON public.release_stages;
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON public.release_stages;
DROP POLICY IF EXISTS "Allow update access to authenticated users" ON public.release_stages;
DROP POLICY IF EXISTS "Allow delete access to authenticated users" ON public.release_stages;
DROP POLICY IF EXISTS "restrict_select_to_app_user" ON public.release_stages;
DROP POLICY IF EXISTS "restrict_insert_to_app_user" ON public.release_stages;
DROP POLICY IF EXISTS "restrict_update_to_app_user" ON public.release_stages;
DROP POLICY IF EXISTS "restrict_delete_to_app_user" ON public.release_stages;

-- 4. Recreate RLS policies
CREATE POLICY "Allow read access to authenticated users" ON public.release_stages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert access to authenticated users" ON public.release_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email'))
  );

CREATE POLICY "Allow update access to authenticated users" ON public.release_stages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email'))
  );

CREATE POLICY "Allow delete access to authenticated users" ON public.release_stages
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email'))
  );

COMMENT ON COLUMN public.criterion.rating_timing
  IS 'Foreign key to release_stages table - the timing by which the criteria needs to be rated';
