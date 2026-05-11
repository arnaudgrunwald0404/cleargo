-- Plan vs Actual period reporting: cached AI analysis + RPC for start/end snapshot comparison.

-- -----------------------------------------------------------------------------
-- 1. roadmap_period_analysis
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roadmap_period_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'quarterly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  start_snapshot_date date NOT NULL,
  end_snapshot_date date NOT NULL,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_analysis jsonb,
  ai_model_version text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_roadmap_period_analysis_period
  ON public.roadmap_period_analysis (period_type, period_start DESC);

COMMENT ON TABLE public.roadmap_period_analysis IS 'Cached Plan vs Actual AI narrative + snapshot of compared items per calendar period.';

ALTER TABLE public.roadmap_period_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_period_analysis_select_authenticated" ON public.roadmap_period_analysis;
CREATE POLICY "roadmap_period_analysis_select_authenticated"
  ON public.roadmap_period_analysis FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "roadmap_period_analysis_write_authenticated" ON public.roadmap_period_analysis;
CREATE POLICY "roadmap_period_analysis_write_authenticated"
  ON public.roadmap_period_analysis FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "roadmap_period_analysis_update_authenticated" ON public.roadmap_period_analysis;
CREATE POLICY "roadmap_period_analysis_update_authenticated"
  ON public.roadmap_period_analysis FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. get_period_plan_vs_actual: first + last distinct snapshot in period, full join
-- -----------------------------------------------------------------------------

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
end_rows AS (
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
  WHERE sb.end_dt IS NOT NULL
    AND rs.snapshot_date = sb.end_dt
  ORDER BY rs.aha_key, rs.created_at DESC
),
keys AS (
  SELECT aha_key FROM start_rows
  UNION
  SELECT aha_key FROM end_rows
)
SELECT
  k.aha_key::text,
  sr.snapshot_date,
  er.snapshot_date,
  (sr.aha_key IS NOT NULL),
  (er.aha_key IS NOT NULL),
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
LEFT JOIN end_rows er ON er.aha_key = k.aha_key
CROSS JOIN snap_bounds sb
WHERE sb.start_dt IS NOT NULL AND sb.end_dt IS NOT NULL
ORDER BY
  COALESCE(sr.aha_primary_goal, er.aha_primary_goal) NULLS LAST,
  COALESCE(sr.aha_pod, er.aha_pod, sr.gtm_module, er.gtm_module) NULLS LAST,
  COALESCE(er.aha_name, sr.aha_name);
$$;

COMMENT ON FUNCTION public.get_period_plan_vs_actual(text, date) IS
  'Returns joined roadmap_snapshot rows for the first and last snapshot dates within a calendar month or quarter.';

GRANT EXECUTE ON FUNCTION public.get_period_plan_vs_actual(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_plan_vs_actual(text, date) TO service_role;
