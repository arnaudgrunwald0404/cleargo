-- Roadmap snapshot: GTM pivot columns + promoted-ideas vote count (schema only).

ALTER TABLE public.roadmap_snapshot
  ADD COLUMN IF NOT EXISTS gtm_module TEXT,
  ADD COLUMN IF NOT EXISTS gtm_name TEXT,
  ADD COLUMN IF NOT EXISTS aha_promoted_ideas_votes INTEGER;

COMMENT ON COLUMN public.roadmap_snapshot.gtm_module IS 'GTM Module from Aha! pivot (optional display alternative to Dev Backlog/Pod).';
COMMENT ON COLUMN public.roadmap_snapshot.gtm_name IS 'GTM Name from Aha! pivot (optional display alternative to Epic name).';
COMMENT ON COLUMN public.roadmap_snapshot.aha_promoted_ideas_votes IS 'Epic promoted ideas vote count from Aha! pivot (stored for future use).';
