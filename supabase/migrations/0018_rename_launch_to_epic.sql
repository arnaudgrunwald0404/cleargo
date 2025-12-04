-- 0018_rename_launch_to_epic.sql
-- Rename launch table to epic and update all related references

-- Rename the launch table to epic
ALTER TABLE IF EXISTS launch RENAME TO epic;

-- Rename the launch_criterion_status table to epic_criterion_status
ALTER TABLE IF EXISTS launch_criterion_status RENAME TO epic_criterion_status;

-- Rename the launch_id column in epic_criterion_status to epic_id
ALTER TABLE IF EXISTS epic_criterion_status RENAME COLUMN launch_id TO epic_id;

-- Rename the launch_id column in decision_snapshot to epic_id
ALTER TABLE IF EXISTS decision_snapshot RENAME COLUMN launch_id TO epic_id;

-- Update foreign key constraint names
ALTER TABLE IF EXISTS epic_criterion_status 
    DROP CONSTRAINT IF EXISTS launch_criterion_status_launch_id_fkey,
    ADD CONSTRAINT epic_criterion_status_epic_id_fkey 
    FOREIGN KEY (epic_id) REFERENCES epic(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS decision_snapshot 
    DROP CONSTRAINT IF EXISTS decision_snapshot_launch_id_fkey,
    ADD CONSTRAINT decision_snapshot_epic_id_fkey 
    FOREIGN KEY (epic_id) REFERENCES epic(id) ON DELETE CASCADE;

-- Rename indexes
DROP INDEX IF EXISTS idx_launch_product;
DROP INDEX IF EXISTS idx_launch_tier;
DROP INDEX IF EXISTS idx_launch_status;
DROP INDEX IF EXISTS idx_launch_target_date;
DROP INDEX IF EXISTS idx_launch_owner;
DROP INDEX IF EXISTS idx_lcs_launch;

CREATE INDEX IF NOT EXISTS idx_epic_product ON epic(product_id);
CREATE INDEX IF NOT EXISTS idx_epic_tier ON epic(tier);
CREATE INDEX IF NOT EXISTS idx_epic_status ON epic(status);
CREATE INDEX IF NOT EXISTS idx_epic_target_date ON epic(target_launch_date);
CREATE INDEX IF NOT EXISTS idx_epic_owner ON epic(owner_id);
CREATE INDEX IF NOT EXISTS idx_ecs_epic ON epic_criterion_status(epic_id);

-- Update RLS policies
ALTER TABLE IF EXISTS epic ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS epic_criterion_status ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can select launch" ON epic;
DROP POLICY IF EXISTS "Authenticated users can insert launch" ON epic;
DROP POLICY IF EXISTS "Authenticated users can update launch" ON epic;
DROP POLICY IF EXISTS "Authenticated users can delete launch" ON epic;
DROP POLICY IF EXISTS "Authenticated users can select launch_criterion_status" ON epic_criterion_status;
DROP POLICY IF EXISTS "Authenticated users can insert launch_criterion_status" ON epic_criterion_status;
DROP POLICY IF EXISTS "Authenticated users can update launch_criterion_status" ON epic_criterion_status;

-- Create new policies with updated table names
CREATE POLICY "Authenticated users can select epic" ON epic FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert epic" ON epic FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update epic" ON epic FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete epic" ON epic FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated users can select epic_criterion_status" ON epic_criterion_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert epic_criterion_status" ON epic_criterion_status FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update epic_criterion_status" ON epic_criterion_status FOR UPDATE TO authenticated USING (true);

-- Update the my_items_for_user function to use new table names
CREATE OR REPLACE FUNCTION my_items_for_user(p_email text)
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
      -- embed epic subset (keeping field name as 'launch' for API compatibility)
      jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'target_launch_date', e.target_launch_date,
        'tier', e.tier
      ) AS launch,
      -- embed criterion subset
      jsonb_build_object(
        'label', c.label,
        'category', c.category
      ) AS criterion
    FROM epic_criterion_status ecs
    JOIN epic e ON e.id = ecs.epic_id
    JOIN criterion c ON c.id = ecs.criterion_id
  )
  SELECT id, status, condition, condition_due_date, last_updated_at, launch, criterion
  FROM base
  WHERE resolved_email = lower(p_email)
  ORDER BY last_updated_at DESC;
$$;

-- Update index name in optimize_my_items migration reference
-- Note: The migration 20251201170000_optimize_my_items.sql adds pod column to launch table
-- We need to ensure the pod column exists on epic table (it should be migrated automatically)
-- But we should also update the index name
DROP INDEX IF EXISTS idx_launch_pod;
CREATE INDEX IF NOT EXISTS idx_epic_pod ON epic(pod);

