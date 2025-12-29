-- 0013_ensure_aha_fields_column.sql
-- Ensure aha_fields column exists (handles both old and new column names)
-- This migration is idempotent and safe to run multiple times

-- First, check if aha_custom_fields exists and rename it if needed
DO $$
BEGIN
    -- Check if aha_custom_fields exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'launch' 
        AND column_name = 'aha_custom_fields'
    ) THEN
        -- Drop the old index if it exists
        DROP INDEX IF EXISTS idx_launch_aha_custom_fields;
        
        -- Rename the column
        ALTER TABLE launch RENAME COLUMN aha_custom_fields TO aha_fields;
        
        -- Recreate the index with the new column name
        CREATE INDEX IF NOT EXISTS idx_launch_aha_fields ON launch USING gin(aha_fields);
    END IF;
    
    -- Ensure aha_fields exists (create if it doesn't exist after rename check)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'launch' 
        AND column_name = 'aha_fields'
    ) THEN
        -- Add the column if it doesn't exist
        ALTER TABLE launch
        ADD COLUMN aha_fields jsonb DEFAULT '{}'::jsonb;
        
        -- Create the index
        CREATE INDEX IF NOT EXISTS idx_launch_aha_fields ON launch USING gin(aha_fields);
    END IF;
END $$;

-- Update the comment
COMMENT ON COLUMN launch.aha_fields IS 'Dynamic AHA fields (standard and custom) stored as JSONB. Format: {"standard_fields": {...}, "custom_fields": {...}}. Allows adding/removing fields without schema changes.';













