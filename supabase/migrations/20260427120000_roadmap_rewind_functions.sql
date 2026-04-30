-- Ported from Roadmap Rewind Visualizer migrations; adapted for ClearGo:
--   roadmap -> roadmap_snapshot, confidence_ratings -> confidence_rating,
--   pm_impact_overrides -> pm_impact_override, created_at::date filters -> snapshot_date
-- Review duplicate DROP/CREATE order if applying on DB with partial history.


-- ==== SOURCE: add_release_delivery_metrics.sql ====
-- Add release delivery metrics function
-- This calculates what percentage of items were delivered on time vs late for a given release

-- Drop existing function if it exists (needed when changing return type)
DROP FUNCTION IF EXISTS get_release_delivery_metrics(text);

CREATE OR REPLACE FUNCTION get_release_delivery_metrics(target_release text DEFAULT NULL)
RETURNS TABLE(
  release_name text,
  release_date date,
  total_planned integer,
  total_delivered integer,
  items_in_progress integer,
  commitment_percentage numeric,
  delivered_on_time integer,
  delivered_one_late integer,
  delivered_two_plus_late integer,
  on_time_percentage numeric,
  one_late_percentage numeric,
  two_plus_late_percentage numeric,
  in_progress_on_time integer,
  in_progress_one_late integer,
  in_progress_two_plus_late integer
) AS $$
DECLARE
  v_target_release text;
  v_release_date date;
