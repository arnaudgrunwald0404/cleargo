-- get_latest_and_previous_roadmap_versions — include GTM columns + vote count

DROP FUNCTION IF EXISTS public.get_latest_and_previous_roadmap_versions();

CREATE OR REPLACE FUNCTION public.get_latest_and_previous_roadmap_versions()
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
  aha_progress integer,
  gtm_module text,
  gtm_name text,
  aha_promoted_ideas_votes integer
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
      r.id, r.created_at, r.aha_key, r.aha_name, r.aha_description,
      r.aha_start_date, r.aha_end_date, r.aha_status, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_calculated_devs, r.aha_owner, r.aha_initial_est,
      r.aha_release, r.aha_release_date, r.aha_pod, r.jira_key, r.aha_csm_priority,
      r.aha_progress, r.gtm_module, r.gtm_name, r.aha_promoted_ideas_votes,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) AS rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_latest_date
    ORDER BY r.aha_key, r.created_at DESC
  ),
  previous AS (
    SELECT DISTINCT ON (r.aha_key)
      r.id, r.created_at, r.aha_key, r.aha_name, r.aha_description,
      r.aha_start_date, r.aha_end_date, r.aha_status, r.aha_t_shirt_est,
      r.aha_primary_goal, r.aha_calculated_devs, r.aha_owner, r.aha_initial_est,
      r.aha_release, r.aha_release_date, r.aha_pod, r.jira_key, r.aha_csm_priority,
      r.aha_progress, r.gtm_module, r.gtm_name, r.aha_promoted_ideas_votes,
      ROW_NUMBER() OVER (PARTITION BY r.aha_key ORDER BY r.created_at DESC) AS rn
    FROM public.roadmap_snapshot r
    WHERE r.snapshot_date = v_previous_date
    ORDER BY r.aha_key, r.created_at DESC
  )
  SELECT
    l.id::uuid, l.created_at::timestamptz, 1::integer AS rank,
    l.aha_key::text, l.aha_name::text, l.aha_description::text,
    l.aha_start_date::date, l.aha_end_date::date, l.aha_status::text,
    l.aha_t_shirt_est::text, l.aha_primary_goal::text, l.aha_calculated_devs::text,
    l.aha_owner::text, l.aha_initial_est::text, l.aha_release::text,
    l.aha_release_date::date, l.aha_pod::text, l.jira_key::text,
    l.aha_csm_priority::text, l.aha_progress::integer,
    l.gtm_module::text, l.gtm_name::text, l.aha_promoted_ideas_votes::integer
  FROM latest l
  WHERE l.rn = 1

  UNION ALL

  SELECT
    p.id::uuid, p.created_at::timestamptz, 2::integer AS rank,
    p.aha_key::text, p.aha_name::text, p.aha_description::text,
    p.aha_start_date::date, p.aha_end_date::date, p.aha_status::text,
    p.aha_t_shirt_est::text, p.aha_primary_goal::text, p.aha_calculated_devs::text,
    p.aha_owner::text, p.aha_initial_est::text, p.aha_release::text,
    p.aha_release_date::date, p.aha_pod::text, p.jira_key::text,
    p.aha_csm_priority::text, p.aha_progress::integer,
    p.gtm_module::text, p.gtm_name::text, p.aha_promoted_ideas_votes::integer
  FROM previous p
  WHERE p.rn = 1;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_latest_and_previous_roadmap_versions() TO authenticated;
