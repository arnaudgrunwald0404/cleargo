-- The Story Brief gate was seeded at 60 days by 20260718000000, before the
-- workback existed. 20260819000000 gave it tier_offset_days (T1 56 / T2 35 /
-- T3 14), but left the scalar fallback at 60 -- which a launch with no tier set
-- would still use. Align it with the confirmed T1 value so both paths agree.
--
-- Applied to production 2026-08-19 alongside the workback migration; this file
-- exists so the repo and the database tell the same story.
UPDATE public.criterion
   SET default_due_offset_days = 56
 WHERE context = 'launch'
   AND label = 'Story Brief delivered to PMM + Product Education'
   AND default_due_offset_days = 60;
