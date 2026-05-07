-- get_year_movements_with_impact — surface GTM columns for Rewind UI

DROP FUNCTION IF EXISTS public.get_year_movements_with_impact(date);

CREATE OR REPLACE FUNCTION public.get_year_movements_with_impact(as_of_date date DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  week_end date,
  aha_key text,
  aha_name text,
  gtm_name text,
  gtm_module text,
  aha_csm_priority text,
  from_release text,
  to_release text,
  to_release_date date,
  impact_level text,
  calculated_impact_level text,
  is_overridden boolean,
  next_three_releases text[]
) AS $$
DECLARE
  v_year_start date;
  v_latest_date date;
  v_last_prev_year_snapshot date;
BEGIN
  IF as_of_date IS NULL THEN
    SELECT MAX(snapshot_date) INTO v_latest_date FROM public.roadmap_snapshot;
  ELSE
    SELECT MAX(snapshot_date) INTO v_latest_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date <= as_of_date;
  END IF;

  v_year_start := date_trunc('year', v_latest_date)::date;

  SELECT MAX(snapshot_date) INTO v_last_prev_year_snapshot
  FROM public.roadmap_snapshot
  WHERE snapshot_date < v_year_start;

  RETURN QUERY
  WITH
  snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE (snapshot_date >= v_year_start AND snapshot_date <= v_latest_date)
       OR snapshot_date = v_last_prev_year_snapshot
  ),
  snapshot_items AS (
    SELECT
      r.snapshot_date as snapshot_date,
      r.aha_key,
      r.aha_name,
      r.gtm_name,
      r.gtm_module,
      r.aha_csm_priority,
      r.aha_release,
      r.aha_release_date
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date IN (SELECT snapshot_date FROM snapshot_dates)
  ),
  snapshot_pairs AS (
    SELECT
      sd.snapshot_date as curr_snap_date,
      (SELECT MAX(sd2.snapshot_date)
       FROM snapshot_dates sd2
       WHERE sd2.snapshot_date < sd.snapshot_date) as previous_date
    FROM snapshot_dates sd
    WHERE sd.snapshot_date >= v_year_start
  ),
  movements AS (
    SELECT
      sp.curr_snap_date,
      (sp.curr_snap_date - (EXTRACT(ISODOW FROM sp.curr_snap_date) - 1)::int)::date as week_start,
      curr.aha_key,
      curr.aha_name,
      curr.gtm_name,
      curr.gtm_module,
      curr.aha_csm_priority,
      curr.aha_release as current_release,
      curr.aha_release_date as current_release_date,
      prev.aha_release as previous_release,
      prev.aha_release_date as previous_release_date
    FROM snapshot_pairs sp
    INNER JOIN snapshot_items curr ON curr.snapshot_date = sp.curr_snap_date
    INNER JOIN snapshot_items prev ON prev.snapshot_date = sp.previous_date
      AND prev.aha_key = curr.aha_key
    WHERE sp.previous_date IS NOT NULL
      AND prev.aha_release IS NOT NULL
      AND curr.aha_release IS NOT NULL
      AND TRIM(prev.aha_release) != TRIM(curr.aha_release)
  ),
  movements_out_of_window AS (
    SELECT
      sp.curr_snap_date,
      (sp.curr_snap_date - (EXTRACT(ISODOW FROM sp.curr_snap_date) - 1)::int)::date as week_start,
      prev.aha_key,
      prev.aha_name,
      prev.gtm_name,
      prev.gtm_module,
      prev.aha_csm_priority,
      NULL::text as current_release,
      NULL::text as current_release_date,
      prev.aha_release as previous_release,
      prev.aha_release_date as previous_release_date
    FROM snapshot_pairs sp
    INNER JOIN snapshot_items prev ON prev.snapshot_date = sp.previous_date
      AND prev.aha_release IS NOT NULL
      AND TRIM(prev.aha_release) != ''
    LEFT JOIN snapshot_items curr ON curr.snapshot_date = sp.curr_snap_date
      AND curr.aha_key = prev.aha_key
    WHERE sp.previous_date IS NOT NULL
      AND (curr.aha_key IS NULL
           OR curr.aha_release IS NULL
           OR TRIM(curr.aha_release) = '')
      AND (curr.aha_key IS NULL OR TRIM(COALESCE(curr.aha_release, '')) != TRIM(prev.aha_release))
  ),
  all_movements AS (
    SELECT * FROM movements
    UNION ALL
    SELECT * FROM movements_out_of_window
  ),
  unique_movements AS (
    SELECT DISTINCT ON (m.aha_key, m.week_start)
      m.week_start,
      m.curr_snap_date,
      m.aha_key,
      m.aha_name,
      m.gtm_name,
      m.gtm_module,
      m.aha_csm_priority,
      m.previous_release,
      m.previous_release_date,
      m.current_release,
      m.current_release_date
    FROM all_movements m
    ORDER BY m.aha_key, m.week_start, (m.current_release IS NOT NULL) DESC, m.curr_snap_date DESC
  ),
  release_dates AS (
    SELECT DISTINCT
      r.snapshot_date as snapshot_date,
      r.aha_release,
      MIN(r.aha_release_date::date) as release_date
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date IN (SELECT DISTINCT um.curr_snap_date FROM unique_movements um)
      AND r.aha_release IS NOT NULL
      AND r.aha_release != ''
      AND r.aha_release_date IS NOT NULL
    GROUP BY r.snapshot_date, r.aha_release
  ),
  next_releases AS (
    SELECT
      rd.snapshot_date,
      ARRAY_AGG(rd.aha_release ORDER BY rd.release_date) as next_three
    FROM (
      SELECT
        rd.*,
        ROW_NUMBER() OVER (PARTITION BY rd.snapshot_date ORDER BY rd.release_date) as rn
      FROM release_dates rd
      WHERE rd.release_date >= rd.snapshot_date
    ) rd
    WHERE rd.rn <= 3
    GROUP BY rd.snapshot_date
  ),
  movements_with_impact AS (
    SELECT
      um.week_start,
      um.aha_key,
      um.aha_name,
      um.gtm_name,
      um.gtm_module,
      um.aha_csm_priority,
      um.previous_release,
      um.previous_release_date,
      um.current_release,
      um.current_release_date,
      COALESCE(nr.next_three, ARRAY[]::text[]) as next_three_releases,
      CASE
        WHEN um.aha_csm_priority IS NOT NULL
          AND um.aha_csm_priority != ''
          AND TRIM(um.aha_csm_priority) != ''
        THEN 'high'
        WHEN um.current_release IS NOT NULL
          AND um.current_release = ANY(COALESCE(nr.next_three, ARRAY[]::text[]))
          AND um.previous_release_date IS NOT NULL
          AND um.current_release_date IS NOT NULL
          AND um.current_release_date::date < um.previous_release_date::date
        THEN 'positive'
        WHEN (
          (um.current_release IS NOT NULL AND um.current_release = ANY(COALESCE(nr.next_three, ARRAY[]::text[])))
          OR um.previous_release = ANY(COALESCE(nr.next_three, ARRAY[]::text[]))
          OR (um.previous_release_date IS NOT NULL AND um.previous_release_date::date < um.week_start)
        )
        THEN 'medium'
        ELSE 'low'
      END as calculated_impact
    FROM unique_movements um
    LEFT JOIN next_releases nr ON nr.snapshot_date = um.curr_snap_date
  )
  SELECT
    mwi.week_start::date,
    (mwi.week_start + INTERVAL '6 days')::date as week_end,
    mwi.aha_key,
    mwi.aha_name,
    mwi.gtm_name,
    mwi.gtm_module,
    mwi.aha_csm_priority,
    mwi.previous_release as from_release,
    mwi.current_release as to_release,
    mwi.current_release_date::date as to_release_date,
    COALESCE(pio.override_impact, mwi.calculated_impact) as impact_level,
    mwi.calculated_impact as calculated_impact_level,
    (pio.id IS NOT NULL) as is_overridden,
    mwi.next_three_releases
  FROM movements_with_impact mwi
  LEFT JOIN public.pm_impact_override pio
    ON pio.aha_key = mwi.aha_key
    AND pio.week_start = mwi.week_start::date
  ORDER BY mwi.week_start, mwi.calculated_impact;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_year_movements_with_impact(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
