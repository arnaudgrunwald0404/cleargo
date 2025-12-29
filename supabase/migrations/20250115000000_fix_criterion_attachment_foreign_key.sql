-- Fix foreign key constraint for criterion_attachment table
-- The table was created referencing launch_criterion_status, but that table was renamed to epic_criterion_status in migration 0018
-- PostgreSQL auto-generates constraint names, so we need to find and drop the existing constraint first

-- Find and drop any existing foreign key constraint on launch_criterion_status_id
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Find the constraint name by looking for foreign keys on the launch_criterion_status_id column
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'criterion_attachment'::regclass
      AND contype = 'f'
      AND (
          -- Check if the constraint references launch_criterion_status_id column
          EXISTS (
              SELECT 1 FROM pg_attribute 
              WHERE attrelid = conrelid 
              AND attname = 'launch_criterion_status_id'
              AND attnum = ANY(conkey)
          )
      );
    
    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE criterion_attachment DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END IF;
END $$;

-- Add the correct foreign key constraint pointing to epic_criterion_status
ALTER TABLE IF EXISTS criterion_attachment
    ADD CONSTRAINT criterion_attachment_launch_criterion_status_id_fkey
    FOREIGN KEY (launch_criterion_status_id) 
    REFERENCES epic_criterion_status(id) 
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT criterion_attachment_launch_criterion_status_id_fkey ON criterion_attachment IS 
'Foreign key to epic_criterion_status (column name kept as launch_criterion_status_id for backward compatibility)';

