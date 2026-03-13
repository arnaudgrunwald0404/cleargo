-- Return the next release launch_date after the given date (for Cohort 2 / GA).
-- Used by UI Framework rollout epics to show Cohort 2 on the correct release cycle.
CREATE OR REPLACE FUNCTION get_next_release_date(after_date DATE)
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT launch_date
  FROM release_schedule
  WHERE launch_date > after_date
    AND (archived IS NULL OR archived = false)
  ORDER BY launch_date ASC
  LIMIT 1;
$$;