BEGIN
  -- If no target release specified, find the most recent past release
  IF target_release IS NULL THEN
    SELECT DISTINCT r.aha_release, r.aha_release_date::date
    INTO v_target_release, v_release_date
    FROM public.roadmap_snapshot r
    WHERE r.aha_release_date IS NOT NULL
      AND r.aha_release_date::date < CURRENT_DATE
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
    ORDER BY r.aha_release_date::date DESC
    LIMIT 1;
  ELSE
    v_target_release := target_release;
    
    -- Get the release date for the target release
    SELECT DISTINCT r.aha_release_date::date
    INTO v_release_date
    FROM public.roadmap_snapshot r
    WHERE r.aha_release = v_target_release
      AND r.aha_release_date IS NOT NULL
    LIMIT 1;
  END IF;

  -- If no valid release found, return empty result
  IF v_target_release IS NULL THEN
    RETURN;
  END IF;

  -- Return the metrics
  RETURN QUERY
  WITH delivered_statuses AS (
    -- Define what statuses count as "delivered"
    SELECT unnest(ARRAY[
      'Feature Complete',
      'Released to Cohort 1',
      'Complete/Done (GA)'
    ]) as status_name
  ),
  
  -- Find the most recent snapshot date for the target release
  most_recent_snapshot_date AS (
    SELECT MAX(r.created_at) as max_date
    FROM public.roadmap_snapshot r
    WHERE r.aha_release = v_target_release
  ),
  
  -- Get items from the most recent snapshot only
  latest_snapshot AS (
    SELECT DISTINCT ON (r.aha_key)
      r.aha_key,
      r.aha_name,
      r.aha_status,
      r.aha_release,
      r.created_at
    FROM public.roadmap_snapshot r
    CROSS JOIN most_recent_snapshot_date mrsd
    WHERE r.created_at = mrsd.max_date
    ORDER BY r.aha_key, r.id DESC
  ),
  
  -- Filter to only items currently in target release (for counting commitment)
  items_in_target_release_recent AS (
    SELECT DISTINCT
      ls.aha_key,
      ls.aha_name,
      ls.aha_status,
      ls.aha_release,
      ls.created_at
    FROM latest_snapshot ls
    WHERE ls.aha_release = v_target_release
      AND ls.aha_key IS NOT NULL
  ),
  
  -- Count delivered and in-progress items from recent snapshot only
  planned_items_summary AS (
    SELECT 
      COUNT(DISTINCT aha_key) as total_planned,
      SUM(CASE 
        WHEN aha_status IN ('Feature Complete', 'Released to Cohort 1', 'Complete/Done (GA)') 
        THEN 1 ELSE 0 
      END) as total_delivered,
      SUM(CASE 
        WHEN aha_status NOT IN ('Feature Complete', 'Released to Cohort 1', 'Complete/Done (GA)') 
        OR aha_status IS NULL
        THEN 1 ELSE 0 
      END) as items_in_progress
    FROM items_in_target_release_recent
  ),
  
  -- Filter to only delivered items from the recent snapshot (same 7 items as commitment)
  delivered_items AS (
    SELECT 
      itr.aha_key,
      itr.aha_name,
      itr.aha_release as current_release,
      itr.created_at as latest_created_at
    FROM items_in_target_release_recent itr
    INNER JOIN delivered_statuses ds ON itr.aha_status = ds.status_name
  ),
  
  -- For each delivered item, get ALL historical releases it was in (from ALL snapshots, not just recent)
  item_release_history AS (
    SELECT DISTINCT ON (r.aha_key, r.aha_release, r.snapshot_date)
      di.aha_key,
      di.current_release,
      r.aha_release as historical_release,
      r.created_at,
      r.snapshot_date as snapshot_date
    FROM delivered_items di
    INNER JOIN public.roadmap_snapshot r ON r.aha_key = di.aha_key  -- This joins to ALL historical snapshots
    WHERE r.aha_release IS NOT NULL
      AND TRIM(r.aha_release) != ''
      AND r.aha_release ~ '^Release \d{4}\.\d+$'  -- Only count properly formatted releases
    ORDER BY r.aha_key, r.aha_release, r.snapshot_date, r.created_at DESC
  ),
  
  -- Get unique snapshots per item with release info
  item_snapshots AS (
    SELECT DISTINCT ON (aha_key, snapshot_date)
      aha_key,
      current_release,
      historical_release,
      snapshot_date,
      created_at
    FROM item_release_history
    ORDER BY aha_key, snapshot_date DESC, created_at DESC
  ),
  
  -- Extract year and release number for comparison
  release_parsed AS (
    SELECT
      aha_key,
      current_release,
      historical_release,
      snapshot_date,
      -- Parse current release (e.g., "Release 2025.10" -> 2025, 10)
      CASE 
        WHEN current_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(current_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(current_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as current_release_num,
      -- Parse historical release
      CASE 
        WHEN historical_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(historical_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(historical_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as historical_release_num
    FROM item_snapshots
  ),
  
  -- Calculate the minimum (earliest) release each item was ever in
  earliest_release_per_item AS (
    SELECT
      aha_key,
      current_release,
      current_release_num,
      MIN(historical_release_num) as earliest_release_num
    FROM release_parsed
    WHERE historical_release_num IS NOT NULL
      AND current_release_num IS NOT NULL
    GROUP BY aha_key, current_release, current_release_num
  ),
  
  -- Calculate delay: difference between current and earliest release
  item_delays AS (
    SELECT
      aha_key,
      current_release,
      current_release_num,
      earliest_release_num,
      (current_release_num - earliest_release_num) as releases_late
    FROM earliest_release_per_item
  ),
  
  -- Categorize by delay
  categorized AS (
    SELECT
      COUNT(*) as total_delivered,
      SUM(CASE WHEN releases_late = 0 THEN 1 ELSE 0 END) as delivered_on_time,
      SUM(CASE WHEN releases_late = 1 THEN 1 ELSE 0 END) as delivered_one_late,
      SUM(CASE WHEN releases_late >= 2 THEN 1 ELSE 0 END) as delivered_two_plus_late
    FROM item_delays
  ),
  
  -- Get release dates for all releases
  release_dates AS (
    SELECT DISTINCT ON (r.aha_release)
      r.aha_release,
      r.aha_release_date::date as release_date
    FROM public.roadmap_snapshot r
    WHERE r.aha_release_date IS NOT NULL
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
    ORDER BY r.aha_release, r.aha_release_date::date
  ),
  
  -- Get all snapshot dates for movement detection (use last 6 months to limit scope)
  snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '6 months'
    ORDER BY snapshot_date
  ),
  
  -- Filter to in-progress items (items in target release that are not delivered)
  in_progress_items AS (
    SELECT 
      itr.aha_key,
      itr.aha_name,
      itr.aha_release as current_release
    FROM items_in_target_release_recent itr
    WHERE itr.aha_status NOT IN ('Feature Complete', 'Released to Cohort 1', 'Complete/Done (GA)')
      OR itr.aha_status IS NULL
  ),
  
  -- Track in-progress items' releases across snapshots to detect movements
  in_progress_snapshot_releases AS (
    SELECT 
      ipi.aha_key,
      sd.snapshot_date,
      rd.aha_release as release_in_snapshot,
      LAG(rd.aha_release) OVER (PARTITION BY ipi.aha_key ORDER BY sd.snapshot_date) as previous_release
    FROM in_progress_items ipi
    CROSS JOIN snapshot_dates sd
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release
      FROM public.roadmap_snapshot r
      WHERE r.aha_key = ipi.aha_key
        AND r.snapshot_date = sd.snapshot_date
        AND r.aha_release IS NOT NULL
        AND TRIM(r.aha_release) != ''
        AND r.aha_release ~ '^Release \d{4}\.\d+$'
      ORDER BY r.aha_key, r.created_at DESC
    ) rd ON true
    WHERE rd.aha_release IS NOT NULL
  ),
  
  -- Find earliest release each in-progress item appeared in (commitment)
  in_progress_earliest_commitment AS (
    SELECT DISTINCT ON (ipsr.aha_key)
      ipsr.aha_key,
      ipsr.release_in_snapshot as earliest_release,
      ipsr.snapshot_date as earliest_snapshot_date
    FROM in_progress_snapshot_releases ipsr
    ORDER BY ipsr.aha_key, ipsr.snapshot_date ASC
  ),
  
  -- Find latest release each in-progress item is currently in
  in_progress_latest_release AS (
    SELECT DISTINCT ON (ipsr.aha_key)
      ipsr.aha_key,
      ipsr.release_in_snapshot as current_release,
      ipsr.snapshot_date as latest_snapshot_date
    FROM in_progress_snapshot_releases ipsr
    ORDER BY ipsr.aha_key, ipsr.snapshot_date DESC
  ),
  
  -- Get commitment releases for in-progress items
  -- Join earliest (commitment) and latest (current) releases
  in_progress_commitment_combined AS (
    SELECT 
      iec.aha_key,
      ilr.current_release,
      iec.earliest_release as commitment_release,
      rd_date.release_date as commitment_release_date
    FROM in_progress_earliest_commitment iec
    INNER JOIN in_progress_latest_release ilr ON ilr.aha_key = iec.aha_key
    INNER JOIN release_dates rd_date ON rd_date.aha_release = iec.earliest_release
    WHERE rd_date.release_date <= CURRENT_DATE
  ),
  
  -- Parse release numbers for in-progress items
  in_progress_release_numbers AS (
    SELECT
      ipcc.aha_key,
      ipcc.current_release,
      ipcc.commitment_release,
      CASE 
        WHEN ipcc.current_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(ipcc.current_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(ipcc.current_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as current_release_num,
      CASE 
        WHEN ipcc.commitment_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(ipcc.commitment_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(ipcc.commitment_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as commitment_release_num
    FROM in_progress_commitment_combined ipcc
  ),
  
  -- Calculate lateness for in-progress items
  -- Compare current_release to commitment_release (earliest_release)
  in_progress_delays AS (
    SELECT
      aha_key,
      current_release,
      commitment_release,
      current_release_num,
      commitment_release_num,
      CASE
        WHEN current_release_num = commitment_release_num THEN 0
        WHEN current_release_num > commitment_release_num THEN
          CASE
            WHEN (current_release_num - commitment_release_num) <= 3 THEN
              LEAST((current_release_num - commitment_release_num), 2)::int
            ELSE
              2
          END
        ELSE 0
      END as releases_late
    FROM in_progress_release_numbers
    WHERE current_release_num IS NOT NULL
      AND commitment_release_num IS NOT NULL
  ),
  
  -- Categorize in-progress items by delay
  in_progress_categorized AS (
    SELECT
      COUNT(*) as total_in_progress,
      SUM(CASE WHEN releases_late = 0 THEN 1 ELSE 0 END) as in_progress_on_time,
      SUM(CASE WHEN releases_late = 1 THEN 1 ELSE 0 END) as in_progress_one_late,
      SUM(CASE WHEN releases_late >= 2 THEN 1 ELSE 0 END) as in_progress_two_plus_late
    FROM in_progress_delays
  )
  
  SELECT
    v_target_release::text as release_name,
    v_release_date as release_date,
    COALESCE(p.total_planned::integer, 0) as total_planned,
    COALESCE(c.total_delivered::integer, 0) as total_delivered,
    COALESCE(p.items_in_progress::integer, 0) as items_in_progress,
    CASE 
      WHEN COALESCE(p.total_planned, 0) > 0 
      THEN ROUND((c.total_delivered::numeric / p.total_planned::numeric) * 100, 1)
      ELSE 0
    END as commitment_percentage,
    COALESCE(c.delivered_on_time::integer, 0) as delivered_on_time,
    COALESCE(c.delivered_one_late::integer, 0) as delivered_one_late,
    COALESCE(c.delivered_two_plus_late::integer, 0) as delivered_two_plus_late,
    CASE 
      WHEN COALESCE(c.total_delivered, 0) > 0 
      THEN ROUND((c.delivered_on_time::numeric / c.total_delivered::numeric) * 100, 1)
      ELSE 0
    END as on_time_percentage,
    CASE 
      WHEN COALESCE(c.total_delivered, 0) > 0 
      THEN ROUND((c.delivered_one_late::numeric / c.total_delivered::numeric) * 100, 1)
      ELSE 0
    END as one_late_percentage,
    CASE 
      WHEN COALESCE(c.total_delivered, 0) > 0 
      THEN ROUND((c.delivered_two_plus_late::numeric / c.total_delivered::numeric) * 100, 1)
      ELSE 0
    END as two_plus_late_percentage,
    COALESCE(ipc.in_progress_on_time, 0)::integer as in_progress_on_time,
    COALESCE(ipc.in_progress_one_late, 0)::integer as in_progress_one_late,
    COALESCE(ipc.in_progress_two_plus_late, 0)::integer as in_progress_two_plus_late
  FROM categorized c
  CROSS JOIN planned_items_summary p
  LEFT JOIN in_progress_categorized ipc ON true;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment
COMMENT ON FUNCTION get_release_delivery_metrics IS 
'Calculates delivery performance metrics for a release, showing percentage of items delivered on time vs 1 or 2+ releases late';


-- Debug function to see what items are being counted
CREATE OR REPLACE FUNCTION debug_release_items(target_release text DEFAULT 'Release 2025.10')
RETURNS TABLE(
  aha_key text,
  aha_name text,
  aha_status text,
  aha_release text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.aha_key,
      r.aha_name,
      r.aha_status,
      r.aha_release,
      r.created_at
    FROM public.roadmap_snapshot r
    ORDER BY r.aha_key, r.created_at DESC, r.id DESC
  )
  SELECT 
    l.aha_key,
    l.aha_name,
    l.aha_status,
    l.aha_release,
    l.created_at
  FROM latest l
  WHERE l.aha_release = target_release
  ORDER BY l.aha_name;
END;
$$ LANGUAGE plpgsql STABLE;


-- ==== SOURCE: add_period_release_delivery_metrics.sql ====
-- Add period-based release delivery metrics function
-- This aggregates delivery metrics across multiple releases in a time period
-- Period options: 'weekly' (latest release), 'quarterly' (current quarter), 'ytd' (year to date)

DROP FUNCTION IF EXISTS get_period_release_delivery_metrics(text);

CREATE OR REPLACE FUNCTION get_period_release_delivery_metrics(period_type text DEFAULT 'quarterly')
RETURNS TABLE(
  period text,
  period_start date,
  period_end date,
  total_releases integer,
  total_planned integer,
  total_delivered integer,
  items_in_progress integer,
  commitment_percentage numeric,
  delivered_on_time integer,
  delivered_one_late integer,
  delivered_two_plus_late integer,
  on_time_percentage numeric,
  one_late_percentage numeric,
  two_plus_late_percentage numeric,
  in_progress_on_time integer,
  in_progress_one_late integer,
  in_progress_two_plus_late integer
) AS $$
DECLARE
  v_period_start date;
  v_period_end date;
BEGIN
  -- For weekly, just return the latest release metrics
  IF period_type = 'weekly' THEN
    v_period_end := CURRENT_DATE;
    RETURN QUERY
    SELECT
      'weekly'::text as period,
      NULL::date as period_start,
      v_period_end as period_end,
      1::integer as total_releases,
      rm.total_planned,
      rm.total_delivered,
      rm.items_in_progress,
      rm.commitment_percentage,
      rm.delivered_on_time,
      rm.delivered_one_late,
      rm.delivered_two_plus_late,
      rm.on_time_percentage,
      rm.one_late_percentage,
      rm.two_plus_late_percentage,
      COALESCE(rm.in_progress_on_time, 0)::integer as in_progress_on_time,
      COALESCE(rm.in_progress_one_late, 0)::integer as in_progress_one_late,
      COALESCE(rm.in_progress_two_plus_late, 0)::integer as in_progress_two_plus_late
    FROM get_release_delivery_metrics(NULL) rm;
    RETURN;
  END IF;
  
  -- For quarterly and ytd, calculate period start and end
  IF period_type = 'quarterly' THEN
    v_period_start := date_trunc('quarter', CURRENT_DATE)::date;
    -- For quarterly, include the entire quarter for in-progress items
    -- End of quarter is start of next quarter
    v_period_end := (date_trunc('quarter', CURRENT_DATE) + INTERVAL '3 months')::date;
  ELSIF period_type = 'ytd' THEN
    v_period_start := date_trunc('year', CURRENT_DATE)::date;
    -- For YTD, include the entire year for in-progress items
    v_period_end := (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year')::date;
  ELSE
    v_period_start := date_trunc('quarter', CURRENT_DATE)::date;
    v_period_end := (date_trunc('quarter', CURRENT_DATE) + INTERVAL '3 months')::date;
  END IF;

  -- Embed the same logic as get_release_delivery_metrics, but aggregate across all releases in period
  RETURN QUERY
  WITH delivered_statuses AS (
    SELECT unnest(ARRAY[
      'Feature Complete',
      'Released to Cohort 1',
      'Complete/Done (GA)'
    ]) as status_name
  ),
  
  -- Find all distinct past releases delivered during the period
  releases_in_period AS (
    SELECT DISTINCT ON (r.aha_release)
      r.aha_release as release_name,
      r.aha_release_date::date as release_date,
      MAX(r.created_at) as max_snapshot_date
    FROM public.roadmap_snapshot r
    WHERE r.aha_release_date IS NOT NULL
      AND r.aha_release_date::date >= v_period_start
      AND r.aha_release_date::date < v_period_end
      AND r.aha_release_date::date < CURRENT_DATE
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
    GROUP BY r.aha_release, r.aha_release_date::date
    ORDER BY r.aha_release, r.aha_release_date::date DESC
  ),
  
  -- Get items from the most recent snapshot for each release
  latest_snapshots AS (
    SELECT DISTINCT ON (r.release_name, rd.aha_key)
      r.release_name,
      rd.aha_key,
      rd.aha_name,
      rd.aha_status
    FROM releases_in_period r
    INNER JOIN public.roadmap_snapshot rd ON rd.created_at = r.max_snapshot_date 
      AND rd.aha_release = r.release_name
    WHERE rd.aha_key IS NOT NULL
    ORDER BY r.release_name, rd.aha_key, rd.id DESC
  ),
  
  -- Count planned items per release
  planned_items AS (
    SELECT 
      release_name,
      COUNT(DISTINCT aha_key) as total_planned,
      SUM(CASE 
        WHEN aha_status IN ('Feature Complete', 'Released to Cohort 1', 'Complete/Done (GA)') 
        THEN 1 ELSE 0 
      END) as total_delivered,
      SUM(CASE 
        WHEN aha_status NOT IN ('Feature Complete', 'Released to Cohort 1', 'Complete/Done (GA)') 
        OR aha_status IS NULL
        THEN 1 ELSE 0 
      END) as items_in_progress
    FROM latest_snapshots
    GROUP BY release_name
  ),
  
  -- Filter to only delivered items
  delivered_items AS (
    SELECT 
      ls.release_name,
      ls.aha_key,
      ls.aha_name
    FROM latest_snapshots ls
    INNER JOIN delivered_statuses ds ON ls.aha_status = ds.status_name
  ),
  
  -- Find all releases in period (including future ones) for in-progress items
  all_releases_in_period AS (
    SELECT DISTINCT ON (r.aha_release)
      r.aha_release as release_name,
      r.aha_release_date::date as release_date,
      MAX(r.created_at) as max_snapshot_date
    FROM public.roadmap_snapshot r
    WHERE r.aha_release_date IS NOT NULL
      AND r.aha_release_date::date >= v_period_start
      AND r.aha_release_date::date < v_period_end
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
    GROUP BY r.aha_release, r.aha_release_date::date
    ORDER BY r.aha_release, r.aha_release_date::date DESC
  ),
  
  -- Get items from the most recent snapshot for all releases (including future)
  all_latest_snapshots AS (
    SELECT DISTINCT ON (r.release_name, rd.aha_key)
      r.release_name,
      rd.aha_key,
      rd.aha_name,
      rd.aha_status
    FROM all_releases_in_period r
    INNER JOIN public.roadmap_snapshot rd ON rd.created_at = r.max_snapshot_date 
      AND rd.aha_release = r.release_name
    WHERE rd.aha_key IS NOT NULL
    ORDER BY r.release_name, rd.aha_key, rd.id DESC
  ),
  
  -- Filter to in-progress items (items in releases within period that are not delivered)
  in_progress_items AS (
    SELECT 
      als.release_name as current_release,
      als.aha_key,
      als.aha_name
    FROM all_latest_snapshots als
    WHERE als.aha_status NOT IN ('Feature Complete', 'Released to Cohort 1', 'Complete/Done (GA)')
      OR als.aha_status IS NULL
  ),
  
  -- Get release dates for all releases
  release_dates AS (
    SELECT DISTINCT ON (r.aha_release)
      r.aha_release,
      r.aha_release_date::date as release_date
    FROM public.roadmap_snapshot r
    WHERE r.aha_release_date IS NOT NULL
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
    ORDER BY r.aha_release, r.aha_release_date::date
  ),
  
  -- Get delivered release dates for comparison
  delivered_release_dates AS (
    SELECT DISTINCT
      di.aha_key,
      di.release_name as delivered_release,
      rd_date.release_date as delivered_release_date
    FROM delivered_items di
    INNER JOIN release_dates rd_date ON rd_date.aha_release = di.release_name
  ),
  
  -- Get all snapshot dates for movement detection
  snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date >= v_period_start
    ORDER BY snapshot_date
  ),
  
  -- For each delivered item, track its release in each snapshot to detect movements
  item_snapshot_releases AS (
    SELECT 
      di.aha_key,
      di.release_name as delivered_release,
      drd.delivered_release_date,
      sd.snapshot_date,
      rd.aha_release as release_in_snapshot,
      LAG(rd.aha_release) OVER (PARTITION BY di.aha_key ORDER BY sd.snapshot_date) as previous_release
    FROM delivered_items di
    INNER JOIN delivered_release_dates drd ON drd.aha_key = di.aha_key
    CROSS JOIN snapshot_dates sd
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release
      FROM public.roadmap_snapshot r
      WHERE r.aha_key = di.aha_key
        AND r.snapshot_date = sd.snapshot_date
        AND r.aha_release IS NOT NULL
        AND TRIM(r.aha_release) != ''
        AND r.aha_release ~ '^Release \d{4}\.\d+$'
      ORDER BY r.aha_key, r.created_at DESC
    ) rd ON true
    WHERE rd.aha_release IS NOT NULL
  ),
  
  -- Detect movements: find if item moved FROM an earlier release TO a later release
  -- This helps identify items that were moved forward (late) vs backward (early)
  -- We need to parse release numbers to compare them
  item_movements_raw AS (
    SELECT 
      isr.aha_key,
      isr.delivered_release,
      isr.previous_release as from_release,
      isr.release_in_snapshot as to_release,
      isr.snapshot_date,
      CASE 
        WHEN isr.previous_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(isr.previous_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(isr.previous_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as from_release_num,
      CASE 
        WHEN isr.release_in_snapshot ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(isr.release_in_snapshot, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(isr.release_in_snapshot, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as to_release_num
    FROM item_snapshot_releases isr
    WHERE isr.previous_release IS NOT NULL
      AND TRIM(isr.previous_release) != TRIM(isr.release_in_snapshot)
  ),
  -- Find the earliest release an item appeared in (this is the commitment)
  -- This will be used to compare against the delivered release
  item_earliest_commitment AS (
    SELECT DISTINCT ON (isr.aha_key)
      isr.aha_key,
      isr.delivered_release,
      isr.release_in_snapshot as earliest_release,
      isr.snapshot_date as earliest_snapshot_date
    FROM item_snapshot_releases isr
    ORDER BY isr.aha_key, isr.snapshot_date ASC
  ),
  
  -- Find any forward movements (from earlier to later release) within 3 releases
  -- This helps identify items that were moved forward (late)
  -- IMPORTANT: Only count movements that happened BEFORE the delivered release's release date
  item_movements AS (
    SELECT DISTINCT ON (imr.aha_key)
      imr.aha_key,
      imr.delivered_release,
      imr.from_release,
      imr.to_release,
      imr.snapshot_date
    FROM item_movements_raw imr
    INNER JOIN delivered_release_dates drd ON drd.aha_key = imr.aha_key
    WHERE imr.from_release_num IS NOT NULL
      AND imr.to_release_num IS NOT NULL
      -- Only count forward movements (to_release > from_release)
      AND imr.to_release_num > imr.from_release_num
      -- Only count movements within 3 releases
      AND (imr.to_release_num - imr.from_release_num) <= 3
      -- Only count movements that happened BEFORE the delivered release's release date
      -- (movements after delivery don't count as "late")
      AND imr.snapshot_date < drd.delivered_release_date
    ORDER BY imr.aha_key, imr.snapshot_date ASC
  ),
  
  -- Get release dates for commitment releases
  -- Use movement_from_release if available (more accurate), otherwise use earliest_release
  item_commitment_combined AS (
    SELECT 
      iec.aha_key,
      iec.delivered_release,
      drd.delivered_release_date,
      COALESCE(im.from_release, iec.earliest_release) as commitment_release,
      iec.earliest_snapshot_date as commitment_snapshot_date,
      rd_date.release_date as commitment_release_date
    FROM item_earliest_commitment iec
    INNER JOIN delivered_release_dates drd ON drd.aha_key = iec.aha_key
    LEFT JOIN item_movements im ON im.aha_key = iec.aha_key
    INNER JOIN release_dates rd_date ON rd_date.aha_release = COALESCE(im.from_release, iec.earliest_release)
    -- Only count if commitment release date is BEFORE or EQUAL TO delivered release date
    -- (can't be committed to a release that comes after delivery)
    WHERE rd_date.release_date <= drd.delivered_release_date
  ),
  
  -- Parse release numbers for comparison
  release_numbers AS (
    SELECT
      icr.aha_key,
      icr.delivered_release,
      icr.commitment_release,
      im.from_release as movement_from_release,
      CASE 
        WHEN icr.delivered_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(icr.delivered_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(icr.delivered_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as delivered_release_num,
      CASE 
        WHEN icr.commitment_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(icr.commitment_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(icr.commitment_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as commitment_release_num,
      CASE 
        WHEN im.from_release IS NOT NULL AND im.from_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(im.from_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(im.from_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as movement_from_release_num
    FROM item_commitment_combined icr
    LEFT JOIN item_movements im ON im.aha_key = icr.aha_key
  ),
  
  -- Calculate lateness: 
  -- - If item was moved within 3 releases of commitment release, count how many releases late
  -- - If moved more than 3 releases, still count as 2+ releases late
  -- - Use movement_from_release if available (more accurate), otherwise use commitment_release
  item_delays AS (
    SELECT
      aha_key,
      delivered_release,
      commitment_release,
      movement_from_release,
      delivered_release_num,
      commitment_release_num,
      movement_from_release_num,
      -- Use movement_from_release if available (item was moved), otherwise use commitment_release
      COALESCE(movement_from_release_num, commitment_release_num) as effective_commitment_num,
      CASE
        -- If delivered in same release as committed/moved-from, it's on time
        WHEN delivered_release_num = COALESCE(movement_from_release_num, commitment_release_num) THEN 0
        -- If delivered later than committed/moved-from, calculate how many releases late
        WHEN delivered_release_num > COALESCE(movement_from_release_num, commitment_release_num) THEN
          -- Check if within 3 releases
          CASE
            WHEN (delivered_release_num - COALESCE(movement_from_release_num, commitment_release_num)) <= 3 THEN
              -- Count actual number of releases late (1, 2, or 3)
              LEAST((delivered_release_num - COALESCE(movement_from_release_num, commitment_release_num)), 2)::int
            ELSE
              -- More than 3 releases late, still count as 2+
              2
          END
        -- If delivered earlier than committed (moved backward), count as on time
        ELSE 0
      END as releases_late
    FROM release_numbers
    WHERE delivered_release_num IS NOT NULL
      AND (commitment_release_num IS NOT NULL OR movement_from_release_num IS NOT NULL)
  ),
  
  -- Categorize by delay for delivered items
  categorized AS (
    SELECT
      COUNT(*) as total_delivered,
      SUM(CASE WHEN releases_late = 0 THEN 1 ELSE 0 END) as delivered_on_time,
      SUM(CASE WHEN releases_late = 1 THEN 1 ELSE 0 END) as delivered_one_late,
      SUM(CASE WHEN releases_late >= 2 THEN 1 ELSE 0 END) as delivered_two_plus_late
    FROM item_delays
  ),
  
  -- Track in-progress items' releases across snapshots to detect movements
  in_progress_snapshot_releases AS (
    SELECT 
      ipi.aha_key,
      sd.snapshot_date,
      rd.aha_release as release_in_snapshot,
      LAG(rd.aha_release) OVER (PARTITION BY ipi.aha_key ORDER BY sd.snapshot_date) as previous_release
    FROM in_progress_items ipi
    CROSS JOIN snapshot_dates sd
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release
      FROM public.roadmap_snapshot r
      WHERE r.aha_key = ipi.aha_key
        AND r.snapshot_date = sd.snapshot_date
        AND r.aha_release IS NOT NULL
        AND TRIM(r.aha_release) != ''
        AND r.aha_release ~ '^Release \d{4}\.\d+$'
      ORDER BY r.aha_key, r.created_at DESC
    ) rd ON true
    WHERE rd.aha_release IS NOT NULL
  ),
  
  -- Find earliest release each in-progress item appeared in (commitment)
  in_progress_earliest_commitment AS (
    SELECT DISTINCT ON (ipsr.aha_key)
      ipsr.aha_key,
      ipsr.release_in_snapshot as earliest_release,
      ipsr.snapshot_date as earliest_snapshot_date
    FROM in_progress_snapshot_releases ipsr
    ORDER BY ipsr.aha_key, ipsr.snapshot_date ASC
  ),
  
  -- Find latest release each in-progress item is currently in
  in_progress_latest_release AS (
    SELECT DISTINCT ON (ipsr.aha_key)
      ipsr.aha_key,
      ipsr.release_in_snapshot as current_release,
      ipsr.snapshot_date as latest_snapshot_date
    FROM in_progress_snapshot_releases ipsr
    ORDER BY ipsr.aha_key, ipsr.snapshot_date DESC
  ),
  
  -- Detect movements for in-progress items
  in_progress_movements_raw AS (
    SELECT 
      ipsr.aha_key,
      ipsr.previous_release as from_release,
      ipsr.release_in_snapshot as to_release,
      ipsr.snapshot_date,
      CASE 
        WHEN ipsr.previous_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(ipsr.previous_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(ipsr.previous_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as from_release_num,
      CASE 
        WHEN ipsr.release_in_snapshot ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(ipsr.release_in_snapshot, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(ipsr.release_in_snapshot, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as to_release_num
    FROM in_progress_snapshot_releases ipsr
    WHERE ipsr.previous_release IS NOT NULL
      AND TRIM(ipsr.previous_release) != TRIM(ipsr.release_in_snapshot)
  ),
  
  -- Find forward movements for in-progress items
  -- Get the EARLIEST from_release across all movements (to find original commitment)
  in_progress_movements AS (
    SELECT DISTINCT ON (ipmr.aha_key)
      ipmr.aha_key,
      ipmr.from_release,
      ipmr.to_release,
      ipmr.snapshot_date,
      ipmr.from_release_num
    FROM in_progress_movements_raw ipmr
    WHERE ipmr.from_release_num IS NOT NULL
      AND ipmr.to_release_num IS NOT NULL
      AND ipmr.to_release_num > ipmr.from_release_num
      AND (ipmr.to_release_num - ipmr.from_release_num) <= 3
    ORDER BY ipmr.aha_key, ipmr.from_release_num ASC, ipmr.snapshot_date ASC
  ),
  
  -- Get commitment releases for in-progress items
  -- Join earliest (commitment) and latest (current) releases
  in_progress_commitment_combined AS (
    SELECT 
      iec.aha_key,
      ilr.current_release,
      iec.earliest_release as commitment_release,
      rd_date.release_date as commitment_release_date
    FROM in_progress_earliest_commitment iec
    INNER JOIN in_progress_latest_release ilr ON ilr.aha_key = iec.aha_key
    INNER JOIN release_dates rd_date ON rd_date.aha_release = iec.earliest_release
    WHERE rd_date.release_date <= CURRENT_DATE
  ),
  
  -- Parse release numbers for in-progress items
  in_progress_release_numbers AS (
    SELECT
      ipcc.aha_key,
      ipcc.current_release,
      ipcc.commitment_release,
      ipm.from_release as movement_from_release,
      CASE 
        WHEN ipcc.current_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(ipcc.current_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(ipcc.current_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as current_release_num,
      CASE 
        WHEN ipcc.commitment_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(ipcc.commitment_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(ipcc.commitment_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as commitment_release_num,
      CASE 
        WHEN ipm.from_release IS NOT NULL AND ipm.from_release ~ '^Release (\d{4})\.(\d+)$' THEN
          (regexp_match(ipm.from_release, '^Release (\d{4})\.(\d+)$'))[1]::int * 100 +
          (regexp_match(ipm.from_release, '^Release (\d{4})\.(\d+)$'))[2]::int
        ELSE NULL
      END as movement_from_release_num
    FROM in_progress_commitment_combined ipcc
    LEFT JOIN in_progress_movements ipm ON ipm.aha_key = ipcc.aha_key
  ),
  
  -- Calculate lateness for in-progress items
  -- Compare current_release to commitment_release (earliest_release)
  in_progress_delays AS (
    SELECT
      aha_key,
      current_release,
      commitment_release,
      current_release_num,
      commitment_release_num,
      CASE
        WHEN current_release_num = commitment_release_num THEN 0
        WHEN current_release_num > commitment_release_num THEN
          CASE
            WHEN (current_release_num - commitment_release_num) <= 3 THEN
              LEAST((current_release_num - commitment_release_num), 2)::int
            ELSE
              2
          END
        ELSE 0
      END as releases_late
    FROM in_progress_release_numbers
    WHERE current_release_num IS NOT NULL
      AND commitment_release_num IS NOT NULL
  ),
  
  -- Categorize in-progress items by delay
  in_progress_categorized AS (
    SELECT
      COUNT(*) as total_in_progress,
      SUM(CASE WHEN releases_late = 0 THEN 1 ELSE 0 END) as in_progress_on_time,
      SUM(CASE WHEN releases_late = 1 THEN 1 ELSE 0 END) as in_progress_one_late,
      SUM(CASE WHEN releases_late >= 2 THEN 1 ELSE 0 END) as in_progress_two_plus_late
    FROM in_progress_delays
  ),
  
  -- Aggregate planned items across all releases
  planned_summary AS (
    SELECT
      COUNT(DISTINCT pi.release_name) as total_releases,
      COALESCE(SUM(pi.total_planned), 0) as total_planned,
      COALESCE(SUM(pi.total_delivered), 0) as total_delivered,
      COALESCE(SUM(pi.items_in_progress), 0) as items_in_progress
    FROM planned_items pi
  ),
  
  -- Aggregate across all releases (combine planned summary with categorized)
  aggregated AS (
    SELECT
      COALESCE(ps.total_releases, 0)::integer as total_releases,
      COALESCE(ps.total_planned, 0)::integer as total_planned,
      COALESCE(ps.total_delivered, 0)::integer as total_delivered,
      COALESCE(ps.items_in_progress, 0)::integer as items_in_progress,
      COALESCE(c.delivered_on_time, 0)::integer as delivered_on_time,
      COALESCE(c.delivered_one_late, 0)::integer as delivered_one_late,
      COALESCE(c.delivered_two_plus_late, 0)::integer as delivered_two_plus_late,
      COALESCE(ipc.in_progress_on_time, 0)::integer as in_progress_on_time,
      COALESCE(ipc.in_progress_one_late, 0)::integer as in_progress_one_late,
      COALESCE(ipc.in_progress_two_plus_late, 0)::integer as in_progress_two_plus_late
    FROM planned_summary ps
    CROSS JOIN categorized c
    CROSS JOIN in_progress_categorized ipc
  )
  
  SELECT
    period_type::text as period,
    v_period_start as period_start,
    v_period_end as period_end,
    COALESCE(a.total_releases, 0)::integer as total_releases,
    COALESCE(a.total_planned, 0)::integer as total_planned,
    COALESCE(a.total_delivered, 0)::integer as total_delivered,
    COALESCE(a.items_in_progress, 0)::integer as items_in_progress,
    CASE 
      WHEN COALESCE(a.total_planned, 0) > 0 
      THEN ROUND((COALESCE(a.total_delivered, 0)::numeric / COALESCE(a.total_planned, 0)::numeric) * 100, 1)
      ELSE 0
    END as commitment_percentage,
    COALESCE(a.delivered_on_time, 0)::integer as delivered_on_time,
    COALESCE(a.delivered_one_late, 0)::integer as delivered_one_late,
    COALESCE(a.delivered_two_plus_late, 0)::integer as delivered_two_plus_late,
    CASE 
      WHEN COALESCE(a.total_delivered, 0) > 0 
      THEN ROUND((COALESCE(a.delivered_on_time, 0)::numeric / COALESCE(a.total_delivered, 0)::numeric) * 100, 1)
      ELSE 0
    END as on_time_percentage,
    CASE 
      WHEN COALESCE(a.total_delivered, 0) > 0 
      THEN ROUND((COALESCE(a.delivered_one_late, 0)::numeric / COALESCE(a.total_delivered, 0)::numeric) * 100, 1)
      ELSE 0
    END as one_late_percentage,
    CASE 
      WHEN COALESCE(a.total_delivered, 0) > 0 
      THEN ROUND((COALESCE(a.delivered_two_plus_late, 0)::numeric / COALESCE(a.total_delivered, 0)::numeric) * 100, 1)
      ELSE 0
    END as two_plus_late_percentage,
    COALESCE(a.in_progress_on_time, 0)::integer as in_progress_on_time,
    COALESCE(a.in_progress_one_late, 0)::integer as in_progress_one_late,
    COALESCE(a.in_progress_two_plus_late, 0)::integer as in_progress_two_plus_late
  FROM aggregated a;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment
COMMENT ON FUNCTION get_period_release_delivery_metrics IS 
'Aggregates delivery performance metrics across multiple releases in a time period (weekly, quarterly, or year-to-date)';

-- ==== SOURCE: add_historical_analysis_support.sql ====
-- Add historical date support to analytics functions
-- This allows viewing the analytics page as it would have appeared on any historical snapshot date

-- =============================================================================
-- 1. get_year_movements_with_impact - Add as_of_date parameter
-- =============================================================================

DROP FUNCTION IF EXISTS get_year_movements_with_impact();
DROP FUNCTION IF EXISTS get_year_movements_with_impact(date);

CREATE OR REPLACE FUNCTION get_year_movements_with_impact(as_of_date date DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  week_end date,
  aha_key text,
  aha_name text,
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
  -- Use provided date or fall back to most recent snapshot
  IF as_of_date IS NULL THEN
    SELECT DISTINCT r.snapshot_date INTO v_latest_date
    FROM public.roadmap_snapshot r
    ORDER BY r.snapshot_date DESC
    LIMIT 1;
  ELSE
    -- Find the actual snapshot date on or before as_of_date
    SELECT DISTINCT r.snapshot_date INTO v_latest_date
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date <= as_of_date
    ORDER BY r.snapshot_date DESC
    LIMIT 1;
  END IF;

  -- Get the start of the year for the effective date
  v_year_start := date_trunc('year', v_latest_date)::date;
  
  -- Get the last snapshot from the previous year (for year boundary comparisons)
  SELECT DISTINCT r.snapshot_date INTO v_last_prev_year_snapshot
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_year_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH 
  -- Get all distinct snapshot dates for the year up to as_of_date
  -- PLUS the last snapshot from the previous year (for LAG to work at year boundary)
  snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE (snapshot_date >= v_year_start AND snapshot_date <= v_latest_date)
       OR snapshot_date = v_last_prev_year_snapshot
    ORDER BY snapshot_date
  ),
  -- For each snapshot, find the previous snapshot
  snapshots_with_prev AS (
    SELECT 
      snapshot_date as current_date,
      LAG(snapshot_date) OVER (ORDER BY snapshot_date) as previous_date
    FROM snapshot_dates
  ),
  -- For each snapshot, determine the next 3 upcoming releases at that point in time
  snapshot_next_releases AS (
    SELECT 
      sd.snapshot_date,
      ARRAY(
        SELECT DISTINCT ON (r.aha_release) r.aha_release
        FROM public.roadmap_snapshot r
        WHERE r.snapshot_date = sd.snapshot_date
          AND r.aha_release_date IS NOT NULL
          AND r.aha_release_date::date >= sd.snapshot_date
          AND r.aha_release != ''
          AND TRIM(r.aha_release) != ''
          AND r.aha_release IS NOT NULL
        ORDER BY r.aha_release, r.aha_release_date::date
      ) as all_future_releases
    FROM snapshot_dates sd
    WHERE sd.snapshot_date >= v_year_start
  ),
  -- Get only the 3 soonest releases by picking the ones with earliest dates
  snapshot_next_three_releases AS (
    SELECT
      snr.snapshot_date,
      ARRAY(
        SELECT subq.release
        FROM (
          SELECT UNNEST(snr.all_future_releases) as release
        ) subq
        INNER JOIN LATERAL (
          SELECT DISTINCT ON (r.aha_release) r.aha_release, r.aha_release_date
          FROM public.roadmap_snapshot r
          WHERE r.snapshot_date = snr.snapshot_date
            AND r.aha_release = subq.release
            AND r.aha_release_date IS NOT NULL
          ORDER BY r.aha_release, r.aha_release_date::date
        ) rel ON true
        ORDER BY rel.aha_release_date::date
        LIMIT 3
      ) as next_three_releases
    FROM snapshot_next_releases snr
  ),
  -- Find release movements between each pair of snapshots with full item details
  movements AS (
    SELECT
      swp.current_date,
      (swp.current_date - (EXTRACT(ISODOW FROM swp.current_date) - 1)::int) as week_start,
      l.aha_key,
      l.aha_name,
      l.aha_csm_priority,
      l.aha_release as current_release,
      l.aha_release_date as current_release_date,
      p.aha_release as previous_release,
      p.aha_release_date as previous_release_date,
      snr.next_three_releases
    FROM snapshots_with_prev swp
    INNER JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_name,
        r.aha_csm_priority,
        r.aha_release,
        r.aha_release_date
      FROM public.roadmap_snapshot r
      WHERE r.snapshot_date = swp.current_date
      ORDER BY r.aha_key, r.created_at DESC
    ) l ON true
    INNER JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release,
        r.aha_release_date
      FROM public.roadmap_snapshot r
      WHERE r.snapshot_date = swp.previous_date
        AND r.aha_key = l.aha_key
      ORDER BY r.aha_key, r.created_at DESC
    ) p ON true
    LEFT JOIN snapshot_next_three_releases snr ON snr.snapshot_date = swp.current_date
    WHERE swp.previous_date IS NOT NULL
      AND swp.current_date >= v_year_start
      AND p.aha_release IS NOT NULL
      AND l.aha_release IS NOT NULL
      AND TRIM(l.aha_release) != TRIM(p.aha_release)
  ),
  -- Deduplicate: if an item moved multiple times in the same week, only keep the latest
  unique_movements AS (
    SELECT DISTINCT ON (m.aha_key, m.week_start)
      m.week_start,
      m.aha_key,
      m.aha_name,
      m.aha_csm_priority,
      m.previous_release,
      m.previous_release_date,
      m.current_release,
      m.current_release_date,
      m.next_three_releases
    FROM movements m
    ORDER BY m.aha_key, m.week_start, m.current_date DESC
  ),
  -- Calculate impact levels
  movements_with_calculated_impact AS (
    SELECT
      um.week_start,
      um.aha_key,
      um.aha_name,
      um.aha_csm_priority,
      um.previous_release,
      um.previous_release_date,
      um.current_release,
      um.current_release_date,
      um.next_three_releases,
      CASE
        WHEN um.aha_csm_priority IS NOT NULL 
          AND um.aha_csm_priority != '' 
          AND TRIM(um.aha_csm_priority) != '' 
        THEN 'high'
        WHEN um.current_release = ANY(um.next_three_releases)
          AND um.previous_release_date IS NOT NULL
          AND um.current_release_date IS NOT NULL
          AND um.current_release_date::date < um.previous_release_date::date
        THEN 'positive'
        WHEN (
          um.current_release = ANY(um.next_three_releases)
          OR um.previous_release = ANY(um.next_three_releases)
          OR (um.previous_release_date IS NOT NULL AND um.previous_release_date::date < um.week_start)
        )
        THEN 'medium'
        ELSE 'low'
      END as calculated_impact
    FROM unique_movements um
  )
  SELECT
    mci.week_start::date,
    (mci.week_start + INTERVAL '6 days')::date as week_end,
    mci.aha_key,
    mci.aha_name,
    mci.aha_csm_priority,
    mci.previous_release as from_release,
    mci.current_release as to_release,
    mci.current_release_date::date as to_release_date,
    COALESCE(pio.override_impact, mci.calculated_impact) as impact_level,
    mci.calculated_impact as calculated_impact_level,
    (pio.id IS NOT NULL) as is_overridden,
    mci.next_three_releases
  FROM movements_with_calculated_impact mci
  LEFT JOIN public.pm_impact_override pio 
    ON pio.aha_key = mci.aha_key 
    AND pio.week_start = mci.week_start::date
  ORDER BY mci.week_start, impact_level;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_year_movements_with_impact IS 
'Returns year movements with impact categorization, supports historical analysis via as_of_date parameter';


-- =============================================================================
-- 2. get_all_year_release_movements - Add as_of_date parameter
-- =============================================================================

DROP FUNCTION IF EXISTS get_all_year_release_movements();
DROP FUNCTION IF EXISTS get_all_year_release_movements(date);

CREATE OR REPLACE FUNCTION get_all_year_release_movements(as_of_date date DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  week_end date,
  movement_count bigint,
  aha_keys text[]
) AS $$
DECLARE
  v_current_year_start date;
  v_latest_snapshot_date date;
  v_last_prev_year_snapshot date;
BEGIN
  -- Use provided date or fall back to most recent snapshot
  IF as_of_date IS NULL THEN
    SELECT MAX(created_at)::date INTO v_latest_snapshot_date
    FROM public.roadmap_snapshot;
  ELSE
    -- Find actual snapshot on or before as_of_date
    SELECT MAX(created_at)::date INTO v_latest_snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date <= as_of_date;
  END IF;

  -- Determine the start of the current year based on the effective snapshot
  v_current_year_start := date_trunc('year', v_latest_snapshot_date)::date;
  
  -- Get the last snapshot from the previous year (for year boundary comparisons)
  SELECT DISTINCT r.snapshot_date INTO v_last_prev_year_snapshot
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_current_year_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH snapshot_dates AS (
    -- Include snapshots from current year AND the last snapshot from previous year
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE (snapshot_date >= v_current_year_start AND snapshot_date <= v_latest_snapshot_date)
       OR snapshot_date = v_last_prev_year_snapshot
    ORDER BY snapshot_date
  ),
  -- For each item in each snapshot, find its most recent previous appearance
  -- NOTE: This looks at ALL previous snapshots, including from previous years
  item_movements AS (
    SELECT
      curr.snapshot_date as current_snapshot_date,
      (curr.snapshot_date - (EXTRACT(ISODOW FROM curr.snapshot_date) - 1)::int) as movement_week_start,
      curr.aha_key as movement_aha_key,
      curr.aha_release as current_release,
      prev.aha_release as previous_release
    FROM public.roadmap_snapshot curr
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release,
        r.created_at
      FROM public.roadmap_snapshot r
      WHERE r.aha_key = curr.aha_key
        AND r.snapshot_date < curr.snapshot_date
      ORDER BY r.aha_key, r.created_at DESC
      LIMIT 1
    ) prev ON true
    WHERE curr.snapshot_date >= v_current_year_start
      AND curr.snapshot_date <= v_latest_snapshot_date
      AND prev.aha_release IS NOT NULL
      AND curr.aha_release IS NOT NULL
      AND TRIM(prev.aha_release) != TRIM(curr.aha_release)
  ),
  -- Deduplicate: if an item moved multiple times in the same week, only count the latest movement
  unique_movements AS (
    SELECT DISTINCT ON (movement_aha_key, movement_week_start)
      movement_week_start,
      movement_aha_key,
      current_release,
      previous_release
    FROM item_movements
    ORDER BY movement_aha_key, movement_week_start, current_snapshot_date DESC
  )
  -- Group by week
  SELECT
    um.movement_week_start::date,
    (um.movement_week_start + INTERVAL '6 days')::date,
    COUNT(DISTINCT um.movement_aha_key)::bigint,
    ARRAY_AGG(DISTINCT um.movement_aha_key ORDER BY um.movement_aha_key)::text[]
  FROM unique_movements um
  GROUP BY um.movement_week_start
  ORDER BY um.movement_week_start;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_all_year_release_movements IS 
'Returns weekly release movement counts for the year, supports historical analysis via as_of_date parameter';


-- =============================================================================
-- 3. get_year_movements_impact_summary - Add as_of_date parameter
-- =============================================================================

DROP FUNCTION IF EXISTS get_year_movements_impact_summary();
DROP FUNCTION IF EXISTS get_year_movements_impact_summary(date);

CREATE OR REPLACE FUNCTION get_year_movements_impact_summary(as_of_date date DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  week_end date,
  high_impact_count bigint,
  high_impact_items text[],
  positive_impact_count bigint,
  positive_impact_items text[],
  medium_impact_count bigint,
  medium_impact_items text[],
  low_impact_count bigint,
  low_impact_items text[]
) AS $$
BEGIN
  RETURN QUERY
  WITH movements AS (
    SELECT * FROM get_year_movements_with_impact(as_of_date)
  )
  SELECT
    m.week_start,
    m.week_end,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'high')::bigint as high_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'high'), ARRAY[]::text[]) as high_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'positive')::bigint as positive_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'positive'), ARRAY[]::text[]) as positive_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'medium')::bigint as medium_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'medium'), ARRAY[]::text[]) as medium_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'low')::bigint as low_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'low'), ARRAY[]::text[]) as low_impact_items
  FROM movements m
  GROUP BY m.week_start, m.week_end
  ORDER BY m.week_start;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_year_movements_impact_summary IS 
'Returns aggregated impact summary for heatmap, supports historical analysis via as_of_date parameter';


-- =============================================================================
-- 4. get_period_release_delivery_metrics - Add as_of_date parameter
-- =============================================================================

DROP FUNCTION IF EXISTS get_period_release_delivery_metrics(text);
DROP FUNCTION IF EXISTS get_period_release_delivery_metrics(text, date);

CREATE OR REPLACE FUNCTION get_period_release_delivery_metrics(
  period_type text DEFAULT 'quarterly',
  as_of_date date DEFAULT NULL
)
RETURNS TABLE(
  period text,
  period_start date,
  period_end date,
  total_releases integer,
  total_planned integer,
  total_delivered integer,
  items_in_progress integer,
  commitment_percentage numeric,
  delivered_on_time integer,
  delivered_one_late integer,
  delivered_two_plus_late integer,
  on_time_percentage numeric,
  one_late_percentage numeric,
  two_plus_late_percentage numeric,
  in_progress_on_time integer,
  in_progress_one_late integer,
  in_progress_two_plus_late integer,
  last_release_name text
) AS $$
DECLARE
  v_period_start date;
  v_period_end date;
  v_effective_date date;
  v_snapshot_date timestamp with time zone;
  v_last_release_name text;
BEGIN
  -- Determine effective date
  IF as_of_date IS NULL THEN
    v_effective_date := CURRENT_DATE;
    -- Get the latest snapshot
    SELECT MAX(created_at) INTO v_snapshot_date FROM public.roadmap_snapshot;
  ELSE
    v_effective_date := as_of_date;
    -- Find snapshot on or before as_of_date
    SELECT MAX(created_at) INTO v_snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date <= as_of_date;
  END IF;

  -- For weekly, find the last completed release before effective date
  IF period_type = 'weekly' THEN
    SELECT r.aha_release INTO v_last_release_name
    FROM public.roadmap_snapshot r
    WHERE r.created_at = v_snapshot_date
      AND r.aha_release IS NOT NULL
      AND r.aha_release_date IS NOT NULL
      AND r.aha_release_date::date < v_effective_date
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
    GROUP BY r.aha_release
    ORDER BY MAX(r.aha_release_date::date) DESC
    LIMIT 1;
    
    v_period_start := NULL;
    v_period_end := v_effective_date;
  ELSIF period_type = 'quarterly' THEN
    v_period_start := date_trunc('quarter', v_effective_date)::date;
    v_period_end := v_effective_date;
  ELSIF period_type = 'ytd' THEN
    v_period_start := date_trunc('year', v_effective_date)::date;
    v_period_end := v_effective_date;
  ELSE
    v_period_start := date_trunc('quarter', v_effective_date)::date;
    v_period_end := v_effective_date;
  END IF;

  RETURN QUERY
  WITH delivered_statuses AS (
    SELECT unnest(ARRAY[
      'Feature Complete',
      'Released to Cohort 1',
      'Complete/Done (GA)'
    ]) as status_name
  ),
  
  -- Get items from the snapshot
  snapshot_items AS (
    SELECT 
      r.aha_key,
      r.aha_release,
      r.aha_release_date::date as release_date,
      r.aha_status,
      CASE WHEN r.aha_status IN (SELECT status_name FROM delivered_statuses) THEN true ELSE false END as is_delivered
    FROM public.roadmap_snapshot r
    WHERE r.created_at = v_snapshot_date
      AND r.aha_release IS NOT NULL
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
  ),
  
  -- Filter items based on period
  period_items AS (
    SELECT * FROM snapshot_items
    WHERE 
      CASE 
        WHEN period_type = 'weekly' THEN aha_release = v_last_release_name
        ELSE release_date >= v_period_start AND release_date < v_period_end
      END
  ),
  
  -- Count releases in period
  releases_in_period AS (
    SELECT COUNT(DISTINCT aha_release) as release_count
    FROM period_items
  ),
  
  -- Calculate metrics
  metrics AS (
    SELECT
      COUNT(DISTINCT aha_key) as total_planned,
      COUNT(DISTINCT aha_key) FILTER (WHERE is_delivered) as total_delivered,
      COUNT(DISTINCT aha_key) FILTER (WHERE NOT is_delivered) as items_in_progress
    FROM period_items
  )
  
  SELECT
    period_type::text,
    v_period_start,
    v_period_end,
    COALESCE(rip.release_count, 0)::integer,
    COALESCE(m.total_planned, 0)::integer,
    COALESCE(m.total_delivered, 0)::integer,
    COALESCE(m.items_in_progress, 0)::integer,
    CASE 
      WHEN COALESCE(m.total_planned, 0) > 0 
      THEN ROUND((COALESCE(m.total_delivered, 0)::numeric / m.total_planned::numeric) * 100, 1)
      ELSE 0
    END,
    -- Simplified: just count delivered as "on time" for historical view
    COALESCE(m.total_delivered, 0)::integer,
    0::integer,
    0::integer,
    100::numeric,
    0::numeric,
    0::numeric,
    COALESCE(m.items_in_progress, 0)::integer,
    0::integer,
    0::integer,
    v_last_release_name
  FROM metrics m
  CROSS JOIN releases_in_period rip;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_period_release_delivery_metrics IS 
'Returns delivery metrics for a period, supports historical analysis via as_of_date parameter';


-- ==== SOURCE: optimize_historical_analysis.sql ====
-- Optimized version of get_year_movements_with_impact
-- Uses simpler joins and avoids expensive LATERAL subqueries

DROP FUNCTION IF EXISTS get_year_movements_with_impact();
DROP FUNCTION IF EXISTS get_year_movements_with_impact(date);

CREATE OR REPLACE FUNCTION get_year_movements_with_impact(as_of_date date DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  week_end date,
  aha_key text,
  aha_name text,
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
  -- Use provided date or fall back to most recent snapshot
  IF as_of_date IS NULL THEN
    SELECT MAX(snapshot_date) INTO v_latest_date FROM public.roadmap_snapshot;
  ELSE
    SELECT MAX(snapshot_date) INTO v_latest_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date <= as_of_date;
  END IF;

  -- Get the start of the year for the effective date
  v_year_start := date_trunc('year', v_latest_date)::date;
  
  -- Get the last snapshot from the previous year (for year boundary comparisons)
  SELECT MAX(snapshot_date) INTO v_last_prev_year_snapshot
  FROM public.roadmap_snapshot
  WHERE snapshot_date < v_year_start;

  RETURN QUERY
  WITH 
  -- Get all distinct snapshot dates we need
  snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE (snapshot_date >= v_year_start AND snapshot_date <= v_latest_date)
       OR snapshot_date = v_last_prev_year_snapshot
  ),
  -- Pre-aggregate items by snapshot (ONE query instead of LATERAL per snapshot)
  snapshot_items AS (
    SELECT 
      r.snapshot_date as snapshot_date,
      r.aha_key,
      r.aha_name,
      r.aha_csm_priority,
      r.aha_release,
      r.aha_release_date
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date IN (SELECT snapshot_date FROM snapshot_dates)
  ),
  -- Get snapshot pairs (current and previous)
  snapshot_pairs AS (
    SELECT 
      sd.snapshot_date as current_date,
      (SELECT MAX(sd2.snapshot_date) 
       FROM snapshot_dates sd2 
       WHERE sd2.snapshot_date < sd.snapshot_date) as previous_date
    FROM snapshot_dates sd
    WHERE sd.snapshot_date >= v_year_start
  ),
  -- Find movements by comparing current vs previous snapshot
  movements AS (
    SELECT
      sp.current_date,
      (sp.current_date - (EXTRACT(ISODOW FROM sp.current_date) - 1)::int)::date as week_start,
      curr.aha_key,
      curr.aha_name,
      curr.aha_csm_priority,
      curr.aha_release as current_release,
      curr.aha_release_date as current_release_date,
      prev.aha_release as previous_release,
      prev.aha_release_date as previous_release_date
    FROM snapshot_pairs sp
    INNER JOIN snapshot_items curr ON curr.snapshot_date = sp.current_date
    INNER JOIN snapshot_items prev ON prev.snapshot_date = sp.previous_date 
      AND prev.aha_key = curr.aha_key
    WHERE sp.previous_date IS NOT NULL
      AND prev.aha_release IS NOT NULL
      AND curr.aha_release IS NOT NULL
      AND TRIM(prev.aha_release) != TRIM(curr.aha_release)
  ),
  -- Deduplicate: if an item moved multiple times in the same week, only keep the latest
  unique_movements AS (
    SELECT DISTINCT ON (m.aha_key, m.week_start)
      m.week_start,
      m.current_date,
      m.aha_key,
      m.aha_name,
      m.aha_csm_priority,
      m.previous_release,
      m.previous_release_date,
      m.current_release,
      m.current_release_date
    FROM movements m
    ORDER BY m.aha_key, m.week_start, m.current_date DESC
  ),
  -- Get next 3 releases for each snapshot date (simplified - just get release dates once)
  release_dates AS (
    SELECT DISTINCT
      r.snapshot_date as snapshot_date,
      r.aha_release,
      MIN(r.aha_release_date::date) as release_date
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date IN (SELECT DISTINCT current_date FROM unique_movements)
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
  -- Calculate impact levels
  movements_with_impact AS (
    SELECT
      um.week_start,
      um.aha_key,
      um.aha_name,
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
        WHEN um.current_release = ANY(COALESCE(nr.next_three, ARRAY[]::text[]))
          AND um.previous_release_date IS NOT NULL
          AND um.current_release_date IS NOT NULL
          AND um.current_release_date::date < um.previous_release_date::date
        THEN 'positive'
        WHEN (
          um.current_release = ANY(COALESCE(nr.next_three, ARRAY[]::text[]))
          OR um.previous_release = ANY(COALESCE(nr.next_three, ARRAY[]::text[]))
          OR (um.previous_release_date IS NOT NULL AND um.previous_release_date::date < um.week_start)
        )
        THEN 'medium'
        ELSE 'low'
      END as calculated_impact
    FROM unique_movements um
    LEFT JOIN next_releases nr ON nr.snapshot_date = um.current_date
  )
  SELECT
    mwi.week_start::date,
    (mwi.week_start + INTERVAL '6 days')::date as week_end,
    mwi.aha_key,
    mwi.aha_name,
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

-- Add indexes to speed up the query if they don't exist
-- Note: Expression indexes on created_at::date would require IMMUTABLE functions
-- Using regular indexes on the timestamp and key columns instead
CREATE INDEX IF NOT EXISTS idx_roadmap_aha_key ON public.roadmap_snapshot (aha_key);
CREATE INDEX IF NOT EXISTS idx_roadmap_created_at ON public.roadmap_snapshot (created_at);
CREATE INDEX IF NOT EXISTS idx_roadmap_key_created ON public.roadmap_snapshot (aha_key, created_at);

COMMENT ON FUNCTION get_year_movements_with_impact IS 
'Returns year movements with impact categorization - OPTIMIZED version with better performance';

-- ==== SOURCE: fix_year_boundary_movements.sql ====
-- Fix year boundary issues in movement tracking functions
-- 
-- The issue: When we're at the start of a new year (e.g., Jan 2026), functions that
-- track release movements only look at snapshots from the current year. This means:
-- 1. get_year_movements_with_impact uses LAG() on snapshot_dates, but if there's only
--    one snapshot in 2026, LAG() returns NULL and no movements are detected.
-- 2. get_all_year_release_movements has the same issue with its item_movements CTE.
--
-- The fix: Include the last snapshot from the previous year in the snapshot list
-- so that LAG() can find it and comparisons work correctly.

-- =============================================================================
-- FIX 1: get_year_movements_with_impact
-- =============================================================================

DROP FUNCTION IF EXISTS get_year_movements_with_impact();

CREATE OR REPLACE FUNCTION get_year_movements_with_impact()
RETURNS TABLE(
  week_start date,
  week_end date,
  aha_key text,
  aha_name text,
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
  -- Get the most recent snapshot date
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  -- Get the start of the current year
  v_year_start := date_trunc('year', v_latest_date)::date;
  
  -- Get the last snapshot from the previous year (for year boundary comparisons)
  SELECT DISTINCT r.snapshot_date INTO v_last_prev_year_snapshot
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_year_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH 
  -- Get all distinct snapshot dates for the year
  -- PLUS the last snapshot from the previous year (for LAG to work at year boundary)
  snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE (snapshot_date >= v_year_start AND snapshot_date <= v_latest_date)
       OR snapshot_date = v_last_prev_year_snapshot
    ORDER BY snapshot_date
  ),
  -- For each snapshot, find the previous snapshot
  snapshots_with_prev AS (
    SELECT 
      snapshot_date as current_date,
      LAG(snapshot_date) OVER (ORDER BY snapshot_date) as previous_date
    FROM snapshot_dates
  ),
  -- For each snapshot, determine the next 3 upcoming releases at that point in time
  snapshot_next_releases AS (
    SELECT 
      sd.snapshot_date,
      ARRAY(
        SELECT DISTINCT ON (r.aha_release) r.aha_release
        FROM public.roadmap_snapshot r
        WHERE r.snapshot_date = sd.snapshot_date
          AND r.aha_release_date IS NOT NULL
          AND r.aha_release_date::date >= sd.snapshot_date
          AND r.aha_release != ''
          AND TRIM(r.aha_release) != ''
          AND r.aha_release IS NOT NULL
        ORDER BY r.aha_release, r.aha_release_date::date
      ) as all_future_releases
    FROM snapshot_dates sd
    WHERE sd.snapshot_date >= v_year_start  -- Only compute for current year snapshots
  ),
  -- Get only the 3 soonest releases by picking the ones with earliest dates
  snapshot_next_three_releases AS (
    SELECT
      snr.snapshot_date,
      ARRAY(
        SELECT subq.release
        FROM (
          SELECT UNNEST(snr.all_future_releases) as release
        ) subq
        INNER JOIN LATERAL (
          SELECT DISTINCT ON (r.aha_release) r.aha_release, r.aha_release_date
          FROM public.roadmap_snapshot r
          WHERE r.snapshot_date = snr.snapshot_date
            AND r.aha_release = subq.release
            AND r.aha_release_date IS NOT NULL
          ORDER BY r.aha_release, r.aha_release_date::date
        ) rel ON true
        ORDER BY rel.aha_release_date::date
        LIMIT 3
      ) as next_three_releases
    FROM snapshot_next_releases snr
  ),
  -- Find release movements between each pair of snapshots with full item details
  movements AS (
    SELECT
      swp.current_date,
      -- Use Monday as week start to match UI
      (swp.current_date - (EXTRACT(ISODOW FROM swp.current_date) - 1)::int) as week_start,
      l.aha_key,
      l.aha_name,
      l.aha_csm_priority,
      l.aha_release as current_release,
      l.aha_release_date as current_release_date,
      p.aha_release as previous_release,
      p.aha_release_date as previous_release_date,
      snr.next_three_releases
    FROM snapshots_with_prev swp
    INNER JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_name,
        r.aha_csm_priority,
        r.aha_release,
        r.aha_release_date
      FROM public.roadmap_snapshot r
      WHERE r.snapshot_date = swp.current_date
      ORDER BY r.aha_key, r.created_at DESC
    ) l ON true
    INNER JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release,
        r.aha_release_date
      FROM public.roadmap_snapshot r
      WHERE r.snapshot_date = swp.previous_date
        AND r.aha_key = l.aha_key
      ORDER BY r.aha_key, r.created_at DESC
    ) p ON true
    LEFT JOIN snapshot_next_three_releases snr ON snr.snapshot_date = swp.current_date
    WHERE swp.previous_date IS NOT NULL
      AND swp.current_date >= v_year_start  -- Only include movements FROM current year snapshots
      AND p.aha_release IS NOT NULL
      AND l.aha_release IS NOT NULL
      AND TRIM(l.aha_release) != TRIM(p.aha_release)  -- Only count actual changes
  ),
  -- Deduplicate: if an item moved multiple times in the same week, only keep the latest
  unique_movements AS (
    SELECT DISTINCT ON (m.aha_key, m.week_start)
      m.week_start,
      m.aha_key,
      m.aha_name,
      m.aha_csm_priority,
      m.previous_release,
      m.previous_release_date,
      m.current_release,
      m.current_release_date,
      m.next_three_releases
    FROM movements m
    ORDER BY m.aha_key, m.week_start, m.current_date DESC
  ),
  -- Calculate impact levels
  movements_with_calculated_impact AS (
    SELECT
      um.week_start,
      um.aha_key,
      um.aha_name,
      um.aha_csm_priority,
      um.previous_release,
      um.previous_release_date,
      um.current_release,
      um.current_release_date,
      um.next_three_releases,
      CASE
        -- High Impact: Has CSM Priority (always highest priority)
        WHEN um.aha_csm_priority IS NOT NULL 
          AND um.aha_csm_priority != '' 
          AND TRIM(um.aha_csm_priority) != '' 
        THEN 'high'
        
        -- Positive Impact: Item accelerated INTO one of the next 3 upcoming releases
        -- (moved from a later date to an earlier date, and TO is in next 3)
        WHEN um.current_release = ANY(um.next_three_releases)
          AND um.previous_release_date IS NOT NULL
          AND um.current_release_date IS NOT NULL
          AND um.current_release_date::date < um.previous_release_date::date
        THEN 'positive'
        
        -- Medium Impact: Item moved involving one of the next 3 upcoming releases
        -- This includes:
        -- 1. Moving TO one of the next 3 (delay into upcoming)
        -- 2. Moving FROM one of the next 3 (delay OUT of upcoming) - IMPORTANT!
        -- 3. Moving between releases in the next 3
        WHEN (
          -- TO is in next 3 upcoming releases
          um.current_release = ANY(um.next_three_releases)
          OR
          -- FROM is in next 3 upcoming releases (moved OUT of imminent release)
          um.previous_release = ANY(um.next_three_releases)
          OR
          -- FROM is in the past (was supposed to ship already)
          (um.previous_release_date IS NOT NULL AND um.previous_release_date::date < um.week_start)
        )
        THEN 'medium'
        
        -- Low Impact: Everything else (far-future to far-future shuffles)
        ELSE 'low'
      END as calculated_impact
    FROM unique_movements um
  )
  -- Apply PM overrides if they exist
  SELECT
    mci.week_start::date,
    (mci.week_start + INTERVAL '6 days')::date as week_end,
    mci.aha_key,
    mci.aha_name,
    mci.aha_csm_priority,
    mci.previous_release as from_release,
    mci.current_release as to_release,
    mci.current_release_date::date as to_release_date,
    COALESCE(pio.override_impact, mci.calculated_impact) as impact_level,
    mci.calculated_impact as calculated_impact_level,
    (pio.id IS NOT NULL) as is_overridden,
    mci.next_three_releases
  FROM movements_with_calculated_impact mci
  LEFT JOIN public.pm_impact_override pio 
    ON pio.aha_key = mci.aha_key 
    AND pio.week_start = mci.week_start::date
  ORDER BY mci.week_start, impact_level;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- FIX 2: get_all_year_release_movements
-- =============================================================================

DROP FUNCTION IF EXISTS get_all_year_release_movements();

CREATE OR REPLACE FUNCTION get_all_year_release_movements()
RETURNS TABLE(
  week_start date,
  week_end date,
  movement_count bigint,
  aha_keys text[]
) AS $$
DECLARE
  v_current_year_start date;
  v_latest_snapshot_date date;
BEGIN
  -- Get the latest snapshot date
  SELECT MAX(created_at)::date INTO v_latest_snapshot_date
  FROM public.roadmap_snapshot;

  -- Determine the start of the current year based on the latest snapshot
  v_current_year_start := date_trunc('year', v_latest_snapshot_date)::date;

  RETURN QUERY
  WITH snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date >= v_current_year_start
    ORDER BY snapshot_date
  ),
  -- For each item in each snapshot, find its most recent previous appearance
  -- IMPORTANT: Look at ALL previous snapshots, not just those in the current year
  item_movements AS (
    SELECT
      curr.snapshot_date as current_snapshot_date,
      -- FIX: Use Monday as week start to match UI (date_trunc defaults to Sunday)
      -- ISODOW: 1=Monday, 2=Tuesday, ..., 7=Sunday
      -- Subtract (ISODOW - 1) to get to Monday
      (curr.snapshot_date - (EXTRACT(ISODOW FROM curr.snapshot_date) - 1)::int) as movement_week_start,
      curr.aha_key as movement_aha_key,
      curr.aha_release as current_release,
      prev.aha_release as previous_release
    FROM public.roadmap_snapshot curr
    -- Find the most recent snapshot BEFORE this one where this item appeared
    -- NOTE: This looks at ALL previous snapshots, including from previous years
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release,
        r.created_at
      FROM public.roadmap_snapshot r
      WHERE r.aha_key = curr.aha_key
        AND r.snapshot_date < curr.snapshot_date
      ORDER BY r.aha_key, r.created_at DESC
      LIMIT 1
    ) prev ON true
    WHERE curr.snapshot_date >= v_current_year_start
      -- Only count movements (not new items)
      AND prev.aha_release IS NOT NULL
      AND curr.aha_release IS NOT NULL
      -- Only count actual changes
      AND TRIM(prev.aha_release) != TRIM(curr.aha_release)
  ),
  -- Deduplicate: if an item moved multiple times in the same week, only count the latest movement
  unique_movements AS (
    SELECT DISTINCT ON (movement_aha_key, movement_week_start)
      movement_week_start,
      movement_aha_key,
      current_release,
      previous_release
    FROM item_movements
    ORDER BY movement_aha_key, movement_week_start, current_snapshot_date DESC
  )
  -- Group by week
  SELECT
    um.movement_week_start::date,
    (um.movement_week_start + INTERVAL '6 days')::date,
    COUNT(DISTINCT um.movement_aha_key)::bigint,
    ARRAY_AGG(DISTINCT um.movement_aha_key ORDER BY um.movement_aha_key)::text[]
  FROM unique_movements um
  GROUP BY um.movement_week_start
  ORDER BY um.movement_week_start;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- Recreate dependent function: get_year_movements_impact_summary
-- =============================================================================

DROP FUNCTION IF EXISTS get_year_movements_impact_summary();

CREATE OR REPLACE FUNCTION get_year_movements_impact_summary()
RETURNS TABLE(
  week_start date,
  week_end date,
  high_impact_count bigint,
  high_impact_items text[],
  positive_impact_count bigint,
  positive_impact_items text[],
  medium_impact_count bigint,
  medium_impact_items text[],
  low_impact_count bigint,
  low_impact_items text[]
) AS $$
BEGIN
  RETURN QUERY
  WITH movements AS (
    SELECT * FROM get_year_movements_with_impact()
  )
  SELECT
    m.week_start,
    m.week_end,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'high')::bigint as high_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'high'), ARRAY[]::text[]) as high_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'positive')::bigint as positive_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'positive'), ARRAY[]::text[]) as positive_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'medium')::bigint as medium_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'medium'), ARRAY[]::text[]) as medium_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'low')::bigint as low_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'low'), ARRAY[]::text[]) as low_impact_items
  FROM movements m
  GROUP BY m.week_start, m.week_end
  ORDER BY m.week_start;
