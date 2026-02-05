-- Make launch_date nullable to allow releases without dates from Aha
-- This is needed because some Aha releases don't have end_date or start_date set

ALTER TABLE release_schedule 
ALTER COLUMN launch_date DROP NOT NULL;

-- Add a comment explaining the nullable behavior
COMMENT ON COLUMN release_schedule.launch_date IS 'Release date - can be null when Aha release has no date configured';
