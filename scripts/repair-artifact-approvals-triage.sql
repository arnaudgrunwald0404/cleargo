-- Why did STEP 1 of repair-artifact-approvals.sql return no rows?
--
-- Zero rows is the right answer for three very different reasons, and they
-- imply different things. Run all three; they are read-only.

-- ---------------------------------------------------------------------------
-- A. Has anyone ever approved an artifact in this database?
--
-- If APPROVED is 0, the diagnostic could not have returned anything and the bug
-- simply never fired here. It was still real -- it would have fired the first
-- time someone approved -- but there is nothing to repair.
-- ---------------------------------------------------------------------------
SELECT status, count(*) AS artifacts
FROM public.launch_artifact
GROUP BY status
ORDER BY artifacts DESC;


-- ---------------------------------------------------------------------------
-- B. Is the column actually a uuid in THIS database?
--
-- The premise of the whole fix is that last_updated_by is
-- UUID REFERENCES app_user(id) per 20260314000001. If this returns `text`, the
-- remote schema drifted from the migration and those writes were succeeding all
-- along -- in which case the repair is unnecessary and my reasoning was wrong.
-- Worth knowing either way: 20260717000001 exists because this exact table was
-- once created from an earlier draft of its own migration.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'launch_criterion_status'
  AND column_name IN ('last_updated_by', 'owner_id', 'status')
ORDER BY column_name;


-- ---------------------------------------------------------------------------
-- C. Has any launch criterion ever reached DONE, and by what route?
--
-- last_updated_by NOT NULL on a DONE row means something completed it
-- successfully. All-NULL on DONE rows would suggest they were completed by a
-- path that never set an actor.
-- ---------------------------------------------------------------------------
SELECT
    status,
    count(*)                                          AS rows,
    count(last_updated_by)                            AS with_actor,
    count(*) FILTER (WHERE last_updated_by IS NULL)   AS without_actor
FROM public.launch_criterion_status
GROUP BY status
ORDER BY rows DESC;
