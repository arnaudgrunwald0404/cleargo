-- Align criterion due dates with Go/No-Go: move rating_timing from Internal Readiness
-- to GTM Access and Prep (gate stage). Internal Readiness remains a timeline phase
-- for operational tracking (Internal Orgs column), not criterion readiness deadlines.

UPDATE public.criterion c
SET rating_timing = gtm.id,
    updated_at = now()
FROM public.release_stages ir
JOIN public.release_stages gtm
  ON gtm.scope = ir.scope
 AND lower(trim(gtm.name)) IN ('gtm access and prep', 'gtm access')
WHERE c.rating_timing = ir.id
  AND ir.scope IN ('release_schedule', 'ui_rollout')
  AND lower(trim(ir.name)) = 'internal readiness';

COMMENT ON COLUMN public.criterion.rating_timing IS
  'Foreign key to release_stages — stage segment used for due date (end of segment, with gate-stage cascading offsets: sub-criteria −4d, gate rollups −1d before segment end).';
