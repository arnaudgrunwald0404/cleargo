-- 0016_link_rating_timing_to_launch_stages.sql
-- Link rating_timing column to launch_stages table via foreign key
-- This migration converts the text rating_timing to a foreign key reference

DO $$
BEGIN
    -- Check if rating_timing is still text type (needs conversion)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'criterion' 
        AND column_name = 'rating_timing'
        AND data_type = 'text'
    ) THEN
        -- Add new foreign key column with temporary name
        ALTER TABLE criterion 
        ADD COLUMN rating_timing_stage_id BIGINT REFERENCES launch_stages(id) ON DELETE SET NULL;
        
        -- Populate the new column by matching text values to launch_stages.name
        UPDATE criterion c
        SET rating_timing_stage_id = ls.id
        FROM launch_stages ls
        WHERE c.rating_timing = ls.name
        AND c.rating_timing IS NOT NULL;
        
        -- Drop the old text column
        ALTER TABLE criterion 
        DROP COLUMN rating_timing;
        
        -- Rename the new column to rating_timing
        ALTER TABLE criterion 
        RENAME COLUMN rating_timing_stage_id TO rating_timing;
        
        COMMENT ON COLUMN criterion.rating_timing IS 'Foreign key to launch_stages table - the timing by which the criteria needs to be rated';
    END IF;
    
    -- If rating_timing doesn't exist at all, add it as foreign key
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'criterion' 
        AND column_name = 'rating_timing'
    ) THEN
        ALTER TABLE criterion 
        ADD COLUMN rating_timing BIGINT REFERENCES launch_stages(id) ON DELETE SET NULL;
        
        COMMENT ON COLUMN criterion.rating_timing IS 'Foreign key to launch_stages table - the timing by which the criteria needs to be rated';
    END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_criterion_rating_timing ON criterion(rating_timing);

