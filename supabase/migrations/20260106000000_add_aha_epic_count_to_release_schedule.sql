-- Add aha_epic_count column to release_schedule table
-- This caches the total number of epics per release from AHA to avoid repeated API calls

ALTER TABLE public.release_schedule 
ADD COLUMN IF NOT EXISTS aha_epic_count INTEGER NULL;

-- Add aha_epic_count_updated_at to track when the count was last fetched
ALTER TABLE public.release_schedule 
ADD COLUMN IF NOT EXISTS aha_epic_count_updated_at TIMESTAMP WITH TIME ZONE NULL;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_release_schedule_aha_epic_count 
ON public.release_schedule(aha_epic_count) 
WHERE aha_epic_count IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.release_schedule.aha_epic_count IS 'Cached total number of epics in this release from AHA';
COMMENT ON COLUMN public.release_schedule.aha_epic_count_updated_at IS 'Timestamp when the AHA epic count was last fetched and cached';

