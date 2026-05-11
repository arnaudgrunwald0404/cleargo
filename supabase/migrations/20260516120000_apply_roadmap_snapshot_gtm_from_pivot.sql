-- One-off / manual backfill: stamp pivot GTM fields onto all roadmap_snapshot rows per aha_key.
-- Merge mode (default): COALESCE(pivot_value, existing_column) so empty pivot cells do not wipe data.
-- Force mode: set columns exactly to pivot values (nullable).

CREATE OR REPLACE FUNCTION public.apply_roadmap_snapshot_gtm_from_pivot(
  p_updates jsonb,
  p_force boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total bigint := 0;
  r record;
  pm text;
  pn text;
  c int;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' OR jsonb_array_length(p_updates) = 0 THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT *
    FROM jsonb_to_recordset(p_updates) AS x(
      aha_key text,
      gtm_module text,
      gtm_name text
    )
  LOOP
    IF r.aha_key IS NULL OR trim(r.aha_key) = '' THEN
      CONTINUE;
    END IF;

    pm := NULLIF(trim(COALESCE(r.gtm_module, '')), '');
    pn := NULLIF(trim(COALESCE(r.gtm_name, '')), '');

    IF p_force THEN
      UPDATE public.roadmap_snapshot
      SET gtm_module = pm,
          gtm_name = pn
      WHERE aha_key = r.aha_key;
    ELSE
      UPDATE public.roadmap_snapshot
      SET
        gtm_module = COALESCE(pm, gtm_module),
        gtm_name = COALESCE(pn, gtm_name)
      WHERE aha_key = r.aha_key;
    END IF;

    GET DIAGNOSTICS c = ROW_COUNT;
    total := total + c;
  END LOOP;

  RETURN total;
END;
$$;

COMMENT ON FUNCTION public.apply_roadmap_snapshot_gtm_from_pivot(jsonb, boolean) IS
  'Backfills roadmap_snapshot.gtm_module/gtm_name from a JSON array of {aha_key, gtm_module, gtm_name}. Merge mode preserves existing values when pivot cell is empty; force mode mirrors pivot including NULLs.';

REVOKE ALL ON FUNCTION public.apply_roadmap_snapshot_gtm_from_pivot(jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_roadmap_snapshot_gtm_from_pivot(jsonb, boolean) TO service_role;
