-- Forecast engine tables: migrates the forecast model in-app (epic Forecast tab),
-- replacing the external Chrysalis-repo /forecast skill as the source of truth.
-- epic_forecast_link (from 20260624100000) is kept as the shareable-link/summary record
-- and gets a nullable FK to the canonical run below.

CREATE TABLE IF NOT EXISTS forecast_runs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id                 uuid        REFERENCES epic(id) ON DELETE SET NULL,
  epic_aha_id             text        NOT NULL,     -- e.g. "APP-E-670" — primary epics: ref
  source                  text        NOT NULL CHECK (source IN ('migrated_from_chrysalis', 'generated')),
  status                  text        NOT NULL DEFAULT 'complete' CHECK (status IN ('pending', 'running', 'complete', 'error')),
  is_current              boolean     NOT NULL DEFAULT true,
  -- Verbatim archive of the source documents when source = 'migrated_from_chrysalis'.
  -- Preserved regardless of extraction quality — nothing is lost even if structured
  -- extraction into forecast_assumptions/forecast_periods/forecast_narrative is imperfect.
  raw_markdown_forecast     text,
  raw_markdown_assumptions  text,
  error_message           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              text
);

CREATE INDEX idx_forecast_runs_epic_aha_id ON forecast_runs (epic_aha_id);
CREATE INDEX idx_forecast_runs_epic_id ON forecast_runs (epic_id);
CREATE INDEX idx_forecast_runs_current ON forecast_runs (epic_aha_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS forecast_assumptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid        NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  key             text        NOT NULL,             -- e.g. "account_penetration_y1", "acv", "ramp_profile"
  label           text        NOT NULL,              -- human-readable, e.g. "Account Penetration — Year 1"
  value_bear      text,
  value_base      text,
  value_bull      text,
  confidence      text        NOT NULL CHECK (confidence IN ('confirmed', 'hypothesis', 'low_confidence')),
  source_note     text,                              -- citation / provenance, e.g. "Matt Yang, Sales, Slack, 2026-07-11"
  sort_order      int         NOT NULL DEFAULT 0,     -- ordering by sensitivity to Year 1 bookings, per HTML spec
  overridden_by   text,
  overridden_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_forecast_assumptions_run_id ON forecast_assumptions (run_id);

CREATE TABLE IF NOT EXISTS forecast_periods (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid        NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  scenario            text        NOT NULL CHECK (scenario IN ('bear', 'base', 'bull')),
  period_type         text        NOT NULL CHECK (period_type IN ('month', 'quarter', 'year')),
  period_label        text        NOT NULL,           -- e.g. "2027-04", "Q2 2027", "2027"
  period_start        date,
  cross_sell_arr_usd  integer     NOT NULL DEFAULT 0,
  net_new_arr_usd     integer     NOT NULL DEFAULT 0,
  churn_reduction_arr_usd integer NOT NULL DEFAULT 0,
  total_arr_usd       integer     NOT NULL DEFAULT 0,
  sort_order          int         NOT NULL DEFAULT 0
);

CREATE INDEX idx_forecast_periods_run_id ON forecast_periods (run_id);
CREATE INDEX idx_forecast_periods_run_scenario_type ON forecast_periods (run_id, scenario, period_type);

CREATE TABLE IF NOT EXISTS forecast_narrative (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid        NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  section     text        NOT NULL CHECK (section IN ('why_we_believe', 'friction_points', 'tactical_roadmap', 'risks', 'methodology_notes')),
  content     text        NOT NULL,                   -- markdown
  sort_order  int         NOT NULL DEFAULT 0
);

CREATE INDEX idx_forecast_narrative_run_id ON forecast_narrative (run_id);

-- Background generation jobs — same shape as heart_setup_jobs (20260223100000), reused
-- for the async "Generate/Refresh Forecast" pipeline (Netlify background function + poll route).
CREATE TABLE IF NOT EXISTS forecast_generation_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id       uuid        REFERENCES epic(id) ON DELETE SET NULL,
  epic_aha_id   text        NOT NULL,
  app_user_id   uuid,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result        jsonb,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_forecast_generation_jobs_epic_aha_id ON forecast_generation_jobs (epic_aha_id);

ALTER TABLE public.epic_forecast_link
  ADD COLUMN IF NOT EXISTS forecast_run_id uuid REFERENCES forecast_runs(id) ON DELETE SET NULL;

ALTER TABLE forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_narrative ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read forecast runs" ON forecast_runs FOR SELECT USING (true);
CREATE POLICY "All authenticated users can write forecast runs" ON forecast_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "All authenticated users can update forecast runs" ON forecast_runs FOR UPDATE USING (true);

CREATE POLICY "All authenticated users can read forecast assumptions" ON forecast_assumptions FOR SELECT USING (true);
CREATE POLICY "All authenticated users can write forecast assumptions" ON forecast_assumptions FOR INSERT WITH CHECK (true);
CREATE POLICY "All authenticated users can update forecast assumptions" ON forecast_assumptions FOR UPDATE USING (true);

CREATE POLICY "All authenticated users can read forecast periods" ON forecast_periods FOR SELECT USING (true);
CREATE POLICY "All authenticated users can write forecast periods" ON forecast_periods FOR INSERT WITH CHECK (true);

CREATE POLICY "All authenticated users can read forecast narrative" ON forecast_narrative FOR SELECT USING (true);
CREATE POLICY "All authenticated users can write forecast narrative" ON forecast_narrative FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can read forecast generation jobs" ON forecast_generation_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert forecast generation jobs" ON forecast_generation_jobs FOR INSERT TO authenticated WITH CHECK (true);

GRANT ALL ON forecast_runs TO service_role;
GRANT ALL ON forecast_assumptions TO service_role;
GRANT ALL ON forecast_periods TO service_role;
GRANT ALL ON forecast_narrative TO service_role;
GRANT ALL ON forecast_generation_jobs TO service_role;