END;
$$ LANGUAGE plpgsql STABLE;


-- ==== SOURCE: add_outside_report_window_movements.sql ====
-- Handle epics that moved to a release outside the Aha report window
--
-- Problem: The roadmap table is sourced from an Aha report that only includes a
-- limited window of releases. When an epic moves from e.g. Release 4 to Release 6,
-- if Release 6 is not in the report, the current snapshot either omits the epic or
-- has it with a null/empty release. The app then never records a "movement" because
-- it requires both from_release and to_release to be non-null.
--
-- Fix: Treat "had a release in previous snapshot, missing or null in current" as
-- a movement with to_release = NULL. The UI displays "(Outside report window)".
-- Impact: high if CSM priority, medium if from_release was in next 3 or past, else low.

-- =============================================================================
-- 1. get_year_movements_with_impact - Include "moved out, destination unknown"
-- =============================================================================

DROP FUNCTION IF EXISTS get_year_movements_with_impact();
DROP FUNCTION IF EXISTS get_year_movements_with_impact(date);

CREATE OR REPLACE FUNCTION get_year_movements_with_impact(as_of_date date DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  week_end date,
  aha_key text,
  aha_name text,
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
  -- Normal movements: both previous and current have non-null, different releases
  movements AS (
    SELECT
      sp.curr_snap_date,
      (sp.curr_snap_date - (EXTRACT(ISODOW FROM sp.curr_snap_date) - 1)::int)::date as week_start,
      curr.aha_key,
      curr.aha_name,
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
  -- Items that left the report window: had release in previous snapshot, in current
  -- either missing or have null/empty release (e.g. moved to a release not in export)
  movements_out_of_window AS (
    SELECT
      sp.curr_snap_date,
      (sp.curr_snap_date - (EXTRACT(ISODOW FROM sp.curr_snap_date) - 1)::int)::date as week_start,
      prev.aha_key,
      prev.aha_name,
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

COMMENT ON FUNCTION get_year_movements_with_impact IS
'Returns year movements with impact. Includes items that moved out of the report window (to_release NULL = outside report window).';

-- =============================================================================
-- 2. get_all_year_release_movements - Count/list "outside report window" items
-- =============================================================================

DROP FUNCTION IF EXISTS get_all_year_release_movements();
DROP FUNCTION IF EXISTS get_all_year_release_movements(date);

CREATE OR REPLACE FUNCTION get_all_year_release_movements(as_of_date date DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  week_end date,
  movement_count bigint,
  aha_keys text[]
) AS $$
DECLARE
  v_current_year_start date;
  v_latest_snapshot_date date;
  v_last_prev_year_snapshot date;
BEGIN
  IF as_of_date IS NULL THEN
    SELECT MAX(created_at)::date INTO v_latest_snapshot_date
    FROM public.roadmap_snapshot;
  ELSE
    SELECT MAX(created_at)::date INTO v_latest_snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date <= as_of_date;
  END IF;

  v_current_year_start := date_trunc('year', v_latest_snapshot_date)::date;

  SELECT MAX(snapshot_date) INTO v_last_prev_year_snapshot
  FROM public.roadmap_snapshot
  WHERE snapshot_date < v_current_year_start;

  RETURN QUERY
  WITH snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE (snapshot_date >= v_current_year_start AND snapshot_date <= v_latest_snapshot_date)
       OR snapshot_date = v_last_prev_year_snapshot
    ORDER BY snapshot_date
  ),
  snapshot_pairs AS (
    SELECT
      sd.snapshot_date as curr_snap_date,
      (SELECT MAX(sd2.snapshot_date) FROM snapshot_dates sd2 WHERE sd2.snapshot_date < sd.snapshot_date) as previous_date
    FROM snapshot_dates sd
    WHERE sd.snapshot_date >= v_current_year_start
      AND sd.snapshot_date <= v_latest_snapshot_date
  ),
  item_movements_known AS (
    SELECT
      curr.snapshot_date as current_snapshot_date,
      (curr.snapshot_date - (EXTRACT(ISODOW FROM curr.snapshot_date) - 1)::int) as movement_week_start,
      curr.aha_key as movement_aha_key,
      curr.aha_release as current_release,
      prev.aha_release as previous_release
    FROM public.roadmap_snapshot curr
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key) r.aha_key, r.aha_release, r.created_at
      FROM public.roadmap_snapshot r
      WHERE r.aha_key = curr.aha_key AND r.snapshot_date < curr.snapshot_date
      ORDER BY r.aha_key, r.created_at DESC
      LIMIT 1
    ) prev ON true
    WHERE curr.snapshot_date >= v_current_year_start
      AND curr.snapshot_date <= v_latest_snapshot_date
      AND prev.aha_release IS NOT NULL
      AND curr.aha_release IS NOT NULL
      AND TRIM(prev.aha_release) != TRIM(curr.aha_release)
  ),
  item_movements_out_of_window AS (
    SELECT
      sp.curr_snap_date as current_snapshot_date,
      (sp.curr_snap_date - (EXTRACT(ISODOW FROM sp.curr_snap_date) - 1)::int) as movement_week_start,
      prev.aha_key as movement_aha_key,
      NULL::text as current_release,
      prev.aha_release as previous_release
    FROM snapshot_pairs sp
    INNER JOIN public.roadmap_snapshot prev ON prev.snapshot_date = sp.previous_date
      AND prev.aha_release IS NOT NULL
      AND TRIM(prev.aha_release) != ''
    LEFT JOIN public.roadmap_snapshot curr ON curr.aha_key = prev.aha_key
      AND curr.snapshot_date = sp.curr_snap_date
    WHERE (curr.aha_key IS NULL
           OR curr.aha_release IS NULL
           OR TRIM(curr.aha_release) = '')
      AND (curr.aha_key IS NULL OR TRIM(COALESCE(curr.aha_release, '')) != TRIM(prev.aha_release))
  ),
  item_movements AS (
    SELECT * FROM item_movements_known
    UNION ALL
    SELECT * FROM item_movements_out_of_window
  ),
  unique_movements AS (
    SELECT DISTINCT ON (movement_aha_key, movement_week_start)
      movement_week_start,
      movement_aha_key,
      current_release,
      previous_release
    FROM item_movements
    ORDER BY movement_aha_key, movement_week_start, (current_release IS NOT NULL) DESC, current_snapshot_date DESC
  )
  SELECT
    um.movement_week_start::date,
    (um.movement_week_start + INTERVAL '6 days')::date,
    COUNT(DISTINCT um.movement_aha_key)::bigint,
    ARRAY_AGG(DISTINCT um.movement_aha_key ORDER BY um.movement_aha_key)::text[]
  FROM unique_movements um
  GROUP BY um.movement_week_start
  ORDER BY um.movement_week_start;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_all_year_release_movements IS
