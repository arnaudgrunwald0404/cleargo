-- Repair: approved artifacts whose readiness criterion was never marked DONE.
--
-- launch_criterion_status.last_updated_by is UUID REFERENCES app_user(id)
-- (20260314000001). All three approval paths -- the web route, the Slack
-- Approve button and the MCP review-artifact tool -- wrote the approver's
-- EMAIL into it. Postgres rejected every one of those updates and all three
-- callers downgraded the failure to a warning, one of them to a console.warn.
-- So the artifact reached APPROVED / v1.0 and the criterion stayed open:
-- readiness, the gate chain and the workback timeline never saw the approval.
--
-- Fixed in code by src/lib/artifacts/criterionCompletion.ts, which resolves the
-- actor to their app_user.id before writing.
--
-- Production was checked before this was written and had NOTHING to repair --
-- no artifact had ever reached APPROVED. This runs anyway because it is a data
-- repair and other environments may have approvals, and because it costs
-- nothing where there are none.
--
-- Idempotent: only rows that are neither DONE nor NOT_APPLICABLE are touched,
-- so replaying changes nothing and a deliberate NOT_APPLICABLE is never
-- overwritten.

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
      AND a.criterion_id IS NOT NULL      -- gate_checklist spans three criteria
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
    -- the document was approved and the history should say so.
    last_updated_at = COALESCE(resolved.approved_at, lcs.last_updated_at, now()),
    -- Nullable, so an approver who no longer matches an app_user still
    -- completes the criterion, just unattributed.
    last_updated_by = COALESCE(resolved.approver_id, lcs.last_updated_by)
FROM resolved
WHERE lcs.launch_id    = resolved.launch_id
  AND lcs.criterion_id = resolved.criterion_id
  AND lcs.status NOT IN ('DONE', 'NOT_APPLICABLE');
