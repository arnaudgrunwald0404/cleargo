-- Go/No-Go for traditional releases: at end of GTM Access and Prep (stakeholders have their hands on it).
-- We don't enter Internal Readiness until we know we're going to release.
-- UI Rollout keeps its gates from stage config (e.g. GTM Access and Prep, UX Preview, etc.).

UPDATE public.launch_stages
SET is_gate = FALSE
WHERE scope = 'release_schedule' AND name = 'Internal Readiness';

UPDATE public.launch_stages
SET is_gate = TRUE
WHERE scope = 'release_schedule' AND (name = 'GTM Access' OR name = 'GTM Access and Prep');
