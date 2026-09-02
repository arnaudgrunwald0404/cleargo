-- Repair: approved artifacts whose readiness criterion was never marked DONE.
--
-- All three approval paths -- the web route, the Slack Approve button, and the
-- MCP review-artifact tool -- wrote the approver's EMAIL into
-- launch_criterion_status.last_updated_by, which is
-- UUID REFERENCES app_user(id). Postgres rejected every one of those updates,
-- and all three callers downgraded the failure to a warning string. So the
-- artifact went to APPROVED / v1.0 and the criterion stayed open: readiness,
-- the gate chain, and the workback timeline never saw the approval.
--
-- Fixed in code by src/lib/artifacts/criterionCompletion.ts. This repairs the
-- rows that were left behind. Affects every approval since the launch tables
-- were created (20260314000001), on every surface.
--
-- Run step 1, read it, then run step 2. Step 2 is transactional.

-- ---------------------------------------------------------------------------
-- STEP 1 -- What is affected. Read-only, safe to run any time.
-- ---------------------------------------------------------------------------
SELECT
    l.name                                   AS launch,
    a.artifact_type,
    a.version,
    a.approved_by,
    a.approved_at,
    c.label                                  AS criterion,
    COALESCE(lcs.status, '(no criterion row)') AS criterion_status,
    -- A gate approval also writes a signoff row, and THAT write succeeded --
    -- signer_email is TEXT. A signoff with an open criterion is the fingerprint
    -- of this bug rather than of someone simply not having finished.
    EXISTS (
        SELECT 1 FROM public.launch_criterion_signoff s
        WHERE s.launch_id = a.launch_id AND s.criterion_id = a.criterion_id
    )                                        AS has_signoff
FROM public.launch_artifact a
JOIN public.launch l      ON l.id = a.launch_id
JOIN public.criterion c   ON c.id = a.criterion_id
LEFT JOIN public.launch_criterion_status lcs
       ON lcs.launch_id    = a.launch_id
      AND lcs.criterion_id = a.criterion_id
WHERE a.status = 'APPROVED'
  AND a.criterion_id IS NOT NULL          -- gate_checklist spans three criteria
  AND (lcs.id IS NULL OR lcs.status NOT IN ('DONE', 'NOT_APPLICABLE'))
ORDER BY a.approved_at DESC NULLS LAST;


-- ---------------------------------------------------------------------------
-- STEP 2 -- Repair. Run as one transaction; check the count before COMMIT.
-- ---------------------------------------------------------------------------
BEGIN;

WITH approved AS (
    -- DISTINCT ON because launch_artifact is unique on (launch_id,
    -- artifact_type), not on criterion_id -- two artifact types could point at
    -- the same criterion. Latest approval wins.
    SELECT DISTINCT ON (a.launch_id, a.criterion_id)
        a.launch_id,
        a.criterion_id,
        a.approved_at,
        a.approved_by
    FROM public.launch_artifact a
    WHERE a.status = 'APPROVED'
      AND a.criterion_id IS NOT NULL
    ORDER BY a.launch_id, a.criterion_id, a.approved_at DESC NULLS LAST
),
resolved AS (
    SELECT
        approved.*,
        (SELECT u.id
           FROM public.app_user u
          WHERE lower(u.email) = lower(approved.approved_by)
          LIMIT 1) AS approver_id
    FROM approved
)
UPDATE public.launch_criterion_status lcs
SET
    status          = 'DONE',
    -- The approval's own timestamp, not now(): the criterion was decided when
    -- the document was approved, and the history should say so.
    last_updated_at = COALESCE(resolved.approved_at, lcs.last_updated_at, now()),
    -- Nullable, so an approver who no longer matches an app_user still
    -- completes the criterion, just unattributed.
    last_updated_by = COALESCE(resolved.approver_id, lcs.last_updated_by)
FROM resolved
WHERE lcs.launch_id    = resolved.launch_id
  AND lcs.criterion_id = resolved.criterion_id
  -- Never overwrite a deliberate decision. NOT_APPLICABLE is somebody's call;
  -- DONE is already correct.
  AND lcs.status NOT IN ('DONE', 'NOT_APPLICABLE');

-- Expect this to match the row count from STEP 1 (minus any "(no criterion
-- row)" lines, which have nothing to update). If it is wildly larger, ROLLBACK.
COMMIT;


-- ---------------------------------------------------------------------------
-- STEP 3 -- Verify. Should return zero rows.
-- ---------------------------------------------------------------------------
SELECT l.name AS launch, a.artifact_type, lcs.status
FROM public.launch_artifact a
JOIN public.launch l ON l.id = a.launch_id
JOIN public.launch_criterion_status lcs
       ON lcs.launch_id    = a.launch_id
      AND lcs.criterion_id = a.criterion_id
WHERE a.status = 'APPROVED'
  AND a.criterion_id IS NOT NULL
  AND lcs.status NOT IN ('DONE', 'NOT_APPLICABLE');
