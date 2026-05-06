-- Cached one-line AI summaries for roadmap snapshot rows (Performance Insights / Rewind).
-- Written only via Next.js API using the service-role client; authenticated users read through the API.

CREATE TABLE IF NOT EXISTS public.ai_description_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  aha_key text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_description_cache_snapshot_aha_unique UNIQUE (snapshot_date, aha_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_description_cache_snapshot_date
  ON public.ai_description_cache (snapshot_date);

ALTER TABLE public.ai_description_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_description_cache_select_authenticated" ON public.ai_description_cache;
CREATE POLICY "ai_description_cache_select_authenticated"
  ON public.ai_description_cache
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.ai_description_cache IS
  'Gemini-generated short epic blurbs per snapshot week; populated by POST /api/roadmap/card-descriptions.';

GRANT ALL ON public.ai_description_cache TO service_role;
GRANT SELECT ON public.ai_description_cache TO authenticated;

NOTIFY pgrst, 'reload schema';
