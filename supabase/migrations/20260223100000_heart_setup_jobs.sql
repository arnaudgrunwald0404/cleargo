-- HEART setup background jobs: store status and result for async AI setup (Netlify background function).
-- Client polls setup-status until status is completed or failed.

CREATE TABLE IF NOT EXISTS public.heart_setup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  app_user_id uuid NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
  setup_method text NOT NULL CHECK (setup_method IN ('auto', 'ai_assisted')),
  user_context text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heart_setup_jobs_epic_id_id
  ON public.heart_setup_jobs(epic_id, id);

COMMENT ON TABLE public.heart_setup_jobs IS 'Jobs for HEART AI setup (Netlify background function). Poll via GET .../heart/setup-status?job_id=';
COMMENT ON COLUMN public.heart_setup_jobs.result IS 'On completed: { config, metrics, recommendations }. On failed: { error, recommendations?, availableEventNames? }';

-- RLS: service_role can do everything; authenticated can read jobs (API restricts by epic and job_id).
ALTER TABLE public.heart_setup_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated can read heart_setup_jobs' AND tablename = 'heart_setup_jobs') THEN
    CREATE POLICY "Authenticated can read heart_setup_jobs"
      ON public.heart_setup_jobs FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access heart_setup_jobs' AND tablename = 'heart_setup_jobs') THEN
    CREATE POLICY "Service role full access heart_setup_jobs"
      ON public.heart_setup_jobs FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT ON public.heart_setup_jobs TO authenticated;
GRANT ALL ON public.heart_setup_jobs TO service_role;
