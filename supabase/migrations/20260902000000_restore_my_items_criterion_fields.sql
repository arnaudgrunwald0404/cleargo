-- Restore criterion.rating_timing and criterion.data_sources to my_items_for_user.
--
-- 20260630000000_hide_conditional_non_gate_from_home.sql was authored from a
-- copy of this function that predated 20260216000005 (rating_timing) and
-- 20260415200000 (data_sources), so replacing the function silently dropped
-- both keys from the returned `criterion` object. Nothing failed loudly:
--
--   * src/app/api/my-items/route.ts reads item.criterion?.rating_timing to pick
--     the stage a due date is derived from. Undefined since, so EVERY derived
--     due date on My Items collapsed to the sort_order = 1 default stage.
--   * src/components/HomeDashboard.tsx does the same read, and also renders a
--     Docs column from data_sources that has been empty since.
--
-- This is that file verbatim -- including its CONDITIONAL-and-gate predicate,
-- which is the change it was written to make and which must be preserved -- with
-- only the two keys added back. Do not rebuild this function from an older
-- migration to "restore" it; that is the same mistake in reverse.
--
-- This failure mode has now happened twice. See also
-- 20260717000001_repair_launch_criterion_status_columns.sql. When editing an
-- existing SQL function, start from the newest definition:
--   grep -l 'FUNCTION my_items_for_user' supabase/migrations/*.sql | sort | tail -1

CREATE OR REPLACE FUNCTION my_items_for_user(p_email text, p_show_all boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  status text,
  condition text,
  condition_due_date date,
  last_updated_at timestamptz,
  launch jsonb,
  criterion jsonb
)
LANGUAGE sql
AS $$
  WITH settings AS (
    SELECT pod_product_manager_mapping FROM app_settings WHERE id = 1
  ),
  base AS (
    SELECT
      lcs.id,
      lcs.status,
      lcs.condition,
      lcs.condition_due_date,
      lcs.last_updated_at,
      CASE
        WHEN lcs.decision_owner_id IS NOT NULL THEN (
          SELECT lower(au.email)
          FROM app_user au
          WHERE au.id = lcs.decision_owner_id
        )
        WHEN c.decision_owner_email IS NULL OR c.decision_owner_email = '' THEN NULL
        WHEN c.decision_owner_email <> '[name of pod''s product manager]'
             AND position('pod' IN lower(c.decision_owner_email)) = 0
          THEN lower(c.decision_owner_email)
        ELSE lower(
          (
            SELECT s.pod_product_manager_mapping ->> coalesce(
              la.pod,
              (la.aha_fields -> 'custom_fields' ->> 'dev_backlog_pod')
            ) FROM settings s
          )
        )
      END AS resolved_email,
      jsonb_build_object(
        'id', la.id,
        'name', la.name,
        'target_launch_date', la.target_launch_date,
        'tier', la.tier,
        'pod', COALESCE(
          la.pod,
          (la.aha_fields -> 'custom_fields' ->> 'dev_backlog_pod')
        )
      ) AS launch,
      jsonb_build_object(
        'label', c.label,
        'category', c.category,
        'gate', c.gate,
        'sort_order', c.sort_order,
        'status_definition_go', c.status_definition_go,
        'status_definition_conditional', c.status_definition_conditional,
        'status_definition_no_go', c.status_definition_no_go,
        'rating_timing', c.rating_timing,
        'data_sources', COALESCE(c.data_sources, '[]'::jsonb)
      ) AS criterion,
      c.gate AS is_gate
    FROM epic_criterion_status lcs
    JOIN epic la ON la.id = lcs.epic_id
    JOIN criterion c ON c.id = lcs.criterion_id
    WHERE la.archived = false
  )
  SELECT id, status, condition, condition_due_date, last_updated_at, launch, criterion
  FROM base
  WHERE resolved_email = lower(p_email)
    AND (
      p_show_all = true
      OR (status IS NULL OR status = 'NOT_SET' OR status = 'NOT_APPLICABLE')
      OR (status = 'CONDITIONAL' AND is_gate = true)
    )
  ORDER BY last_updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION my_items_for_user(text, boolean) TO authenticated;