'Returns weekly release movement counts. Includes items that moved out of the report window.';

-- ==== SOURCE: fix_missing_items_in_movements.sql ====
-- Fix get_all_year_release_movements to handle items missing from intermediate snapshots
-- Instead of comparing consecutive snapshots, find the "last known snapshot" for each item

DROP FUNCTION IF EXISTS get_all_year_release_movements();

CREATE OR REPLACE FUNCTION get_all_year_release_movements()
RETURNS TABLE(
  week_start date,
  week_end date,
  movement_count bigint,
  aha_keys text[]
) AS $$
DECLARE
  v_current_year_start date;
  v_latest_snapshot_date date;
BEGIN
  -- Get the latest snapshot date
  SELECT MAX(created_at)::date INTO v_latest_snapshot_date
  FROM public.roadmap_snapshot;

  -- Determine the start of the current year based on the latest snapshot
  v_current_year_start := date_trunc('year', v_latest_snapshot_date)::date;

  RETURN QUERY
  WITH snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date >= v_current_year_start
    ORDER BY snapshot_date
  ),
  -- For each item in each snapshot, find its most recent previous appearance
  item_movements AS (
    SELECT
      curr.snapshot_date as current_snapshot_date,
      -- Use Monday as week start to match UI (date_trunc defaults to Sunday)
      -- ISODOW: 1=Monday, 2=Tuesday, ..., 7=Sunday
      (curr.snapshot_date - (EXTRACT(ISODOW FROM curr.snapshot_date) - 1)::int) as movement_week_start,
      curr.aha_key as movement_aha_key,
      curr.aha_release as current_release,
      prev.aha_release as previous_release
    FROM public.roadmap_snapshot curr
    -- Find the most recent snapshot BEFORE this one where this item appeared
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release,
        r.created_at
      FROM public.roadmap_snapshot r
      WHERE r.aha_key = curr.aha_key
        AND r.snapshot_date < curr.snapshot_date
      ORDER BY r.aha_key, r.created_at DESC
      LIMIT 1
    ) prev ON true
    WHERE curr.snapshot_date >= v_current_year_start
      -- Only count movements (not new items)
      AND prev.aha_release IS NOT NULL
      AND curr.aha_release IS NOT NULL
      -- Only count actual changes
      AND TRIM(prev.aha_release) != TRIM(curr.aha_release)
  ),
  -- Deduplicate: if an item moved multiple times in the same week, only count the latest movement
  unique_movements AS (
    SELECT DISTINCT ON (movement_aha_key, movement_week_start)
      movement_week_start,
      movement_aha_key,
      current_release,
      previous_release
    FROM item_movements
    ORDER BY movement_aha_key, movement_week_start, current_snapshot_date DESC
  )
  -- Group by week
  SELECT
    um.movement_week_start::date,
    (um.movement_week_start + INTERVAL '6 days')::date,
    COUNT(DISTINCT um.movement_aha_key)::bigint,
    ARRAY_AGG(DISTINCT um.movement_aha_key ORDER BY um.movement_aha_key)::text[]
  FROM unique_movements um
  GROUP BY um.movement_week_start
  ORDER BY um.movement_week_start;
