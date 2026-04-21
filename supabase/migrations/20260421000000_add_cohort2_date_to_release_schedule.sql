ALTER TABLE public.release_schedule
    ADD COLUMN IF NOT EXISTS cohort2_date DATE;
