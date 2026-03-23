ALTER TABLE public.epic ADD COLUMN IF NOT EXISTS launch_ref text;

CREATE INDEX IF NOT EXISTS idx_epic_launch_ref ON public.epic (launch_ref);