END;
$$ LANGUAGE plpgsql STABLE;



-- ==== SOURCE: add_impact_categorized_movements.sql ====
-- Create function to get release movements categorized by impact level
-- High Impact: Items with CSM Priority
-- Positive Impact: Items accelerated INTO one of the next 3 upcoming releases (celebration!)
-- Medium Impact: Items delayed/pushed out from imminent releases to upcoming releases
-- Low Impact: Everything else (far-future to far-future shuffles)

DROP FUNCTION IF EXISTS get_year_movements_with_impact();

CREATE OR REPLACE FUNCTION get_year_movements_with_impact()
RETURNS TABLE(
  week_start date,
  week_end date,
  aha_key text,
  aha_name text,
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
BEGIN
  -- Get the most recent snapshot date
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  -- Get the start of the current year
  v_year_start := date_trunc('year', v_latest_date)::date;

  RETURN QUERY
  WITH 
  -- Get all distinct snapshot dates for the year
  snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date >= v_year_start
      AND snapshot_date <= v_latest_date
    ORDER BY snapshot_date
  ),
  -- For each snapshot, find the previous snapshot
  snapshots_with_prev AS (
    SELECT 
      snapshot_date as current_date,
      LAG(snapshot_date) OVER (ORDER BY snapshot_date) as previous_date
    FROM snapshot_dates
  ),
  -- For each snapshot, determine the next 3 upcoming releases at that point in time
  snapshot_next_releases AS (
    SELECT 
      sd.snapshot_date,
      ARRAY(
        SELECT DISTINCT ON (r.aha_release) r.aha_release
        FROM public.roadmap_snapshot r
        WHERE r.snapshot_date = sd.snapshot_date
          AND r.aha_release_date IS NOT NULL
          AND r.aha_release_date::date >= sd.snapshot_date
          AND r.aha_release != ''
          AND TRIM(r.aha_release) != ''
          AND r.aha_release IS NOT NULL
        ORDER BY r.aha_release, r.aha_release_date::date
      ) as all_future_releases
    FROM snapshot_dates sd
  ),
  -- Get only the 3 soonest releases by picking the ones with earliest dates
  snapshot_next_three_releases AS (
    SELECT
      snr.snapshot_date,
      ARRAY(
        SELECT subq.release
        FROM (
          SELECT UNNEST(snr.all_future_releases) as release
        ) subq
        INNER JOIN LATERAL (
          SELECT DISTINCT ON (r.aha_release) r.aha_release, r.aha_release_date
          FROM public.roadmap_snapshot r
          WHERE r.snapshot_date = snr.snapshot_date
            AND r.aha_release = subq.release
            AND r.aha_release_date IS NOT NULL
          ORDER BY r.aha_release, r.aha_release_date::date
        ) rel ON true
        ORDER BY rel.aha_release_date::date
        LIMIT 3
      ) as next_three_releases
    FROM snapshot_next_releases snr
  ),
  -- Find release movements between each pair of snapshots with full item details
  movements AS (
    SELECT
      swp.current_date,
      -- Use Monday as week start to match UI
      (swp.current_date - (EXTRACT(ISODOW FROM swp.current_date) - 1)::int) as week_start,
      l.aha_key,
      l.aha_name,
      l.aha_csm_priority,
      l.aha_release as current_release,
      l.aha_release_date as current_release_date,
      p.aha_release as previous_release,
      p.aha_release_date as previous_release_date,
      snr.next_three_releases
    FROM snapshots_with_prev swp
    INNER JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_name,
        r.aha_csm_priority,
        r.aha_release,
        r.aha_release_date
      FROM public.roadmap_snapshot r
      WHERE r.snapshot_date = swp.current_date
      ORDER BY r.aha_key, r.created_at DESC
    ) l ON true
    INNER JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release,
        r.aha_release_date
      FROM public.roadmap_snapshot r
      WHERE r.snapshot_date = swp.previous_date
        AND r.aha_key = l.aha_key
      ORDER BY r.aha_key, r.created_at DESC
    ) p ON true
    LEFT JOIN snapshot_next_three_releases snr ON snr.snapshot_date = swp.current_date
    WHERE swp.previous_date IS NOT NULL
      AND p.aha_release IS NOT NULL
      AND l.aha_release IS NOT NULL
      AND TRIM(l.aha_release) != TRIM(p.aha_release)  -- Only count actual changes
  ),
  -- Deduplicate: if an item moved multiple times in the same week, only keep the latest
  unique_movements AS (
    SELECT DISTINCT ON (m.aha_key, m.week_start)
      m.week_start,
      m.aha_key,
      m.aha_name,
      m.aha_csm_priority,
      m.previous_release,
      m.previous_release_date,
      m.current_release,
      m.current_release_date,
      m.next_three_releases
    FROM movements m
    ORDER BY m.aha_key, m.week_start, m.current_date DESC
  ),
  -- Calculate impact levels
  movements_with_calculated_impact AS (
    SELECT
      um.week_start,
      um.aha_key,
      um.aha_name,
      um.aha_csm_priority,
      um.previous_release,
      um.previous_release_date,
      um.current_release,
      um.current_release_date,
      um.next_three_releases,
      CASE
        -- High Impact: Has CSM Priority (always highest priority)
        WHEN um.aha_csm_priority IS NOT NULL 
          AND um.aha_csm_priority != '' 
          AND TRIM(um.aha_csm_priority) != '' 
        THEN 'high'
        
        -- Positive Impact: Item accelerated INTO one of the next 3 upcoming releases
        -- (moved from a later date to an earlier date, and TO is in next 3)
        WHEN um.current_release = ANY(um.next_three_releases)
          AND um.previous_release_date IS NOT NULL
          AND um.current_release_date IS NOT NULL
          AND um.current_release_date::date < um.previous_release_date::date
        THEN 'positive'
        
        -- Medium Impact: Item moved involving one of the next 3 upcoming releases
        -- This includes:
        -- 1. Moving TO one of the next 3 (delay into upcoming)
        -- 2. Moving FROM one of the next 3 (delay OUT of upcoming) - IMPORTANT!
        -- 3. Moving between releases in the next 3
        WHEN (
          -- TO is in next 3 upcoming releases
          um.current_release = ANY(um.next_three_releases)
          OR
          -- FROM is in next 3 upcoming releases (moved OUT of imminent release)
          um.previous_release = ANY(um.next_three_releases)
          OR
          -- FROM is in the past (was supposed to ship already)
          (um.previous_release_date IS NOT NULL AND um.previous_release_date::date < um.week_start)
        )
        THEN 'medium'
        
        -- Low Impact: Everything else (far-future to far-future shuffles)
        ELSE 'low'
      END as calculated_impact
    FROM unique_movements um
  )
  -- Apply PM overrides if they exist
  SELECT
    mci.week_start::date,
    (mci.week_start + INTERVAL '6 days')::date as week_end,
    mci.aha_key,
    mci.aha_name,
    mci.aha_csm_priority,
    mci.previous_release as from_release,
    mci.current_release as to_release,
    mci.current_release_date::date as to_release_date,
    COALESCE(pio.override_impact, mci.calculated_impact) as impact_level,
    mci.calculated_impact as calculated_impact_level,
    (pio.id IS NOT NULL) as is_overridden,
    mci.next_three_releases
  FROM movements_with_calculated_impact mci
  LEFT JOIN public.pm_impact_override pio 
    ON pio.aha_key = mci.aha_key 
    AND pio.week_start = mci.week_start::date
  ORDER BY mci.week_start, impact_level;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create aggregated version for heatmap display
