-- Remove Adoption Benchmarks feature while preserving metric thresholds
-- This migration:
-- - Drops the adoption_benchmarks table
-- - Removes benchmark_id from epic_success_configs
-- - Removes benchmark_comparison from epic_scorecards

-- Safely drop policies and indexes before dropping the table
DO $$
BEGIN
  -- Drop RLS policies if they exist
  BEGIN
    DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.adoption_benchmarks;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  BEGIN
    DROP POLICY IF EXISTS "Allow write access to admins" ON public.adoption_benchmarks;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Drop index if it exists
  BEGIN
    DROP INDEX IF EXISTS idx_adoption_benchmarks_tier_type;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Drop table if it exists
  BEGIN
    DROP TABLE IF EXISTS public.adoption_benchmarks CASCADE;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END $$;

-- Remove benchmark_id from epic_success_configs if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'epic_success_configs'
      AND column_name = 'benchmark_id'
  ) THEN
    ALTER TABLE public.epic_success_configs
      DROP COLUMN benchmark_id;
  END IF;
END $$;

-- Remove benchmark_comparison from epic_scorecards if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'epic_scorecards'
      AND column_name = 'benchmark_comparison'
  ) THEN
    ALTER TABLE public.epic_scorecards
      DROP COLUMN benchmark_comparison;
  END IF;
END $$;

