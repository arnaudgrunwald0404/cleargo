-- Per-epic end-date slip metrics for Roadmap Rewind (replaces RRV Supabase view roadmap_delay_history).
-- A "delay event" is when aha_end_date moves later vs the previous weekly snapshot (same aha_key).

CREATE OR REPLACE VIEW public.roadmap_delay_history
WITH (security_invoker = true) AS
WITH bounds AS (
  SELECT
    COALESCE(MAX(rs.snapshot_date), CURRENT_DATE) AS latest_snap,
    date_trunc('year', COALESCE(MAX(rs.snapshot_date), CURRENT_DATE))::date AS ytd_start
  FROM public.roadmap_snapshot rs
),
parsed AS (
  SELECT
    rs.aha_key,
    rs.snapshot_date,
    rs.created_at,
    CASE
      WHEN rs.aha_end_date IS NOT NULL AND btrim(rs.aha_end_date) <> ''
           AND rs.aha_end_date ~ '^\d{4}-\d{2}-\d{2}'
      THEN rs.aha_end_date::date
      ELSE NULL
    END AS end_date
  FROM public.roadmap_snapshot rs
),
paired AS (
  SELECT
    p.aha_key,
    p.snapshot_date,
    p.created_at,
    p.end_date,
    LAG(p.end_date) OVER (PARTITION BY p.aha_key ORDER BY p.snapshot_date) AS prev_end,
    LAG(p.snapshot_date) OVER (PARTITION BY p.aha_key ORDER BY p.snapshot_date) AS prev_snapshot_date
  FROM parsed p
),
events AS (
  SELECT
    e.aha_key,
    e.snapshot_date AS ev_snapshot_date,
    CASE
      WHEN e.end_date IS NOT NULL AND e.prev_end IS NOT NULL AND e.end_date > e.prev_end
      THEN (e.end_date - e.prev_end)
      ELSE 0
    END AS slip_days,
    CASE
      WHEN e.end_date IS NOT NULL AND e.prev_end IS NOT NULL AND e.end_date > e.prev_end
      THEN 1
      ELSE 0
    END AS is_slip
  FROM paired e
),
latest AS (
  SELECT DISTINCT ON (p.aha_key)
    p.aha_key,
    p.snapshot_date,
    p.created_at,
    p.end_date
  FROM parsed p
  ORDER BY p.aha_key, p.snapshot_date DESC
),
agg AS (
  SELECT
    ev.aha_key,
    MAX(ev.ev_snapshot_date) FILTER (WHERE ev.is_slip = 1) AS last_delay_snapshot,
    SUM(ev.slip_days) FILTER (WHERE ev.is_slip = 1) AS total_delay_days,
    SUM(ev.is_slip)::bigint AS total_delay_events
  FROM events ev
  GROUP BY ev.aha_key
),
agg_ytd AS (
  SELECT
    ev.aha_key,
    SUM(ev.slip_days) FILTER (
      WHERE ev.is_slip = 1 AND ev.ev_snapshot_date >= (SELECT ytd_start FROM bounds)
    ) AS ytd_delay_days,
    SUM(ev.is_slip) FILTER (
      WHERE ev.is_slip = 1 AND ev.ev_snapshot_date >= (SELECT ytd_start FROM bounds)
    ) AS ytd_delay_events
  FROM events ev
  GROUP BY ev.aha_key
)
SELECT
  l.aha_key,
  CASE WHEN a.last_delay_snapshot IS NOT NULL
    THEN to_char(a.last_delay_snapshot, 'YYYY-MM-DD')
  END AS last_delay_snapshot,
  CASE WHEN l.end_date IS NOT NULL
    THEN to_char(l.end_date, 'YYYY-MM-DD')
  END AS latest_end_date,
  l.created_at::text AS latest_snapshot_at,
  COALESCE(a.total_delay_days, 0)::bigint AS total_delay_days,
  COALESCE(a.total_delay_events, 0)::bigint AS total_delay_events,
  COALESCE(y.ytd_delay_days, 0)::bigint AS ytd_delay_days,
  COALESCE(y.ytd_delay_events, 0)::bigint AS ytd_delay_events
FROM latest l
LEFT JOIN agg a ON a.aha_key = l.aha_key
LEFT JOIN agg_ytd y ON y.aha_key = l.aha_key;

COMMENT ON VIEW public.roadmap_delay_history IS
  'Aggregate end-date slips between consecutive roadmap_snapshot rows per aha_key (ClearGo Roadmap Rewind).';

GRANT SELECT ON public.roadmap_delay_history TO authenticated;
GRANT SELECT ON public.roadmap_delay_history TO service_role;