DROP FUNCTION IF EXISTS get_year_movements_impact_summary();

CREATE OR REPLACE FUNCTION get_year_movements_impact_summary()
RETURNS TABLE(
  week_start date,
  week_end date,
  high_impact_count bigint,
  high_impact_items text[],
  positive_impact_count bigint,
  positive_impact_items text[],
  medium_impact_count bigint,
  medium_impact_items text[],
  low_impact_count bigint,
  low_impact_items text[]
) AS $$
BEGIN
  RETURN QUERY
  WITH movements AS (
    SELECT * FROM get_year_movements_with_impact()
  )
  SELECT
    m.week_start,
    m.week_end,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'high')::bigint as high_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'high'), ARRAY[]::text[]) as high_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'positive')::bigint as positive_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'positive'), ARRAY[]::text[]) as positive_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'medium')::bigint as medium_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'medium'), ARRAY[]::text[]) as medium_impact_items,
    COUNT(DISTINCT m.aha_key) FILTER (WHERE m.impact_level = 'low')::bigint as low_impact_count,
    COALESCE(ARRAY_AGG(DISTINCT m.aha_key ORDER BY m.aha_key) FILTER (WHERE m.impact_level = 'low'), ARRAY[]::text[]) as low_impact_items
  FROM movements m
  GROUP BY m.week_start, m.week_end
  ORDER BY m.week_start;
END;
$$ LANGUAGE plpgsql STABLE;

-- Test queries
-- SELECT * FROM get_year_movements_with_impact() LIMIT 10;
-- SELECT * FROM get_year_movements_impact_summary();


-- ==== SOURCE: add_positive_impact_level.sql ====
-- Add 'positive' impact level to pm_impact_override table constraints
-- This migration updates the CHECK constraints to allow the new 'positive' impact level

-- Drop existing constraints
ALTER TABLE public.pm_impact_override 
  DROP CONSTRAINT IF EXISTS pm_impact_override_original_impact_check;

ALTER TABLE public.pm_impact_override 
  DROP CONSTRAINT IF EXISTS pm_impact_override_override_impact_check;

-- Add new constraints with 'positive' included
ALTER TABLE public.pm_impact_override 
  ADD CONSTRAINT pm_impact_override_original_impact_check 
  CHECK (original_impact IN ('high', 'positive', 'medium', 'low'));

ALTER TABLE public.pm_impact_override 
  ADD CONSTRAINT pm_impact_override_override_impact_check 
  CHECK (override_impact IN ('high', 'positive', 'medium', 'low'));

-- Update comments
COMMENT ON COLUMN public.pm_impact_override.original_impact IS 'The original auto-calculated impact level (high/positive/medium/low)';
COMMENT ON COLUMN public.pm_impact_override.override_impact IS 'The PM-specified override impact level (high/positive/medium/low)';


-- ==== SOURCE: update_rpc_release_only.sql ====
-- Drop existing functions first
DROP FUNCTION IF EXISTS get_weekly_roadmap_changes(text[]);
DROP FUNCTION IF EXISTS get_quarter_to_date_roadmap_changes(text[]);
DROP FUNCTION IF EXISTS get_year_to_date_roadmap_changes(text[]);

-- Recreate get_weekly_roadmap_changes to only return release changes
CREATE OR REPLACE FUNCTION get_weekly_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_previous_date date;
BEGIN
  -- Find the two most recent distinct snapshot dates
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  SELECT DISTINCT r.snapshot_date INTO v_previous_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_latest_date
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.aha_key,
      r.created_at,
      r.aha_name,
      r.aha_release,
      r.aha_status,
      r.aha_owner,
      r.aha_pod,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_description,
      r.aha_initial_est,
      r.aha_calculated_devs,
      r.jira_key,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  previous AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.aha_key,
      r.created_at,
      r.aha_name,
      r.aha_release,
      r.aha_status,
      r.aha_owner,
      r.aha_pod,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_description,
      r.aha_initial_est,
      r.aha_calculated_devs,
      r.jira_key,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_previous_date
  )
  SELECT
    l.id::uuid,
    l.aha_key::text,
    l.created_at::timestamptz,
    p.created_at::timestamptz as previous_created_at,
    l.aha_name::text,
    p.aha_name::text as previous_aha_name,
    l.aha_release::text,
    p.aha_release::text as previous_aha_release,
    l.aha_status::text,
    p.aha_status::text as previous_aha_status,
    l.aha_owner::text,
    p.aha_owner::text as previous_aha_owner,
    l.aha_pod::text,
    p.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date,
    p.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date,
    p.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text,
    p.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text,
    p.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text,
    p.aha_description::text as previous_aha_description,
    l.aha_initial_est::text,
    p.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text,
    p.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text,
    p.jira_key::text as previous_jira_key,
    (p.aha_key IS NULL)::boolean as is_new_item,
    (l.aha_release IS DISTINCT FROM p.aha_release)::boolean as release_changed,
    v_latest_date::date as snapshot_week,
    v_previous_date::date as previous_snapshot_week
  FROM latest l
  INNER JOIN previous p ON l.aha_key = p.aha_key  -- Changed to INNER JOIN to exclude new items
  WHERE l.rn = 1
    AND p.aha_release IS NOT NULL  -- Exclude items that were new in the baseline period
    AND l.aha_release IS DISTINCT FROM p.aha_release;  -- Only release changes, no new items
END;
$$ LANGUAGE plpgsql STABLE;

-- Recreate get_quarter_to_date_roadmap_changes to only return release changes
CREATE OR REPLACE FUNCTION get_quarter_to_date_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_quarter_start date;
  v_baseline_date date;
BEGIN
  -- Find the most recent snapshot date
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  -- Calculate quarter start
  v_quarter_start := date_trunc('quarter', v_latest_date)::date;

  -- Find the most recent snapshot before the quarter started
  SELECT DISTINCT r.snapshot_date INTO v_baseline_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_quarter_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.aha_key,
      r.created_at,
      r.aha_name,
      r.aha_release,
      r.aha_status,
      r.aha_owner,
      r.aha_pod,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_description,
      r.aha_initial_est,
      r.aha_calculated_devs,
      r.jira_key,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  baseline AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.aha_key,
      r.created_at,
      r.aha_name,
      r.aha_release,
      r.aha_status,
      r.aha_owner,
      r.aha_pod,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_description,
      r.aha_initial_est,
      r.aha_calculated_devs,
      r.jira_key,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_baseline_date
  )
  SELECT
    l.id::uuid,
    l.aha_key::text,
    l.created_at::timestamptz,
    b.created_at::timestamptz as previous_created_at,
    l.aha_name::text,
    b.aha_name::text as previous_aha_name,
    l.aha_release::text,
    b.aha_release::text as previous_aha_release,
    l.aha_status::text,
    b.aha_status::text as previous_aha_status,
    l.aha_owner::text,
    b.aha_owner::text as previous_aha_owner,
    l.aha_pod::text,
    b.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date,
    b.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date,
    b.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text,
    b.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text,
    b.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text,
    b.aha_description::text as previous_aha_description,
    l.aha_initial_est::text,
    b.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text,
    b.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text,
    b.jira_key::text as previous_jira_key,
    (b.aha_key IS NULL)::boolean as is_new_item,
    (l.aha_release IS DISTINCT FROM b.aha_release)::boolean as release_changed,
    v_latest_date::date as snapshot_week,
    v_baseline_date::date as previous_snapshot_week
  FROM latest l
  LEFT JOIN baseline b ON l.aha_key = b.aha_key
  WHERE l.rn = 1
    AND (
      b.aha_key IS NULL  -- new items
      OR l.aha_release IS DISTINCT FROM b.aha_release  -- release changed
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Recreate get_year_to_date_roadmap_changes to only return release changes
CREATE OR REPLACE FUNCTION get_year_to_date_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_year_start date;
  v_baseline_date date;
BEGIN
  -- Find the most recent snapshot date
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  -- Calculate year start
  v_year_start := date_trunc('year', v_latest_date)::date;

  -- Find the most recent snapshot before the year started
  SELECT DISTINCT r.snapshot_date INTO v_baseline_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_year_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.aha_key,
      r.created_at,
      r.aha_name,
      r.aha_release,
      r.aha_status,
      r.aha_owner,
      r.aha_pod,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_description,
      r.aha_initial_est,
      r.aha_calculated_devs,
      r.jira_key,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  baseline AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.aha_key,
      r.created_at,
      r.aha_name,
      r.aha_release,
      r.aha_status,
      r.aha_owner,
      r.aha_pod,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_description,
      r.aha_initial_est,
      r.aha_calculated_devs,
      r.jira_key,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_baseline_date
  )
  SELECT
    l.id::uuid,
    l.aha_key::text,
    l.created_at::timestamptz,
    b.created_at::timestamptz as previous_created_at,
    l.aha_name::text,
    b.aha_name::text as previous_aha_name,
    l.aha_release::text,
    b.aha_release::text as previous_aha_release,
    l.aha_status::text,
    b.aha_status::text as previous_aha_status,
    l.aha_owner::text,
    b.aha_owner::text as previous_aha_owner,
    l.aha_pod::text,
    b.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date,
    b.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date,
    b.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text,
    b.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text,
    b.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text,
    b.aha_description::text as previous_aha_description,
    l.aha_initial_est::text,
    b.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text,
    b.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text,
    b.jira_key::text as previous_jira_key,
    (b.aha_key IS NULL)::boolean as is_new_item,
    (l.aha_release IS DISTINCT FROM b.aha_release)::boolean as release_changed,
    v_latest_date::date as snapshot_week,
    v_baseline_date::date as previous_snapshot_week
  FROM latest l
  LEFT JOIN baseline b ON l.aha_key = b.aha_key
  WHERE l.rn = 1
    AND (
      b.aha_key IS NULL  -- new items
      OR l.aha_release IS DISTINCT FROM b.aha_release  -- release changed
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ==== SOURCE: add_aha_progress_to_rpc.sql ====
-- Add aha_progress to all roadmap comparison RPC functions
-- This updates the functions to include the aha_progress field

-- Drop existing functions
DROP FUNCTION IF EXISTS get_weekly_roadmap_changes(text[]);
DROP FUNCTION IF EXISTS get_quarter_to_date_roadmap_changes(text[]);
DROP FUNCTION IF EXISTS get_year_to_date_roadmap_changes(text[]);

-- Weekly: Compare latest snapshot to previous week's snapshot
CREATE OR REPLACE FUNCTION get_weekly_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  aha_progress integer,
  previous_aha_progress integer,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_previous_date date;
BEGIN
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  SELECT DISTINCT r.snapshot_date INTO v_previous_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_latest_date
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, r.aha_progress, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  previous AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, r.aha_progress, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_previous_date
  )
  SELECT
    l.id::uuid, l.aha_key::text, l.created_at::timestamptz, p.created_at::timestamptz as previous_created_at,
    l.aha_name::text, p.aha_name::text as previous_aha_name,
    l.aha_release::text, p.aha_release::text as previous_aha_release,
    l.aha_status::text, p.aha_status::text as previous_aha_status,
    l.aha_owner::text, p.aha_owner::text as previous_aha_owner,
    l.aha_pod::text, p.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date, p.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date, p.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text, p.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text, p.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text, p.aha_description::text as previous_aha_description,
    l.aha_initial_est::text, p.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text, p.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text, p.jira_key::text as previous_jira_key,
    l.aha_progress::integer, p.aha_progress::integer as previous_aha_progress,
    false::boolean as is_new_item,  -- Always false since we exclude new items
    true::boolean as release_changed,  -- Always true since we filter for release changes only
    v_latest_date::date as snapshot_week,
    v_previous_date::date as previous_snapshot_week
  FROM latest l
  INNER JOIN previous p ON l.aha_key = p.aha_key
  WHERE l.rn = 1
    AND p.aha_release IS NOT NULL
    AND l.aha_release IS NOT NULL
    AND l.aha_release IS DISTINCT FROM p.aha_release;
END;
$$ LANGUAGE plpgsql STABLE;

-- Quarterly: Compare latest snapshot to beginning of quarter
CREATE OR REPLACE FUNCTION get_quarter_to_date_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  aha_progress integer,
  previous_aha_progress integer,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_quarter_start date;
  v_baseline_date date;
BEGIN
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  v_quarter_start := date_trunc('quarter', v_latest_date)::date;

  SELECT DISTINCT r.snapshot_date INTO v_baseline_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_quarter_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, r.aha_progress, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  baseline AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, r.aha_progress, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_baseline_date
  )
  SELECT
    l.id::uuid, l.aha_key::text, l.created_at::timestamptz, b.created_at::timestamptz as previous_created_at,
    l.aha_name::text, b.aha_name::text as previous_aha_name,
    l.aha_release::text, b.aha_release::text as previous_aha_release,
    l.aha_status::text, b.aha_status::text as previous_aha_status,
    l.aha_owner::text, b.aha_owner::text as previous_aha_owner,
    l.aha_pod::text, b.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date, b.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date, b.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text, b.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text, b.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text, b.aha_description::text as previous_aha_description,
    l.aha_initial_est::text, b.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text, b.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text, b.jira_key::text as previous_jira_key,
    l.aha_progress::integer, b.aha_progress::integer as previous_aha_progress,
    false::boolean as is_new_item,  -- Always false since we exclude new items
    true::boolean as release_changed,  -- Always true since we filter for release changes only
    v_latest_date::date as snapshot_week,
    v_baseline_date::date as previous_snapshot_week
  FROM latest l
  INNER JOIN baseline b ON l.aha_key = b.aha_key
  WHERE l.rn = 1
    AND b.aha_release IS NOT NULL
    AND l.aha_release IS NOT NULL
    AND l.aha_release IS DISTINCT FROM b.aha_release;
END;
$$ LANGUAGE plpgsql STABLE;

-- Yearly: Compare latest snapshot to beginning of year
CREATE OR REPLACE FUNCTION get_year_to_date_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  aha_progress integer,
  previous_aha_progress integer,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_year_start date;
  v_baseline_date date;
