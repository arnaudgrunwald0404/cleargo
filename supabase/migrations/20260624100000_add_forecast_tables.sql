-- Create storage bucket for forecast HTML reports (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'forecast-reports',
  'forecast-reports',
  true,
  10485760,  -- 10MB
  ARRAY['text/html']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read forecast reports (they are intentionally public)
CREATE POLICY "Public read access for forecast reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'forecast-reports');

-- Allow authenticated uploads
CREATE POLICY "Authenticated users can upload forecast reports"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'forecast-reports');

-- Allow overwriting existing forecast reports
CREATE POLICY "Authenticated users can update forecast reports"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'forecast-reports');

-- Structured forecast link records — one per generate run, queryable across all epics
CREATE TABLE IF NOT EXISTS epic_forecast_link (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id             uuid        REFERENCES epic(id) ON DELETE SET NULL,
  epic_aha_id         text        NOT NULL,     -- e.g. "APP-E-1210"
  url                 text        NOT NULL,     -- Public URL of the rendered forecast
  generation_date     date,
  scenario            text        NOT NULL DEFAULT 'base',
  arr_upside_3yr_usd  integer,                 -- 3-year ARR upside in USD (whole dollars)
  storage_path        text,                    -- Set when uploaded via /report endpoint
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text                     -- Email of user who created this link
);

CREATE INDEX idx_epic_forecast_link_aha_id ON epic_forecast_link (epic_aha_id);
CREATE INDEX idx_epic_forecast_link_epic_id ON epic_forecast_link (epic_id);
CREATE INDEX idx_epic_forecast_link_created_at ON epic_forecast_link (created_at DESC);

ALTER TABLE epic_forecast_link ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read forecast links"
  ON epic_forecast_link FOR SELECT
  USING (true);

CREATE POLICY "All authenticated users can create forecast links"
  ON epic_forecast_link FOR INSERT
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update forecast links"
  ON epic_forecast_link FOR UPDATE
  USING (true);

CREATE POLICY "All authenticated users can delete forecast links"
  ON epic_forecast_link FOR DELETE
  USING (true);

-- Grant to service role (used by admin client)
GRANT ALL ON epic_forecast_link TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
