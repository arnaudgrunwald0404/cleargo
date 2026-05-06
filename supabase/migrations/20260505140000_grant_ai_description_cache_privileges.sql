-- Table was created without GRANTs; API uses service_role and got "permission denied" (42501).
GRANT ALL ON public.ai_description_cache TO service_role;
GRANT SELECT ON public.ai_description_cache TO authenticated;

NOTIFY pgrst, 'reload schema';
