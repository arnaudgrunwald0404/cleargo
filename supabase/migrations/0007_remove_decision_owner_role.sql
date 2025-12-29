-- 0007_remove_decision_owner_role.sql
-- Remove decision_owner_role column from criterion table

ALTER TABLE criterion
  DROP COLUMN IF EXISTS decision_owner_role;














