-- UI Rollout: show only two Go/No-Go points on the Release Timeline — end of UX Preview and end of GTM Access and Prep.
-- Criteria within phases keep their own due dates in the tables; the timeline just shows these two decision points.
-- Handles both table names (pre- and post-rename).

DO $$
DECLARE
  tbl TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='release_stages') THEN
    tbl := 'public.release_stages';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='launch_stages') THEN
    tbl := 'public.launch_stages';
  ELSE
    RAISE NOTICE 'Neither release_stages nor launch_stages found — skipping.';
    RETURN;
  END IF;

  EXECUTE format('UPDATE %s SET is_gate = FALSE WHERE scope = ''ui_rollout''', tbl);
  EXECUTE format('UPDATE %s SET is_gate = TRUE WHERE scope = ''ui_rollout'' AND name IN (''UX Preview'', ''GTM Access and Prep'')', tbl);
END $$;
