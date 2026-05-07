-- Idempotent: fixes 42501 "permission denied for table ai_description_cache" on upsert
-- when grants were missing (wrong project, skipped migration, or restored snapshot).

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_description_cache TO service_role;
GRANT SELECT ON TABLE public.ai_description_cache TO authenticated;

NOTIFY pgrst, 'reload schema';
