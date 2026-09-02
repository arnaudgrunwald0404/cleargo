-- Launch status becomes derived, not stored.
--
-- launch.status was a free-standing dropdown that nobody kept current: a launch
-- that shipped in June still read "Planning" in August. It now follows the same
-- shape as epic release status (src/lib/epic-release-status.ts) — computed from
-- the target launch date, with the column holding ONLY a manual override.
--
--   NULL          -> derive from target_launch_date (see src/lib/launch-status.ts)
--   any value     -> pinned; the calendar is ignored until it is cleared
--
-- Two new values join the vocabulary. Neither can ever be produced by a date,
-- so they exist as overrides only:
--   On Hold    -- the launch is paused
--   Cancelled  -- the launch is abandoned (archived stays a separate flag, so a
--                 cancelled launch can still be listed until someone archives it)

-- 1. NULL has to be sayable, and the default must stop pinning new launches.
ALTER TABLE public.launch ALTER COLUMN status DROP NOT NULL;
ALTER TABLE public.launch ALTER COLUMN status DROP DEFAULT;

-- 2. Widen the vocabulary.
ALTER TABLE public.launch DROP CONSTRAINT IF EXISTS launch_status_check;
ALTER TABLE public.launch
  ADD CONSTRAINT launch_status_check
  CHECK (status IS NULL OR status IN (
    'Planning', 'In Progress', 'Launched', 'Post-Launch', 'On Hold', 'Cancelled'
  ));

-- 3. Retire redundant overrides.
--
-- Every existing row carries a value, so without this step nothing would ever
-- compute. Only rows whose stored value AGREES with what the dates now say are
-- cleared: those were never decisions, just the default nobody changed. A row
-- that genuinely diverges (marked Launched a week early, say) is left pinned,
-- because that divergence is the only place a real decision could be hiding.
--
-- The CASE below mirrors computeLaunchStatus; the lead days come from
-- LAUNCH_WORKBACK_LEAD_DAYS (the largest T-minus offset each tier's criteria
-- carry). Keep the two in step if either changes.
UPDATE public.launch
SET status = NULL
WHERE status IS NOT NULL
  AND status = CASE
    WHEN target_launch_date IS NULL THEN 'Planning'
    WHEN CURRENT_DATE > target_launch_date THEN 'Post-Launch'
    WHEN CURRENT_DATE = target_launch_date THEN 'Launched'
    WHEN CURRENT_DATE >= target_launch_date
         - (CASE WHEN tier = 'TIER_1' THEN 105 ELSE 77 END) THEN 'In Progress'
    ELSE 'Planning'
  END;

COMMENT ON COLUMN public.launch.status IS
  'Manual status override. NULL means derive from target_launch_date (src/lib/launch-status.ts).';
