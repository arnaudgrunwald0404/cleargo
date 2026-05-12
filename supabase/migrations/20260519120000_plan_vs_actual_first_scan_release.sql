-- Plan vs Actual: expose each epic's **first** `aha_release` in the same snapshot window used for
-- `end_rows_latest`, so the app can tell "held train since first appearance" vs true mid-period adds.
--
-- PG does not allow changing RETURNS TABLE columns via CREATE OR REPLACE (42P13); drop then create.

DROP FUNCTION IF EXISTS public.get_period_plan_vs_actual(text, date);

CREATE FUNCTION public.get_period_plan_vs_actual(
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
  end_aha_progress integer,
  first_scan_aha_release text
)
LANGUAGE sql
STABLE
SET search_path = public
SET statement_timeout = '120s'
AS $$
WITH cleargo_aha AS (
  SELECT e.aha_id::text AS aha_key
  FROM public.epic e
  WHERE COALESCE(trim(e.aha_fields->'custom_fields'->>'cleargo_candidate'), '') IN ('Yes', 'Yes - UI Framework')
),
params AS (
  SELECT
    lower(trim(p_period_type)) AS mode,
    date_trunc('quarter', p_period_date)::date AS quarter_start,
    (date_trunc('quarter', p_period_date) + interval '3 months - 1 day')::date AS quarter_end,
    date_trunc('month', p_period_date)::date AS month_start,
    (date_trunc('month', p_period_date) + interval '1 month - 1 day')::date AS month_end
),
snap_bounds AS (
  SELECT
    p.mode,
    p.quarter_start,
    p.quarter_end,
    p.month_start,
    p.month_end,
    b.q_min AS start_dt,
    CASE p.mode
      WHEN 'quarter_baseline' THEN b.q_min
      WHEN 'quarterly' THEN b.q_max
      WHEN 'quarter_progress' THEN b.m_max
    END AS end_dt
  FROM params p
  CROSS JOIN LATERAL (
    SELECT
      q.q_min,
      q.q_max,
      CASE
        WHEN p.mode = 'quarter_progress' THEN (
          SELECT max(rs.snapshot_date)
          FROM public.roadmap_snapshot rs
          INNER JOIN cleargo_aha c ON c.aha_key = rs.aha_key
          WHERE rs.snapshot_date BETWEEN p.month_start AND p.month_end
        )
      END AS m_max
    FROM (
      SELECT
        min(rs.snapshot_date) AS q_min,
        max(rs.snapshot_date) AS q_max
      FROM public.roadmap_snapshot rs
      INNER JOIN cleargo_aha c ON c.aha_key = rs.aha_key
      WHERE rs.snapshot_date BETWEEN p.quarter_start AND p.quarter_end
    ) q
  ) b
  WHERE p.mode IN ('quarter_baseline', 'quarterly', 'quarter_progress')
),
present_on_end_dt AS (
  SELECT DISTINCT r.aha_key
  FROM public.roadmap_snapshot r
  INNER JOIN cleargo_aha c ON c.aha_key = r.aha_key
  CROSS JOIN snap_bounds sb
  WHERE sb.end_dt IS NOT NULL
    AND r.snapshot_date = sb.end_dt
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
  INNER JOIN cleargo_aha c ON c.aha_key = rs.aha_key
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
  INNER JOIN cleargo_aha c ON c.aha_key = rs.aha_key
  CROSS JOIN snap_bounds sb
  WHERE
    (sb.mode = 'quarter_baseline' AND rs.snapshot_date = sb.start_dt)
    OR (sb.mode = 'quarterly' AND rs.snapshot_date BETWEEN sb.quarter_start AND sb.quarter_end)
    OR (sb.mode = 'quarter_progress' AND rs.snapshot_date BETWEEN sb.month_start AND sb.month_end)
  ORDER BY rs.aha_key, rs.snapshot_date DESC, rs.created_at DESC
),
first_scan_rows AS (
  SELECT DISTINCT ON (rs.aha_key)
    rs.aha_key,
    rs.aha_release
  FROM public.roadmap_snapshot rs
  INNER JOIN cleargo_aha c ON c.aha_key = rs.aha_key
  CROSS JOIN snap_bounds sb
  WHERE
    (sb.mode = 'quarter_baseline' AND rs.snapshot_date = sb.start_dt)
    OR (sb.mode = 'quarterly' AND rs.snapshot_date BETWEEN sb.quarter_start AND sb.quarter_end)
    OR (sb.mode = 'quarter_progress' AND rs.snapshot_date BETWEEN sb.month_start AND sb.month_end)
  ORDER BY rs.aha_key, rs.snapshot_date ASC, rs.created_at ASC
),
keys AS (
  SELECT DISTINCT rs.aha_key
  FROM public.roadmap_snapshot rs
  INNER JOIN cleargo_aha c ON c.aha_key = rs.aha_key
  CROSS JOIN snap_bounds sb
  WHERE sb.start_dt IS NOT NULL
    AND sb.end_dt IS NOT NULL
    AND sb.start_dt <= sb.end_dt
    AND (
      (sb.mode = 'quarter_baseline' AND rs.snapshot_date = sb.start_dt)
      OR (sb.mode = 'quarterly' AND rs.snapshot_date BETWEEN sb.quarter_start AND sb.quarter_end)
      OR (sb.mode = 'quarter_progress' AND rs.snapshot_date BETWEEN sb.quarter_start AND sb.end_dt)
    )
)
SELECT
  k.aha_key::text,
  sr.snapshot_date,
  er.snapshot_date,
  (sr.aha_key IS NOT NULL),
  (ped.aha_key IS NOT NULL),
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
  er.aha_progress,
  fsr.aha_release
FROM keys k
LEFT JOIN start_rows sr ON sr.aha_key = k.aha_key
LEFT JOIN end_rows_latest er ON er.aha_key = k.aha_key
LEFT JOIN first_scan_rows fsr ON fsr.aha_key = k.aha_key
LEFT JOIN present_on_end_dt ped ON ped.aha_key = k.aha_key
CROSS JOIN snap_bounds sb
WHERE sb.start_dt IS NOT NULL
  AND sb.end_dt IS NOT NULL
  AND sb.start_dt <= sb.end_dt
ORDER BY
  COALESCE(sr.aha_primary_goal, er.aha_primary_goal) NULLS LAST,
  COALESCE(sr.gtm_module, er.gtm_module) NULLS LAST,
  COALESCE(er.aha_name, sr.aha_name);
$$;

COMMENT ON FUNCTION public.get_period_plan_vs_actual(text, date) IS
  'Plan vs Actual: ClearGO candidate epics only. Adds first_scan_aha_release (earliest row in end scan window). statement_timeout 120s.';

GRANT EXECUTE ON FUNCTION public.get_period_plan_vs_actual(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_plan_vs_actual(text, date) TO service_role;
