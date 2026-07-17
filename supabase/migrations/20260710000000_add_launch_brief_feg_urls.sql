-- Add Brief Template and Field Enablement Guide URL fields to launch table
ALTER TABLE public.launch
  ADD COLUMN IF NOT EXISTS brief_url TEXT,
  ADD COLUMN IF NOT EXISTS feg_url TEXT;

COMMENT ON COLUMN launch.brief_url IS 'Google Docs URL for the Launch Brief Template';
COMMENT ON COLUMN launch.feg_url IS 'Google Docs URL for the Field Enablement Guide';
