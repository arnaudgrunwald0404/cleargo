-- 0009_deduplicate_launch_criterion_status.sql
-- Add unique constraint and clean up duplicate launch_criterion_status records

-- First, remove duplicates, keeping the most recently updated record for each (launch_id, criterion_id) pair
DELETE FROM launch_criterion_status
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
            ROW_NUMBER() OVER (
                PARTITION BY launch_id, criterion_id 
                ORDER BY last_updated_at DESC, id DESC
            ) as rn
        FROM launch_criterion_status
    ) t
    WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_launch_criterion_status 
ON launch_criterion_status(launch_id, criterion_id);

