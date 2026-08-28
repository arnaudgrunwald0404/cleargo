-- 20260819000000 set default_owner_email only inside its INSERT ... IF NULL
-- branches. The Story Brief row already existed (seeded 2026-07-17 by
-- 20260718000000), so its insert was skipped and Kristin Penney's ownership rule
-- -- "the system chases PM for Story, PMM for everything downstream" -- never
-- reached it. The UPDATE block that set phase, offsets and dependencies did not
-- touch ownership, so the gap was silent: the head of the artifact runway, and
-- the day-one handoff gate, had no accountable owner at all.
--
-- Idempotent, and assigns by label, so it corrects a database in either state.
UPDATE public.criterion
   SET default_owner_email = '[name of pod''s product manager]'
 WHERE context = 'launch'
   AND label = 'Story Brief delivered to PMM + Product Education'
   AND default_owner_email IS NULL;

UPDATE public.criterion
   SET default_owner_email = '[launch owner (PMM)]'
 WHERE context = 'launch'
   AND label IN (
     'Message Brief ratified',
     'Enablement Brief delivered',
     'Campaign Brief delivered',
     'Supporting Assets delivered'
   )
   AND default_owner_email IS NULL;
