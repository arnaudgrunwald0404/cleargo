-- Repair: remote launch_criterion_status was created from an earlier draft of
-- 20260314000001 and is missing the per-task assignment columns that
-- /api/launches/[id] selects (error: "column ... owner_id does not exist").
-- Definitions match 20260314000001_create_launches_tables.sql exactly.
ALTER TABLE public.launch_criterion_status
  ADD COLUMN IF NOT EXISTS owner_id    UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS due_date    DATE,
  ADD COLUMN IF NOT EXISTS notes       TEXT,
  ADD COLUMN IF NOT EXISTS links       JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();
