-- 20260316000000_delete_misassigned_launch_criteria_from_epics.sql
--
-- Bug: instantiateCriteriaForEpic was missing .eq('context', 'release') filter,
-- causing all 52 launch criteria to be assigned to every epic.
-- Result: 714 rows in epic_criterion_status where the criterion has context='launch'.
--
-- Safe to delete because:
--   - 0 comments exist on any of these rows
--   - Only 3 rows had a non-default status (all on one epic, likely accidental)
--   - Launch criteria are meant for launches, not epics
--
-- The code fix (.eq('context', 'release')) prevents recurrence.

DELETE FROM public.epic_criterion_status
WHERE criterion_id IN (
  SELECT id FROM public.criterion WHERE context = 'launch'
);
