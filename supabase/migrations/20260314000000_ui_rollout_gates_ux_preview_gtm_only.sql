-- UI Rollout: show only two Go/No-Go points on the Release Timeline — end of UX Preview and end of GTM Access and Prep.
-- Criteria within phases keep their own due dates in the tables; the timeline just shows these two decision points.

UPDATE public.launch_stages
SET is_gate = FALSE
WHERE scope = 'ui_rollout';

UPDATE public.launch_stages
SET is_gate = TRUE
WHERE scope = 'ui_rollout' AND name IN ('UX Preview', 'GTM Access and Prep');
