-- 20251218000000_rename_launch_to_epic_in_my_items.sql
-- Update the my_items_for_user function to return 'epic' instead of 'launch' field name

CREATE OR REPLACE FUNCTION my_items_for_user(p_email text)
RETURNS TABLE (
  id uuid,
  status text,
  condition text,
  condition_due_date date,
  last_updated_at timestamptz,
  epic jsonb,
  criterion jsonb
)
LANGUAGE sql
AS $$
  WITH settings AS (
    SELECT pod_product_manager_mapping FROM app_settings WHERE id = 1
  ),
  base AS (
    SELECT
      ecs.id,
      ecs.status,
      ecs.condition,
      ecs.condition_due_date,
      ecs.last_updated_at,
      -- resolved email per row
      CASE
        WHEN c.decision_owner_email IS NULL OR c.decision_owner_email = '' THEN NULL
        WHEN c.decision_owner_email <> '[name of pod''s product manager]'
             AND position('pod' IN lower(c.decision_owner_email)) = 0
          THEN lower(c.decision_owner_email)
        ELSE lower(
          (
            SELECT s.pod_product_manager_mapping ->> coalesce(
              e.pod,
              (e.aha_fields -> 'custom_fields' ->> 'dev_backlog_pod')
            ) FROM settings s
          )
        )
      END AS resolved_email,
      -- embed epic subset
      jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'target_launch_date', e.target_launch_date,
        'tier', e.tier
      ) AS epic,
      -- embed criterion subset
      jsonb_build_object(
        'label', c.label,
        'category', c.category
      ) AS criterion
    FROM epic_criterion_status ecs
    JOIN epic e ON e.id = ecs.epic_id
    JOIN criterion c ON c.id = ecs.criterion_id
  )
  SELECT id, status, condition, condition_due_date, last_updated_at, epic, criterion
  FROM base
  WHERE resolved_email = lower(p_email)
  ORDER BY last_updated_at DESC;
$$;

