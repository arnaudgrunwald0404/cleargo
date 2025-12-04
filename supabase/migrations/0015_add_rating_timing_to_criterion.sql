-- 0015_add_rating_timing_to_criterion.sql
-- Add rating_timing column (column D) to criterion table
-- This column stores the timing by which the criteria needs to be rated

DO $$
BEGIN
    -- Check if column doesn't exist, then add it
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'criterion' 
        AND column_name = 'rating_timing'
    ) THEN
        ALTER TABLE criterion 
        ADD COLUMN rating_timing text;
        
        COMMENT ON COLUMN criterion.rating_timing IS 'Timing by which the criteria needs to be rated (from column D)';
    END IF;
END $$;



