-- Include criterion status definitions (GO, CONDITIONAL, NO_GO) in my_items_for_user
-- so home page traffic light tooltips can show the actual definition per criterion

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
        'status_definition_no_go', c.status_definition_no_go
      ) AS criterion
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
      OR (status IS NULL OR status = 'NOT_SET' OR status = 'CONDITIONAL')
    )
  ORDER BY last_updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION my_items_for_user(text, boolean) TO authenticated;
