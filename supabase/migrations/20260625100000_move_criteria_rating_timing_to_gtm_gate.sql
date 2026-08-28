-- criterion.rating_timing exists as text in some environments and bigint in
-- others (development was text, production bigint). release_stages.id is bigint,
-- so the comparison below fails with "operator does not exist: text = bigint"
-- unless the column is normalised first. Idempotent: only alters when still text,
-- and every value is a numeric string, so the cast is lossless.
DO $ratingtype$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'criterion'
       AND column_name  = 'rating_timing'
       AND data_type    = 'text'
  ) THEN
    ALTER TABLE public.criterion
      ALTER COLUMN rating_timing TYPE bigint
      USING NULLIF(btrim(rating_timing), '')::bigint;
  END IF;
END $ratingtype$;

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
