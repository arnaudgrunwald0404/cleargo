-- Store LLM-generated retrospective analyses per epic.

CREATE TABLE IF NOT EXISTS epic_ai_retro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES epic(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES app_user(id),
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  retro_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(epic_id)
);

CREATE INDEX IF NOT EXISTS idx_epic_ai_retro_epic
  ON epic_ai_retro (epic_id);

ALTER TABLE epic_ai_retro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read epic_ai_retro"
  ON epic_ai_retro FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert epic_ai_retro"
  ON epic_ai_retro FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update epic_ai_retro"
  ON epic_ai_retro FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
