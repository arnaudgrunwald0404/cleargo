-- Off-schedule release date from Aha; when set, overrides displayed Cohort 1 date and effective launch for status/risk.

ALTER TABLE public.epic
  ADD COLUMN IF NOT EXISTS off_schedule_release_date text;

COMMENT ON COLUMN public.epic.off_schedule_release_date IS 'Aha Off Schedule Release Date; when set, overrides Cohort 1 display and effective launch date for status/risk.';
