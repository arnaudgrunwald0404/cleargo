-- AI-assisted Story Brief per epic (CLEARGO Story Brief workstream, Kristin Penney / Arnaud Grunwald).
-- Native ClearGo storage for the PM->PMM "day-one handoff" doc: 8 fixed sections matching the
-- real Story Brief template, an Aha-vs-Jira delivery-validation snapshot used as grounding, and a
-- draft -> ratified workflow that mirrors the template's own v0.1 -> v1.0 versioning (ratification
-- requires every "open decisions" gate item to be resolved or explicitly deferred).

CREATE TABLE IF NOT EXISTS epic_story_brief (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES epic(id) ON DELETE CASCADE,

  story_code text,
  brief_version text NOT NULL DEFAULT 'v0.1',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ratified')),

  pm_owner_email text,
  pmm_owner_email text,
  prod_ed_owner_email text,
  -- { announce_date, ga_date, note } -- keeps the template's two-date discipline explicit.
  target_window jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Current/editable content for the 8 sections (see src/lib/story-brief/generator.ts for shape).
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Raw, never-mutated AI output, kept alongside content for audit/diffing after edits.
  ai_draft jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Aha-vs-Jira delivery-validation facts, and the full assembled prompt context.
  validation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  generated_at timestamptz,
  generated_by uuid REFERENCES app_user(id),
  ratified_by uuid REFERENCES app_user(id),
  ratified_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(epic_id)
);

CREATE INDEX IF NOT EXISTS idx_epic_story_brief_epic ON epic_story_brief (epic_id);
CREATE INDEX IF NOT EXISTS idx_epic_story_brief_status ON epic_story_brief (status);

-- Visible Change / Decision Log (per Arnaud: briefs will go through several revisions and need an
-- explicit log of what changed and why). Also doubles as the generate/edit/ratify audit trail.
CREATE TABLE IF NOT EXISTS epic_story_brief_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_story_brief_id uuid NOT NULL REFERENCES epic_story_brief(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('generated', 'edited', 'ratified')),
  actor_email text,
  note text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esb_change_log_brief
  ON epic_story_brief_change_log (epic_story_brief_id, created_at DESC);

ALTER TABLE epic_story_brief ENABLE ROW LEVEL SECURITY;
ALTER TABLE epic_story_brief_change_log ENABLE ROW LEVEL SECURITY;

-- RLS is permissive here, matching epic_ai_retro's house style; capability enforcement
-- (storyBrief.generate / storyBrief.edit / storyBrief.ratify) lives in the API route layer.
DROP POLICY IF EXISTS "Authenticated users can read epic_story_brief" ON epic_story_brief;
CREATE POLICY "Authenticated users can read epic_story_brief"
  ON epic_story_brief FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert epic_story_brief" ON epic_story_brief;
CREATE POLICY "Authenticated users can insert epic_story_brief"
  ON epic_story_brief FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update epic_story_brief" ON epic_story_brief;
CREATE POLICY "Authenticated users can update epic_story_brief"
  ON epic_story_brief FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read epic_story_brief_change_log" ON epic_story_brief_change_log;
CREATE POLICY "Authenticated users can read epic_story_brief_change_log"
  ON epic_story_brief_change_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert epic_story_brief_change_log" ON epic_story_brief_change_log;
CREATE POLICY "Authenticated users can insert epic_story_brief_change_log"
  ON epic_story_brief_change_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Role grants are NOT automatic in this project: 20260717000000 exists solely
-- because the launch tables were created without them and every role got 42501
-- "permission denied", breaking every /api/launches* endpoint. RLS above still
-- governs row access.
GRANT ALL ON public.epic_story_brief TO anon, authenticated, service_role;
GRANT ALL ON public.epic_story_brief_change_log TO anon, authenticated, service_role;
