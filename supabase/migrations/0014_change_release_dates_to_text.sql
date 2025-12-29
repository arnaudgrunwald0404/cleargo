-- 0014_change_release_dates_to_text.sql
-- Change release date columns from date to text to support string release names
-- This migration is idempotent and safe to run multiple times

-- Change target_launch_date from date to text
DO $$
BEGIN
    -- Check if column exists and is date type
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'launch' 
        AND column_name = 'target_launch_date'
        AND data_type = 'date'
    ) THEN
        -- Drop the index first
        DROP INDEX IF EXISTS idx_launch_target_date;
        DROP INDEX IF EXISTS idx_launch_target_date_tier;
        
        -- Change column type from date to text
        ALTER TABLE launch 
        ALTER COLUMN target_launch_date TYPE text 
        USING target_launch_date::text;
        
        -- Recreate indexes (text columns can still be indexed)
        CREATE INDEX IF NOT EXISTS idx_launch_target_date ON launch(target_launch_date);
        CREATE INDEX IF NOT EXISTS idx_launch_target_date_tier ON launch(target_launch_date, tier);
    END IF;
END $$;

-- Change scheduled_ga_dev_date from date to text
DO $$
BEGIN
    -- Check if column exists and is date type
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'launch' 
        AND column_name = 'scheduled_ga_dev_date'
        AND data_type = 'date'
    ) THEN
        -- Change column type from date to text
        ALTER TABLE launch 
        ALTER COLUMN scheduled_ga_dev_date TYPE text 
        USING scheduled_ga_dev_date::text;
    END IF;
END $$;

-- Update comments
COMMENT ON COLUMN launch.target_launch_date IS 'Target launch date or release name (text) from Aha';
COMMENT ON COLUMN launch.scheduled_ga_dev_date IS 'Scheduled GA Release (Dev Only) - can be date or release name (text) from Aha';













