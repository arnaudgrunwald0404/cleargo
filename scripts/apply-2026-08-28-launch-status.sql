-- ClearGO · Launch status becomes derived, not stored
-- Generated from supabase/migrations/20260828000000_launch_status_override.sql
-- Paste into the Supabase SQL editor: migrations are not auto-applied on deploy.
-- Safe to re-run (the UPDATE only clears overrides that already agree with the
-- dates, so a second run is a no-op).
--
-- launch.status now holds ONLY a manual override; NULL means "derive it from
-- target_launch_date" (src/lib/launch-status.ts). Two values join the
-- vocabulary — On Hold and Cancelled — neither of which a date can produce.
--
-- Until this runs, /gtm-launches keeps working but every launch stays pinned to
-- whatever status it holds today, and On Hold / Cancelled are rejected by the
-- old CHECK constraint.

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
