-- Go/No-Go for traditional releases: at end of GTM Access and Prep (stakeholders have their hands on it).
-- We don't enter Internal Readiness until we know we're going to release.
-- UI Rollout keeps its gates from stage config (e.g. GTM Access and Prep, UX Preview, etc.).

DO $$
DECLARE
  st text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'launch_stages') THEN
    st := 'launch_stages';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'release_stages') THEN
    st := 'release_stages';
  ELSE
    RAISE EXCEPTION '20260313000000_release_schedule_gate_internal_readiness: expected launch_stages or release_stages';
  END IF;

  EXECUTE format($q$
    UPDATE public.%I SET is_gate = FALSE
    WHERE scope = 'release_schedule' AND name = 'Internal Readiness'
  $q$, st);

  EXECUTE format($q$
    UPDATE public.%I SET is_gate = TRUE
    WHERE scope = 'release_schedule' AND (name = 'GTM Access' OR name = 'GTM Access and Prep')
  $q$, st);
END $$;
