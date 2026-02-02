-- Fix epics that were incorrectly archived because cleargo_candidate wasn't being stored
-- This migration unarchives all epics that have an aha_id (came from Aha sync)
-- The sync code will be fixed to properly store and check cleargo_candidate going forward

-- Unarchive all epics that came from Aha (they were synced because they matched criteria)
-- A subsequent re-sync will correctly set archived status based on cleargo_candidate value
UPDATE epic
SET archived = false, updated_at = NOW()
WHERE aha_id IS NOT NULL
  AND archived = true;

-- Add comment explaining this fix
COMMENT ON TABLE epic IS 'Epics synced from Aha! - archived status is now properly based on cleargo_candidate field';
