-- Make benchmark_id optional in epic_success_configs
-- Benchmarks are now selected as metrics, so benchmark_id is no longer required at config creation
-- Note: Only runs if table exists (may not exist in all deployments)

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'epic_success_configs' AND table_schema = 'public') THEN
    ALTER TABLE public.epic_success_configs
      ALTER COLUMN benchmark_id DROP NOT NULL;
    COMMENT ON COLUMN public.epic_success_configs.benchmark_id IS 'Optional benchmark ID. Benchmarks can be selected as metrics instead of being required at config creation.';
  END IF;
END $$;
