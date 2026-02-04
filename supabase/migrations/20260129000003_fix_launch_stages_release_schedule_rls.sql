-- Fix RLS Policy Always True (Supabase linter 0024)
-- Restrict launch_stages and release_schedule write policies to authenticated users
-- that exist in app_user (same pattern as 20260129000001_rls_restrict_to_app_user).

-- launch_stages
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON public.launch_stages;
CREATE POLICY "Allow insert access to authenticated users" ON public.launch_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "Allow update access to authenticated users" ON public.launch_stages;
CREATE POLICY "Allow update access to authenticated users" ON public.launch_stages
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

DROP POLICY IF EXISTS "Allow delete access to authenticated users" ON public.launch_stages;
CREATE POLICY "Allow delete access to authenticated users" ON public.launch_stages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- release_schedule
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON public.release_schedule;
CREATE POLICY "Allow insert access to authenticated users" ON public.release_schedule
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "Allow update access to authenticated users" ON public.release_schedule;
CREATE POLICY "Allow update access to authenticated users" ON public.release_schedule
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

DROP POLICY IF EXISTS "Allow delete access to authenticated users" ON public.release_schedule;
CREATE POLICY "Allow delete access to authenticated users" ON public.release_schedule
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );
