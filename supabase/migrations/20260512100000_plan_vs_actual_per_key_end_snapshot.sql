-- Plan vs Actual: end columns come from each epic's **latest** snapshot row in the period (not only the global
-- calendar-last snapshot date). The pivot often drops shipped epics from the final weekly run; using per-key latest
-- preserves correct end status/release for chips. `in_end` stays “appears on the global last snapshot date” so
-- “Removed from roadmap” still means missing from the final pivot pull when status doesn’t look delivered.

CREATE OR REPLACE FUNCTION public.get_period_plan_vs_actual(
  p_period_type text,
  p_period_date date
)
RETURNS TABLE (
  aha_key text,
  start_snapshot_date date,
  end_snapshot_date date,
  in_start boolean,
  in_end boolean,
  start_aha_name text,
  end_aha_name text,
  start_aha_primary_goal text,
  end_aha_primary_goal text,
  start_aha_pod text,
  end_aha_pod text,
  start_gtm_module text,
  end_gtm_module text,
  start_gtm_name text,
  end_gtm_name text,
  start_aha_release text,
  end_aha_release text,
  start_aha_status text,
  end_aha_status text,
  start_aha_end_date text,
  end_aha_end_date text,
  start_aha_progress integer,
  end_aha_progress integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    CASE
      WHEN lower(trim(p_period_type)) = 'quarterly' THEN
        date_trunc('quarter', p_period_date)::date
      ELSE date_trunc('month', p_period_date)::date
    END AS period_start,
    CASE
      WHEN lower(trim(p_period_type)) = 'quarterly' THEN
        (date_trunc('quarter', p_period_date) + interval '3 months - 1 day')::date
      ELSE (date_trunc('month', p_period_date) + interval '1 month - 1 day')::date
    END AS period_end
),
snap_bounds AS (
  SELECT
    (SELECT min(d) FROM (
      SELECT DISTINCT rs.snapshot_date AS d
      FROM public.roadmap_snapshot rs
      INNER JOIN bounds b ON rs.snapshot_date BETWEEN b.period_start AND b.period_end
    ) s) AS start_dt,
    (SELECT max(d) FROM (
      SELECT DISTINCT rs.snapshot_date AS d
      FROM public.roadmap_snapshot rs
      INNER JOIN bounds b ON rs.snapshot_date BETWEEN b.period_start AND b.period_end
    ) s) AS end_dt
),
start_rows AS (
  SELECT DISTINCT ON (rs.aha_key)
    rs.snapshot_date,
    rs.aha_key,
    rs.aha_name,
    rs.aha_primary_goal,
    rs.aha_pod,
    rs.gtm_module,
    rs.gtm_name,
    rs.aha_release,
    rs.aha_status,
    rs.aha_end_date,
    rs.aha_progress
  FROM public.roadmap_snapshot rs
  CROSS JOIN snap_bounds sb
  WHERE sb.start_dt IS NOT NULL
    AND rs.snapshot_date = sb.start_dt
  ORDER BY rs.aha_key, rs.created_at DESC
),
end_rows_latest AS (
  SELECT DISTINCT ON (rs.aha_key)
    rs.snapshot_date,
    rs.aha_key,
    rs.aha_name,
    rs.aha_primary_goal,
    rs.aha_pod,
    rs.gtm_module,
    rs.gtm_name,
    rs.aha_release,
    rs.aha_status,
    rs.aha_end_date,
    rs.aha_progress
  FROM public.roadmap_snapshot rs
  CROSS JOIN bounds b
  WHERE rs.snapshot_date BETWEEN b.period_start AND b.period_end
  ORDER BY rs.aha_key, rs.snapshot_date DESC, rs.created_at DESC
),
keys AS (
  SELECT DISTINCT rs.aha_key
  FROM public.roadmap_snapshot rs
  CROSS JOIN bounds b
  WHERE rs.snapshot_date BETWEEN b.period_start AND b.period_end
)
SELECT
  k.aha_key::text,
  sr.snapshot_date,
  er.snapshot_date,
  (sr.aha_key IS NOT NULL),
  (
    EXISTS (
      SELECT 1
      FROM public.roadmap_snapshot r
      CROSS JOIN snap_bounds sb
      WHERE sb.end_dt IS NOT NULL
        AND r.aha_key = k.aha_key
        AND r.snapshot_date = sb.end_dt
    )
  ),
  sr.aha_name,
  er.aha_name,
  sr.aha_primary_goal,
  er.aha_primary_goal,
  sr.aha_pod,
  er.aha_pod,
  sr.gtm_module,
  er.gtm_module,
  sr.gtm_name,
  er.gtm_name,
  sr.aha_release,
  er.aha_release,
  sr.aha_status,
  er.aha_status,
  sr.aha_end_date,
  er.aha_end_date,
  sr.aha_progress,
  er.aha_progress
FROM keys k
LEFT JOIN start_rows sr ON sr.aha_key = k.aha_key
LEFT JOIN end_rows_latest er ON er.aha_key = k.aha_key
CROSS JOIN snap_bounds sb
WHERE sb.start_dt IS NOT NULL AND sb.end_dt IS NOT NULL
ORDER BY
  COALESCE(sr.aha_primary_goal, er.aha_primary_goal) NULLS LAST,
  COALESCE(sr.aha_pod, er.aha_pod, sr.gtm_module, er.gtm_module) NULLS LAST,
  COALESCE(er.aha_name, sr.aha_name);
$$;

COMMENT ON FUNCTION public.get_period_plan_vs_actual(text, date) IS
  'Plan vs Actual: compares global first snapshot date vs per-aha_key latest snapshot row in period; in_end = epic appears on global last snapshot date.';
