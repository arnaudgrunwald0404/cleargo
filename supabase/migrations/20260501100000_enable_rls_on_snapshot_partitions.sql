-- Enable RLS on all existing roadmap_snapshot_YYYY_MM partitions
-- and update ensure_roadmap_snapshot_partitions() so future partitions
-- get RLS enabled at creation time.
--
-- Background: PostgreSQL does not propagate RLS from a partitioned parent
-- to its child tables. The parent (roadmap_snapshot) already has RLS +
-- a SELECT-to-authenticated policy, but each partition must also have
-- RLS enabled so that (a) the Supabase security linter is satisfied and
-- (b) direct partition access is protected. Queries through the parent
-- are already covered by the parent's policy.

-- 1. Enable RLS + add permissive SELECT policy on every existing partition.
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^roadmap_snapshot_\d{4}_\d{2}$'
    ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop first so re-running is idempotent
    EXECUTE format(
      'DROP POLICY IF EXISTS "roadmap_snapshot_partition_select_authenticated" ON public.%I',
      tbl
    );
    EXECUTE format(
      $p$CREATE POLICY "roadmap_snapshot_partition_select_authenticated"
         ON public.%I FOR SELECT TO authenticated USING (true)$p$,
      tbl
    );
  END LOOP;
END;
$$;

-- 2. Replace ensure_roadmap_snapshot_partitions() so new partitions also
--    get RLS enabled immediately after creation.
CREATE OR REPLACE FUNCTION public.ensure_roadmap_snapshot_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  lim date;
  part_name text;
BEGIN
  d := (date_trunc('month', current_date)::date - interval '1 month')::date;
  lim := (date_trunc('month', current_date)::date + interval '6 months')::date;
  WHILE d < lim LOOP
    part_name := 'roadmap_snapshot_' || to_char(d, 'YYYY_MM');
    BEGIN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.roadmap_snapshot FOR VALUES FROM (%L) TO (%L)',
        part_name,
        d,
        (d + interval '1 month')::date
      );
    EXCEPTION
      WHEN duplicate_table THEN
        NULL; -- partition already exists, fall through to RLS block
    END;

    -- Enable RLS on new and pre-existing partitions (idempotent)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part_name);
    EXECUTE format(
      'DROP POLICY IF EXISTS "roadmap_snapshot_partition_select_authenticated" ON public.%I',
      part_name
    );
    EXECUTE format(
      $p$CREATE POLICY "roadmap_snapshot_partition_select_authenticated"
         ON public.%I FOR SELECT TO authenticated USING (true)$p$,
      part_name
    );

    d := (d + interval '1 month')::date;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_roadmap_snapshot_partitions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_roadmap_snapshot_partitions() TO service_role;

NOTIFY pgrst, 'reload schema';
