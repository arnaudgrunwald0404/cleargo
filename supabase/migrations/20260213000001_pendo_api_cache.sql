-- Generic cache table for Pendo API responses
-- Used to avoid repeated slow calls to Pendo from serverless functions (Netlify)
-- Shared across all users - when one user fetches, everyone benefits

CREATE TABLE IF NOT EXISTS public.pendo_api_cache (
  cache_key text PRIMARY KEY,          -- e.g. 'events', 'features', 'features:app123', 'segments'
  data jsonb NOT NULL DEFAULT '[]',    -- cached JSON response
  cached_at timestamptz NOT NULL DEFAULT now(),
  ttl_seconds int NOT NULL DEFAULT 3600 -- 1 hour default
);

-- Anyone authenticated can read the cache
ALTER TABLE public.pendo_api_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pendo_api_cache_select" ON public.pendo_api_cache;
CREATE POLICY "pendo_api_cache_select" ON public.pendo_api_cache
  FOR SELECT TO authenticated USING (true);

-- Admins can write to the cache
DROP POLICY IF EXISTS "pendo_api_cache_all" ON public.pendo_api_cache;
CREATE POLICY "pendo_api_cache_all" ON public.pendo_api_cache
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (auth.jwt()->>'email')
      AND (roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );

-- Grant permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pendo_api_cache TO authenticated;
