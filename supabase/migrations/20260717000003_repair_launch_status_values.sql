-- Repair: remote launch.status was created from an earlier draft with
-- DEFAULT 'PLANNED' (enum-style), while the app and 20260314000001 use
-- 'Planning' / 'In Progress' / 'Launched' / 'Post-Launch'. New launches
-- therefore showed a raw "PLANNED" badge and an empty Status dropdown.
UPDATE public.launch SET status = 'Planning'    WHERE status IN ('PLANNED', 'PLANNING');
UPDATE public.launch SET status = 'In Progress' WHERE status = 'IN_PROGRESS';
UPDATE public.launch SET status = 'Launched'    WHERE status = 'LAUNCHED';
UPDATE public.launch SET status = 'Post-Launch' WHERE status IN ('POST_LAUNCH', 'POST-LAUNCH');

ALTER TABLE public.launch ALTER COLUMN status SET DEFAULT 'Planning';

ALTER TABLE public.launch DROP CONSTRAINT IF EXISTS launch_status_check;
ALTER TABLE public.launch
  ADD CONSTRAINT launch_status_check
  CHECK (status IN ('Planning', 'In Progress', 'Launched', 'Post-Launch'));
