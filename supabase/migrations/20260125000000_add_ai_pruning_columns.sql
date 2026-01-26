-- Add AI pruning columns to epic_criterion_status
ALTER TABLE epic_criterion_status 
ADD COLUMN IF NOT EXISTS ai_prune_suggested boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_prune_reason text;

-- Add index for faster lookups of prune suggestions
CREATE INDEX IF NOT EXISTS idx_ecs_ai_prune_suggested ON epic_criterion_status(ai_prune_suggested) WHERE ai_prune_suggested = true;
