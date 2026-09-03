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
-- Fixed in code by src/lib/artifacts/criterionCompletion.ts.
--
-- CHECKED 2026-09-01: STEP 1 returned no rows. The bug was latent, not active
-- -- no artifact had ever reached APPROVED (8 NOT_STARTED, 1 PENDING_REVIEW,
-- 1 CHANGES_REQUESTED) and no launch_criterion_status row had ever reached DONE
-- (193 rows, all NOT_STARTED). The very first approval would have hit it.
-- Confirmed the same day that last_updated_by really is `uuid` in the live
-- schema, so the premise held; there was simply nothing yet to break.
--
-- Kept because it is still the right check before trusting approvals in any
-- environment that has them, and because the schema for this table has drifted
-- from its migration once before (20260717000001).
--
-- THE REPAIR ITSELF IS NOW A MIGRATION:
--   supabase/migrations/20260903000100_repair_artifact_approval_criteria.sql
--
-- It used to live here as a step 2, which is a bad shape for a data repair: two
-- copies of the same UPDATE invite running it twice, and the manual copy only
-- ever reaches whichever environment somebody remembers to run it against.
--
-- What is left here is the diagnostic. Run it before and after the migration --
-- before to see the damage, after to confirm it is gone (both should now be
-- empty in production, which had nothing to repair).

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
-- STEP 2 -- Verify after the migration. Should return zero rows.
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
