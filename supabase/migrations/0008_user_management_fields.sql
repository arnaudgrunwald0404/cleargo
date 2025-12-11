-- 0008_user_management_fields.sql
-- Add user management fields to app_user table

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS roles text[] DEFAULT ARRAY['OTHER']::text[],
  ADD COLUMN IF NOT EXISTS last_logged_in timestamptz;

-- Migrate existing role to roles array
UPDATE app_user
SET roles = ARRAY[role]::text[]
WHERE roles IS NULL OR array_length(roles, 1) IS NULL;

-- Make roles NOT NULL after migration
ALTER TABLE app_user
  ALTER COLUMN roles SET DEFAULT ARRAY['OTHER']::text[],
  ALTER COLUMN roles SET NOT NULL;

COMMENT ON COLUMN app_user.first_name IS 'User first name';
COMMENT ON COLUMN app_user.last_name IS 'User last name';
COMMENT ON COLUMN app_user.title IS 'User job title';
COMMENT ON COLUMN app_user.roles IS 'Array of user roles';
COMMENT ON COLUMN app_user.last_logged_in IS 'Last login timestamp from auth.users';







