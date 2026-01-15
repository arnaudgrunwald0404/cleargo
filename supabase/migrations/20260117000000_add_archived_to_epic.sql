-- Add archived column to epic table
ALTER TABLE public.epic
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for filtering archived epics
CREATE INDEX IF NOT EXISTS idx_epic_archived ON public.epic(archived);

-- Add comment
COMMENT ON COLUMN public.epic.archived IS 'Whether the epic is archived. Epics are automatically archived when cleargo_candidate is not "Yes" and unarchived when it becomes "Yes" again.';
