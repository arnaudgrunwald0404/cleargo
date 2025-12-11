-- Add aha_tags column to app_settings table
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS aha_tags text[] DEFAULT ARRAY['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo'];

-- Update existing row if it exists (id=1 is the singleton row)
UPDATE app_settings 
SET aha_tags = ARRAY['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo']
WHERE id = 1 AND aha_tags IS NULL;
