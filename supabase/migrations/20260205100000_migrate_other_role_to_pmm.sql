-- Migrate all users with primary role OTHER to PMM
UPDATE app_user
SET
  role = 'PMM',
  roles = ARRAY['PMM']::text[],
  updated_at = now()
WHERE role = 'OTHER'
   OR (roles IS NOT NULL AND array_length(roles, 1) >= 1 AND roles[1] = 'OTHER');
