-- Add archived column to release_schedule table
ALTER TABLE public.release_schedule 
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for filtering archived releases
CREATE INDEX IF NOT EXISTS idx_release_schedule_archived ON public.release_schedule(archived);

-- Add comment
COMMENT ON COLUMN public.release_schedule.archived IS 'Whether the release is archived and should be hidden from the main releases page';