BEGIN
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  v_year_start := date_trunc('year', v_latest_date)::date;

  -- Try to find snapshot before year started
  SELECT DISTINCT r.snapshot_date INTO v_baseline_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_year_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;
  
  -- If no snapshot before year start, use first snapshot of current year
  IF v_baseline_date IS NULL THEN
    SELECT DISTINCT r.snapshot_date INTO v_baseline_date
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date >= v_year_start
    ORDER BY r.snapshot_date ASC
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, r.aha_progress, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  baseline AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, r.aha_progress, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_baseline_date
  )
  SELECT
    l.id::uuid, l.aha_key::text, l.created_at::timestamptz, b.created_at::timestamptz as previous_created_at,
    l.aha_name::text, b.aha_name::text as previous_aha_name,
    l.aha_release::text, b.aha_release::text as previous_aha_release,
    l.aha_status::text, b.aha_status::text as previous_aha_status,
    l.aha_owner::text, b.aha_owner::text as previous_aha_owner,
    l.aha_pod::text, b.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date, b.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date, b.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text, b.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text, b.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text, b.aha_description::text as previous_aha_description,
    l.aha_initial_est::text, b.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text, b.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text, b.jira_key::text as previous_jira_key,
    l.aha_progress::integer, b.aha_progress::integer as previous_aha_progress,
    false::boolean as is_new_item,  -- Always false since we exclude new items
    true::boolean as release_changed,  -- Always true since we filter for release changes only
    v_latest_date::date as snapshot_week,
    v_baseline_date::date as previous_snapshot_week
  FROM latest l
  INNER JOIN baseline b ON l.aha_key = b.aha_key
  WHERE l.rn = 1
    AND b.aha_release IS NOT NULL
    AND l.aha_release IS NOT NULL
    AND l.aha_release IS DISTINCT FROM b.aha_release;
END;
$$ LANGUAGE plpgsql STABLE;



-- ==== SOURCE: add_aha_progress_to_main_rpc.sql ====
-- Add aha_progress to get_latest_and_previous_roadmap_versions function
-- This script updates the function to include the new aha_progress field

DROP FUNCTION IF EXISTS get_latest_and_previous_roadmap_versions();

CREATE OR REPLACE FUNCTION get_latest_and_previous_roadmap_versions()
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  rank integer,
  aha_key text,
  aha_name text,
  aha_description text,
  aha_start_date date,
  aha_end_date date,
  aha_status text,
  aha_t_shirt_est text,
  aha_primary_goal text,
  aha_calculated_devs text,
  aha_owner text,
  aha_initial_est text,
  aha_release text,
  aha_release_date date,
  aha_pod text,
  jira_key text,
  aha_csm_priority text,
  aha_progress integer
) AS $$
DECLARE
  v_latest_date date;
  v_previous_date date;
BEGIN
  -- Find the two most recent distinct snapshot dates
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  SELECT DISTINCT r.snapshot_date INTO v_previous_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_latest_date
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.created_at,
      r.aha_key,
      r.aha_name,
      r.aha_description,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_status,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_calculated_devs,
      r.aha_owner,
      r.aha_initial_est,
      r.aha_release,
      r.aha_release_date,
      r.aha_pod,
      r.jira_key,
      r.aha_csm_priority,
      r.aha_progress,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
    ORDER BY r.aha_key, r.created_at DESC
  ),
  previous AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.created_at,
      r.aha_key,
      r.aha_name,
      r.aha_description,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_status,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_calculated_devs,
      r.aha_owner,
      r.aha_initial_est,
      r.aha_release,
      r.aha_release_date,
      r.aha_pod,
      r.jira_key,
      r.aha_csm_priority,
      r.aha_progress,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_previous_date
    ORDER BY r.aha_key, r.created_at DESC
  )
  SELECT
    l.id::uuid,
    l.created_at::timestamptz,
    1::integer as rank,
    l.aha_key::text,
    l.aha_name::text,
    l.aha_description::text,
    l.aha_start_date::date,
    l.aha_end_date::date,
    l.aha_status::text,
    l.aha_t_shirt_est::text,
    l.aha_primary_goal::text,
    l.aha_calculated_devs::text,
    l.aha_owner::text,
    l.aha_initial_est::text,
    l.aha_release::text,
    l.aha_release_date::date,
    l.aha_pod::text,
    l.jira_key::text,
    l.aha_csm_priority::text,
    l.aha_progress::integer
  FROM latest l
  WHERE l.rn = 1
  
  UNION ALL
  
  SELECT
    p.id::uuid,
    p.created_at::timestamptz,
    2::integer as rank,
    p.aha_key::text,
    p.aha_name::text,
    p.aha_description::text,
    p.aha_start_date::date,
    p.aha_end_date::date,
    p.aha_status::text,
    p.aha_t_shirt_est::text,
    p.aha_primary_goal::text,
    p.aha_calculated_devs::text,
    p.aha_owner::text,
    p.aha_initial_est::text,
    p.aha_release::text,
    p.aha_release_date::date,
    p.aha_pod::text,
    p.jira_key::text,
    p.aha_csm_priority::text,
    p.aha_progress::integer
  FROM previous p
  WHERE p.rn = 1
    AND EXISTS (SELECT 1 FROM latest l WHERE l.aha_key = p.aha_key);
END;
$$ LANGUAGE plpgsql STABLE;



-- ==== SOURCE: add_csm_priority_to_rpc.sql ====
-- Add aha_csm_priority to get_latest_and_previous_roadmap_versions function
-- This script updates the function to include the new aha_csm_priority field

DROP FUNCTION IF EXISTS get_latest_and_previous_roadmap_versions();

CREATE OR REPLACE FUNCTION get_latest_and_previous_roadmap_versions()
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  rank integer,
  aha_key text,
  aha_name text,
  aha_description text,
  aha_start_date date,
  aha_end_date date,
  aha_status text,
  aha_t_shirt_est text,
  aha_primary_goal text,
  aha_calculated_devs text,
  aha_owner text,
  aha_initial_est text,
  aha_release text,
  aha_release_date date,
  aha_pod text,
  jira_key text,
  aha_csm_priority text
) AS $$
DECLARE
  v_latest_date date;
  v_previous_date date;
BEGIN
  -- Find the two most recent distinct snapshot dates
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  SELECT DISTINCT r.snapshot_date INTO v_previous_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_latest_date
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.created_at,
      r.aha_key,
      r.aha_name,
      r.aha_description,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_status,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_calculated_devs,
      r.aha_owner,
      r.aha_initial_est,
      r.aha_release,
      r.aha_release_date,
      r.aha_pod,
      r.jira_key,
      r.aha_csm_priority,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
    ORDER BY r.aha_key, r.created_at DESC
  ),
  previous AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id,
      r.created_at,
      r.aha_key,
      r.aha_name,
      r.aha_description,
      r.aha_start_date,
      r.aha_end_date,
      r.aha_status,
      r.aha_t_shirt_est,
      r.aha_primary_goal,
      r.aha_calculated_devs,
      r.aha_owner,
      r.aha_initial_est,
      r.aha_release,
      r.aha_release_date,
      r.aha_pod,
      r.jira_key,
      r.aha_csm_priority,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_previous_date
    ORDER BY r.aha_key, r.created_at DESC
  )
  SELECT
    l.id::uuid,
    l.created_at::timestamptz,
    1::integer as rank,
    l.aha_key::text,
    l.aha_name::text,
    l.aha_description::text,
    l.aha_start_date::date,
    l.aha_end_date::date,
    l.aha_status::text,
    l.aha_t_shirt_est::text,
    l.aha_primary_goal::text,
    l.aha_calculated_devs::text,
    l.aha_owner::text,
    l.aha_initial_est::text,
    l.aha_release::text,
    l.aha_release_date::date,
    l.aha_pod::text,
    l.jira_key::text,
    l.aha_csm_priority::text
  FROM latest l
  WHERE l.rn = 1
  
  UNION ALL
  
  SELECT
    p.id::uuid,
    p.created_at::timestamptz,
    2::integer as rank,
    p.aha_key::text,
    p.aha_name::text,
    p.aha_description::text,
    p.aha_start_date::date,
    p.aha_end_date::date,
    p.aha_status::text,
    p.aha_t_shirt_est::text,
    p.aha_primary_goal::text,
    p.aha_calculated_devs::text,
    p.aha_owner::text,
    p.aha_initial_est::text,
    p.aha_release::text,
    p.aha_release_date::date,
    p.aha_pod::text,
    p.jira_key::text,
    p.aha_csm_priority::text
  FROM previous p
  WHERE p.rn = 1
    AND EXISTS (SELECT 1 FROM latest l WHERE l.aha_key = p.aha_key);
END;
$$ LANGUAGE plpgsql STABLE;



-- ==== SOURCE: add_priority_goals_delivery_metrics.sql ====
-- Function to get delivery metrics for items with CSM priority and/or goals
-- This analyzes how many strategic items (with priority or goals) were delivered
-- in the last release, quarter-to-date, and year-to-date

DROP FUNCTION IF EXISTS get_priority_goals_delivery_metrics(date);

CREATE OR REPLACE FUNCTION get_priority_goals_delivery_metrics(as_of_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  -- Last Release metrics
  last_release_name text,
  last_release_date date,
  last_release_csm_priority_total integer,
  last_release_csm_priority_delivered integer,
  last_release_with_goals_total integer,
  last_release_with_goals_delivered integer,
  last_release_combined_total integer,
  last_release_combined_delivered integer,
  -- Quarter-to-Date metrics
  qtd_csm_priority_total integer,
  qtd_csm_priority_delivered integer,
  qtd_with_goals_total integer,
  qtd_with_goals_delivered integer,
  qtd_combined_total integer,
  qtd_combined_delivered integer,
  -- Year-to-Date metrics  
  ytd_csm_priority_total integer,
  ytd_csm_priority_delivered integer,
  ytd_with_goals_total integer,
  ytd_with_goals_delivered integer,
  ytd_combined_total integer,
  ytd_combined_delivered integer,
  -- Metadata
  quarter_start date,
  year_start date
) AS $$
DECLARE
  v_quarter_start date;
  v_year_start date;
  v_last_release_name text;
  v_last_release_date date;
  v_snapshot_date timestamp with time zone;
BEGIN
  -- Calculate period boundaries
  v_quarter_start := date_trunc('quarter', as_of_date)::date;
  v_year_start := date_trunc('year', as_of_date)::date;

  -- Find the snapshot closest to as_of_date (on or before)
  SELECT MAX(created_at) INTO v_snapshot_date
  FROM public.roadmap_snapshot
  WHERE snapshot_date <= as_of_date;

  -- Find the most recent past release (release date < as_of_date)
  SELECT r.aha_release, MAX(r.aha_release_date::date)
  INTO v_last_release_name, v_last_release_date
  FROM public.roadmap_snapshot r
  WHERE r.aha_release IS NOT NULL
    AND r.aha_release_date IS NOT NULL
    AND r.aha_release_date::date < as_of_date
    AND r.aha_release ~ '^Release \d{4}\.\d+$'
  GROUP BY r.aha_release
  ORDER BY MAX(r.aha_release_date::date) DESC
  LIMIT 1;

  RETURN QUERY
  WITH delivered_statuses AS (
    SELECT unnest(ARRAY[
      'Feature Complete',
      'Released to Cohort 1',
      'Complete/Done (GA)'
    ]) as status_name
  ),
  
  -- Get all items from the snapshot
  snapshot_items AS (
    SELECT 
      r.aha_key,
      r.aha_name,
      r.aha_release,
      r.aha_release_date::date as release_date,
      r.aha_status,
      r.aha_csm_priority,
      r.aha_primary_goal,
      CASE WHEN r.aha_csm_priority IS NOT NULL AND TRIM(r.aha_csm_priority) != '' THEN true ELSE false END as has_priority,
      CASE WHEN r.aha_primary_goal IS NOT NULL AND TRIM(r.aha_primary_goal) != '' THEN true ELSE false END as has_goals,
      CASE WHEN r.aha_status IN (SELECT status_name FROM delivered_statuses) THEN true ELSE false END as is_delivered
    FROM public.roadmap_snapshot r
    WHERE r.created_at = v_snapshot_date
      AND r.aha_release IS NOT NULL
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
  ),
  
  -- Last release items
  last_release_items AS (
    SELECT * FROM snapshot_items
    WHERE aha_release = v_last_release_name
  ),
  
  -- Quarter-to-date items (releases with dates in current quarter that have passed)
  qtd_items AS (
    SELECT * FROM snapshot_items
    WHERE release_date >= v_quarter_start
      AND release_date < as_of_date
  ),
  
  -- Year-to-date items (releases with dates in current year that have passed)  
  ytd_items AS (
    SELECT * FROM snapshot_items
    WHERE release_date >= v_year_start
      AND release_date < as_of_date
  ),
  
  -- Calculate last release metrics
  last_release_metrics AS (
    SELECT
      COUNT(*) FILTER (WHERE has_priority) as csm_priority_total,
      COUNT(*) FILTER (WHERE has_priority AND is_delivered) as csm_priority_delivered,
      COUNT(*) FILTER (WHERE has_goals) as with_goals_total,
      COUNT(*) FILTER (WHERE has_goals AND is_delivered) as with_goals_delivered,
      COUNT(*) FILTER (WHERE has_priority OR has_goals) as combined_total,
      COUNT(*) FILTER (WHERE (has_priority OR has_goals) AND is_delivered) as combined_delivered
    FROM last_release_items
  ),
  
  -- Calculate QTD metrics
  qtd_metrics AS (
    SELECT
      COUNT(DISTINCT aha_key) FILTER (WHERE has_priority) as csm_priority_total,
      COUNT(DISTINCT aha_key) FILTER (WHERE has_priority AND is_delivered) as csm_priority_delivered,
      COUNT(DISTINCT aha_key) FILTER (WHERE has_goals) as with_goals_total,
      COUNT(DISTINCT aha_key) FILTER (WHERE has_goals AND is_delivered) as with_goals_delivered,
      COUNT(DISTINCT aha_key) FILTER (WHERE has_priority OR has_goals) as combined_total,
      COUNT(DISTINCT aha_key) FILTER (WHERE (has_priority OR has_goals) AND is_delivered) as combined_delivered
    FROM qtd_items
  ),
  
  -- Calculate YTD metrics
  ytd_metrics AS (
    SELECT
      COUNT(DISTINCT aha_key) FILTER (WHERE has_priority) as csm_priority_total,
      COUNT(DISTINCT aha_key) FILTER (WHERE has_priority AND is_delivered) as csm_priority_delivered,
      COUNT(DISTINCT aha_key) FILTER (WHERE has_goals) as with_goals_total,
      COUNT(DISTINCT aha_key) FILTER (WHERE has_goals AND is_delivered) as with_goals_delivered,
      COUNT(DISTINCT aha_key) FILTER (WHERE has_priority OR has_goals) as combined_total,
      COUNT(DISTINCT aha_key) FILTER (WHERE (has_priority OR has_goals) AND is_delivered) as combined_delivered
    FROM ytd_items
  )
  
  SELECT
    v_last_release_name,
    v_last_release_date,
    COALESCE(lrm.csm_priority_total, 0)::integer,
    COALESCE(lrm.csm_priority_delivered, 0)::integer,
    COALESCE(lrm.with_goals_total, 0)::integer,
    COALESCE(lrm.with_goals_delivered, 0)::integer,
    COALESCE(lrm.combined_total, 0)::integer,
    COALESCE(lrm.combined_delivered, 0)::integer,
    COALESCE(qm.csm_priority_total, 0)::integer,
    COALESCE(qm.csm_priority_delivered, 0)::integer,
    COALESCE(qm.with_goals_total, 0)::integer,
    COALESCE(qm.with_goals_delivered, 0)::integer,
    COALESCE(qm.combined_total, 0)::integer,
    COALESCE(qm.combined_delivered, 0)::integer,
    COALESCE(ym.csm_priority_total, 0)::integer,
    COALESCE(ym.csm_priority_delivered, 0)::integer,
    COALESCE(ym.with_goals_total, 0)::integer,
    COALESCE(ym.with_goals_delivered, 0)::integer,
    COALESCE(ym.combined_total, 0)::integer,
    COALESCE(ym.combined_delivered, 0)::integer,
    v_quarter_start,
    v_year_start
  FROM last_release_metrics lrm
  CROSS JOIN qtd_metrics qm
  CROSS JOIN ytd_metrics ym;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment
COMMENT ON FUNCTION get_priority_goals_delivery_metrics IS 
'Returns delivery metrics for items with CSM priority and/or goals across last release, quarter-to-date, and year-to-date periods';

-- ==== SOURCE: add_strategic_items_detail.sql ====
-- Function to get detailed strategic items for a specific category and period
-- This returns the actual items so users can see what's in each bucket

DROP FUNCTION IF EXISTS get_strategic_items_detail(text, text, date);

CREATE OR REPLACE FUNCTION get_strategic_items_detail(
  p_category text,  -- 'csm-priority', 'with-goals', or 'combined'
  p_period text,    -- 'last-release', 'quarter', or 'year'
  as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  out_aha_key text,
  out_aha_name text,
  out_aha_status text,
  out_aha_release text,
  out_aha_csm_priority text,
  out_aha_primary_goal text,
  out_is_delivered boolean,
  out_has_priority boolean,
  out_has_goals boolean
) AS $$
DECLARE
  v_quarter_start date;
  v_year_start date;
  v_last_release_name text;
  v_last_release_date date;
  v_snapshot_date timestamp with time zone;
