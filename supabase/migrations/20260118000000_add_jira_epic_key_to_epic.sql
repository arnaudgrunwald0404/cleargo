-- Add jira_epic_key column to epic table for caching Jira epic keys
ALTER TABLE public.epic
ADD COLUMN IF NOT EXISTS jira_epic_key TEXT NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_epic_jira_epic_key ON public.epic(jira_epic_key) WHERE jira_epic_key IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.epic.jira_epic_key IS 'Cached Jira epic key for this epic. Used to avoid repeated API searches. Populated when Jira epic key is first discovered via API search or integrations field.';
