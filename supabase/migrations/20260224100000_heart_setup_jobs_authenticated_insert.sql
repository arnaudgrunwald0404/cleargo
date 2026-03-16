-- Allow authenticated users to insert/update heart_setup_jobs so the API route can create
-- a job (and mark it failed if trigger fails) using the user's session when
-- SUPABASE_SERVICE_ROLE_KEY is not configured. Background function uses service_role for UPDATE.

GRANT INSERT, UPDATE ON public.heart_setup_jobs TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can insert heart_setup_jobs' AND tablename = 'heart_setup_jobs') THEN
    CREATE POLICY "Authenticated can insert heart_setup_jobs"
      ON public.heart_setup_jobs FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can update own heart_setup_jobs' AND tablename = 'heart_setup_jobs') THEN
    CREATE POLICY "Authenticated can update own heart_setup_jobs"
      ON public.heart_setup_jobs FOR UPDATE TO authenticated
      USING (
        app_user_id IN (SELECT id FROM public.app_user WHERE email = (auth.jwt() ->> 'email'))
      )
      WITH CHECK (true);
  END IF;
END $$;