BEGIN
  -- Calculate period boundaries
  v_quarter_start := date_trunc('quarter', as_of_date)::date;
  v_year_start := date_trunc('year', as_of_date)::date;

  -- Find the snapshot closest to as_of_date (on or before)
  SELECT MAX(created_at) INTO v_snapshot_date
  FROM public.roadmap_snapshot
  WHERE snapshot_date <= as_of_date;

  -- Find the most recent past release (release date < as_of_date)
  SELECT r.aha_release, MAX(r.aha_release_date::date)
  INTO v_last_release_name, v_last_release_date
  FROM public.roadmap_snapshot r
  WHERE r.aha_release IS NOT NULL
    AND r.aha_release_date IS NOT NULL
    AND r.aha_release_date::date < as_of_date
    AND r.aha_release ~ '^Release \d{4}\.\d+$'
  GROUP BY r.aha_release
  ORDER BY MAX(r.aha_release_date::date) DESC
  LIMIT 1;

  RETURN QUERY
  WITH delivered_statuses AS (
    SELECT unnest(ARRAY[
      'Feature Complete',
      'Released to Cohort 1',
      'Complete/Done (GA)'
    ]) as status_name
  ),
  
  -- Get all items from the snapshot with calculated flags
  snapshot_items AS (
    SELECT 
      r.aha_key,
      r.aha_name,
      r.aha_status,
      r.aha_release,
      r.aha_release_date::date as release_date,
      r.aha_csm_priority,
      r.aha_primary_goal,
      CASE WHEN r.aha_csm_priority IS NOT NULL AND TRIM(r.aha_csm_priority) != '' THEN true ELSE false END as item_has_priority,
      CASE WHEN r.aha_primary_goal IS NOT NULL AND TRIM(r.aha_primary_goal) != '' THEN true ELSE false END as item_has_goals,
      CASE WHEN r.aha_status IN (SELECT status_name FROM delivered_statuses) THEN true ELSE false END as item_is_delivered
    FROM public.roadmap_snapshot r
    WHERE r.created_at = v_snapshot_date
      AND r.aha_release IS NOT NULL
      AND r.aha_release ~ '^Release \d{4}\.\d+$'
  ),
  
  -- Filter by period
  period_filtered AS (
    SELECT * FROM snapshot_items
    WHERE 
      CASE 
        WHEN p_period = 'last-release' THEN aha_release = v_last_release_name
        WHEN p_period = 'quarter' THEN release_date >= v_quarter_start AND release_date < as_of_date
        WHEN p_period = 'year' THEN release_date >= v_year_start AND release_date < as_of_date
        ELSE false
      END
  ),
  
  -- Filter by category
  category_filtered AS (
    SELECT * FROM period_filtered
    WHERE
      CASE
        WHEN p_category = 'csm-priority' THEN item_has_priority
        WHEN p_category = 'with-goals' THEN item_has_goals
        WHEN p_category = 'combined' THEN item_has_priority OR item_has_goals
        ELSE false
      END
  )
  
  SELECT 
    cf.aha_key as out_aha_key,
    cf.aha_name as out_aha_name,
    cf.aha_status as out_aha_status,
    cf.aha_release as out_aha_release,
    cf.aha_csm_priority as out_aha_csm_priority,
    cf.aha_primary_goal as out_aha_primary_goal,
    cf.item_is_delivered as out_is_delivered,
    cf.item_has_priority as out_has_priority,
    cf.item_has_goals as out_has_goals
  FROM category_filtered cf
  ORDER BY cf.item_is_delivered DESC, cf.aha_release, cf.aha_key;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_strategic_items_detail IS 
'Returns detailed list of strategic items for a given category and period, for drill-down views';


-- ==== SOURCE: fix_release_movements.sql ====
-- IMPORTANT: This will drop and recreate the functions to track ONLY release movements
-- Run this entire file in the Supabase SQL Editor

-- Drop existing functions
DROP FUNCTION IF EXISTS get_weekly_roadmap_changes(text[]);
DROP FUNCTION IF EXISTS get_quarter_to_date_roadmap_changes(text[]);
DROP FUNCTION IF EXISTS get_year_to_date_roadmap_changes(text[]);

-- Weekly: Compare latest snapshot to previous week's snapshot
CREATE OR REPLACE FUNCTION get_weekly_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_previous_date date;
BEGIN
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  SELECT DISTINCT r.snapshot_date INTO v_previous_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_latest_date
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  previous AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_previous_date
  )
  SELECT
    l.id::uuid, l.aha_key::text, l.created_at::timestamptz, p.created_at::timestamptz as previous_created_at,
    l.aha_name::text, p.aha_name::text as previous_aha_name,
    l.aha_release::text, p.aha_release::text as previous_aha_release,
    l.aha_status::text, p.aha_status::text as previous_aha_status,
    l.aha_owner::text, p.aha_owner::text as previous_aha_owner,
    l.aha_pod::text, p.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date, p.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date, p.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text, p.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text, p.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text, p.aha_description::text as previous_aha_description,
    l.aha_initial_est::text, p.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text, p.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text, p.jira_key::text as previous_jira_key,
    false::boolean as is_new_item,  -- Always false since we exclude new items
    true::boolean as release_changed,  -- Always true since we filter for release changes only
    v_latest_date::date as snapshot_week,
    v_previous_date::date as previous_snapshot_week
  FROM latest l
  INNER JOIN previous p ON l.aha_key = p.aha_key
  WHERE l.rn = 1
    AND p.aha_release IS NOT NULL
    AND l.aha_release IS NOT NULL
    AND l.aha_release IS DISTINCT FROM p.aha_release;
END;
$$ LANGUAGE plpgsql STABLE;

-- Quarterly: Compare latest snapshot to beginning of quarter
CREATE OR REPLACE FUNCTION get_quarter_to_date_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_quarter_start date;
  v_baseline_date date;
BEGIN
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  v_quarter_start := date_trunc('quarter', v_latest_date)::date;

  SELECT DISTINCT r.snapshot_date INTO v_baseline_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_quarter_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  baseline AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_baseline_date
  )
  SELECT
    l.id::uuid, l.aha_key::text, l.created_at::timestamptz, b.created_at::timestamptz as previous_created_at,
    l.aha_name::text, b.aha_name::text as previous_aha_name,
    l.aha_release::text, b.aha_release::text as previous_aha_release,
    l.aha_status::text, b.aha_status::text as previous_aha_status,
    l.aha_owner::text, b.aha_owner::text as previous_aha_owner,
    l.aha_pod::text, b.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date, b.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date, b.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text, b.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text, b.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text, b.aha_description::text as previous_aha_description,
    l.aha_initial_est::text, b.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text, b.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text, b.jira_key::text as previous_jira_key,
    false::boolean as is_new_item,  -- Always false since we exclude new items
    true::boolean as release_changed,  -- Always true since we filter for release changes only
    v_latest_date::date as snapshot_week,
    v_baseline_date::date as previous_snapshot_week
  FROM latest l
  INNER JOIN baseline b ON l.aha_key = b.aha_key
  WHERE l.rn = 1
    AND b.aha_release IS NOT NULL
    AND l.aha_release IS NOT NULL
    AND l.aha_release IS DISTINCT FROM b.aha_release;
END;
$$ LANGUAGE plpgsql STABLE;

-- Yearly: Compare latest snapshot to beginning of year
CREATE OR REPLACE FUNCTION get_year_to_date_roadmap_changes(releases text[] DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  aha_key text,
  created_at timestamptz,
  previous_created_at timestamptz,
  aha_name text,
  previous_aha_name text,
  aha_release text,
  previous_aha_release text,
  aha_status text,
  previous_aha_status text,
  aha_owner text,
  previous_aha_owner text,
  aha_pod text,
  previous_aha_pod text,
  aha_start_date date,
  previous_aha_start_date date,
  aha_end_date date,
  previous_aha_end_date date,
  aha_t_shirt_est text,
  previous_aha_t_shirt_est text,
  aha_primary_goal text,
  previous_aha_primary_goal text,
  aha_description text,
  previous_aha_description text,
  aha_initial_est text,
  previous_aha_initial_est text,
  aha_calculated_devs text,
  previous_aha_calculated_devs text,
  jira_key text,
  previous_jira_key text,
  is_new_item boolean,
  release_changed boolean,
  snapshot_week date,
  previous_snapshot_week date
) AS $$
DECLARE
  v_latest_date date;
  v_year_start date;
  v_baseline_date date;
BEGIN
  SELECT DISTINCT r.snapshot_date INTO v_latest_date
  FROM public.roadmap_snapshot r
  ORDER BY r.snapshot_date DESC
  LIMIT 1;

  v_year_start := date_trunc('year', v_latest_date)::date;

  -- Try to find snapshot before year started
  SELECT DISTINCT r.snapshot_date INTO v_baseline_date
  FROM public.roadmap_snapshot r
  WHERE r.snapshot_date < v_year_start
  ORDER BY r.snapshot_date DESC
  LIMIT 1;
  
  -- If no snapshot before year start, use first snapshot of current year
  IF v_baseline_date IS NULL THEN
    SELECT DISTINCT r.snapshot_date INTO v_baseline_date
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date >= v_year_start
    ORDER BY r.snapshot_date ASC
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
  ),
  baseline AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.aha_key, r.created_at, r.aha_name, r.aha_release, r.aha_status,
      r.aha_owner, r.aha_pod, r.aha_start_date, r.aha_end_date, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_description, r.aha_initial_est, r.aha_calculated_devs,
      r.jira_key, ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) as rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_baseline_date
  )
  SELECT
    l.id::uuid, l.aha_key::text, l.created_at::timestamptz, b.created_at::timestamptz as previous_created_at,
    l.aha_name::text, b.aha_name::text as previous_aha_name,
    l.aha_release::text, b.aha_release::text as previous_aha_release,
    l.aha_status::text, b.aha_status::text as previous_aha_status,
    l.aha_owner::text, b.aha_owner::text as previous_aha_owner,
    l.aha_pod::text, b.aha_pod::text as previous_aha_pod,
    l.aha_start_date::date, b.aha_start_date::date as previous_aha_start_date,
    l.aha_end_date::date, b.aha_end_date::date as previous_aha_end_date,
    l.aha_t_shirt_est::text, b.aha_t_shirt_est::text as previous_aha_t_shirt_est,
    l.aha_primary_goal::text, b.aha_primary_goal::text as previous_aha_primary_goal,
    l.aha_description::text, b.aha_description::text as previous_aha_description,
    l.aha_initial_est::text, b.aha_initial_est::text as previous_aha_initial_est,
    l.aha_calculated_devs::text, b.aha_calculated_devs::text as previous_aha_calculated_devs,
    l.jira_key::text, b.jira_key::text as previous_jira_key,
    false::boolean as is_new_item,  -- Always false since we exclude new items
    true::boolean as release_changed,  -- Always true since we filter for release changes only
    v_latest_date::date as snapshot_week,
    v_baseline_date::date as previous_snapshot_week
  FROM latest l
  INNER JOIN baseline b ON l.aha_key = b.aha_key
  WHERE l.rn = 1
    AND b.aha_release IS NOT NULL
    AND l.aha_release IS NOT NULL
    AND l.aha_release IS DISTINCT FROM b.aha_release;
END;
$$ LANGUAGE plpgsql STABLE;


-- ==== SOURCE: fix_week_start_alignment.sql ====
-- Fix week start day alignment between SQL and UI
-- Both should use Monday as the start of the week
-- This fixes the issue where movements don't show up in the correct week on the heatmap

DROP FUNCTION IF EXISTS get_all_year_release_movements();

CREATE OR REPLACE FUNCTION get_all_year_release_movements()
RETURNS TABLE(
  week_start date,
  week_end date,
  movement_count bigint,
  aha_keys text[]
) AS $$
DECLARE
  v_current_year_start date;
  v_latest_snapshot_date date;
BEGIN
  -- Get the latest snapshot date
  SELECT MAX(created_at)::date INTO v_latest_snapshot_date
  FROM public.roadmap_snapshot;

  -- Determine the start of the current year based on the latest snapshot
  v_current_year_start := date_trunc('year', v_latest_snapshot_date)::date;

  RETURN QUERY
  WITH snapshot_dates AS (
    SELECT DISTINCT snapshot_date as snapshot_date
    FROM public.roadmap_snapshot
    WHERE snapshot_date >= v_current_year_start
    ORDER BY snapshot_date
  ),
  -- For each item in each snapshot, find its most recent previous appearance
  item_movements AS (
    SELECT
      curr.snapshot_date as current_snapshot_date,
      -- FIX: Use Monday as week start to match UI (date_trunc defaults to Sunday)
      -- ISODOW: 1=Monday, 2=Tuesday, ..., 7=Sunday
      -- Subtract (ISODOW - 1) to get to Monday
      (curr.snapshot_date - (EXTRACT(ISODOW FROM curr.snapshot_date) - 1)::int) as movement_week_start,
      curr.aha_key as movement_aha_key,
      curr.aha_release as current_release,
      prev.aha_release as previous_release
    FROM public.roadmap_snapshot curr
    -- Find the most recent snapshot BEFORE this one where this item appeared
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (r.aha_key)
        r.aha_key,
        r.aha_release,
        r.created_at
      FROM public.roadmap_snapshot r
      WHERE r.aha_key = curr.aha_key
        AND r.snapshot_date < curr.snapshot_date
      ORDER BY r.aha_key, r.created_at DESC
      LIMIT 1
    ) prev ON true
    WHERE curr.snapshot_date >= v_current_year_start
      -- Only count movements (not new items)
      AND prev.aha_release IS NOT NULL
      AND curr.aha_release IS NOT NULL
      -- Only count actual changes
      AND TRIM(prev.aha_release) != TRIM(curr.aha_release)
  ),
  -- Deduplicate: if an item moved multiple times in the same week, only count the latest movement
  unique_movements AS (
    SELECT DISTINCT ON (movement_aha_key, movement_week_start)
      movement_week_start,
      movement_aha_key,
      current_release,
      previous_release
    FROM item_movements
    ORDER BY movement_aha_key, movement_week_start, current_snapshot_date DESC
  )
  -- Group by week
  SELECT
    um.movement_week_start::date,
    (um.movement_week_start + INTERVAL '6 days')::date,
    COUNT(DISTINCT um.movement_aha_key)::bigint,
    ARRAY_AGG(DISTINCT um.movement_aha_key ORDER BY um.movement_aha_key)::text[]
  FROM unique_movements um
  GROUP BY um.movement_week_start
  ORDER BY um.movement_week_start;
END;
$$ LANGUAGE plpgsql STABLE;



-- ==== SOURCE: add_yearly_movements_rpc.sql ====
  -- Create RPC function to get ALL release movements for the current year
  -- Groups by week to show patterns over time

  DROP FUNCTION IF EXISTS get_all_year_release_movements();

  CREATE OR REPLACE FUNCTION get_all_year_release_movements()
  RETURNS TABLE(
    week_start date,
    week_end date,
    movement_count bigint,
    aha_keys text[]
  ) AS $$
  DECLARE
    v_year_start date;
    v_latest_date date;
  BEGIN
    -- Get the most recent snapshot date
    SELECT DISTINCT r.snapshot_date INTO v_latest_date
    FROM public.roadmap_snapshot r
    ORDER BY r.snapshot_date DESC
    LIMIT 1;

    -- Get the start of the current year
    v_year_start := date_trunc('year', v_latest_date)::date;

    RETURN QUERY
    WITH 
    -- Get all distinct snapshot dates for the year
    snapshot_dates AS (
      SELECT DISTINCT snapshot_date as snapshot_date
      FROM public.roadmap_snapshot
      WHERE snapshot_date >= v_year_start
        AND snapshot_date <= v_latest_date
      ORDER BY snapshot_date
    ),
    -- For each snapshot, find the previous snapshot
    snapshots_with_prev AS (
      SELECT 
        snapshot_date as current_date,
        LAG(snapshot_date) OVER (ORDER BY snapshot_date) as previous_date
      FROM snapshot_dates
    ),
    -- Find release movements between each pair of snapshots
    movements AS (
      SELECT
        swp.current_date,
        -- Use Monday as week start to match UI (date_trunc defaults to Sunday)
        -- ISODOW: 1=Monday, 2=Tuesday, ..., 7=Sunday
        (swp.current_date - (EXTRACT(ISODOW FROM swp.current_date) - 1)::int) as week_start,
        l.aha_key,
        l.aha_release as current_release,
        p.aha_release as previous_release
      FROM snapshots_with_prev swp
      INNER JOIN LATERAL (
        SELECT DISTINCT ON (r.aha_key)
          r.aha_key,
          r.aha_release
        FROM public.roadmap_snapshot r
        WHERE r.snapshot_date = swp.current_date
        ORDER BY r.aha_key, r.created_at DESC
      ) l ON true
      INNER JOIN LATERAL (
        SELECT DISTINCT ON (r.aha_key)
          r.aha_key,
          r.aha_release
        FROM public.roadmap_snapshot r
        WHERE r.snapshot_date = swp.previous_date
          AND r.aha_key = l.aha_key
        ORDER BY r.aha_key, r.created_at DESC
      ) p ON true
      WHERE swp.previous_date IS NOT NULL
        AND p.aha_release IS NOT NULL
        AND l.aha_release IS NOT NULL
        AND TRIM(l.aha_release) != TRIM(p.aha_release)  -- Only count actual changes, trim whitespace
    )
    -- Group by week
    SELECT
      m.week_start::date,
      (m.week_start + INTERVAL '6 days')::date as week_end,
      COUNT(DISTINCT m.aha_key)::bigint as movement_count,
      array_agg(DISTINCT m.aha_key ORDER BY m.aha_key) as aha_keys
    FROM movements m
    GROUP BY m.week_start
    ORDER BY m.week_start;
  END;
  $$ LANGUAGE plpgsql STABLE;

