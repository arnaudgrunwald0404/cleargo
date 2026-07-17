-- Launch tier is independent of epic tier (several TIER_3 epics can bundle
-- into a T1/T2 marketing launch) and launches are only ever Tier 1 or Tier 2.
-- The original CHECK allowed TIER_3, mirroring epic tiers by mistake.
UPDATE public.launch SET tier = 'TIER_2' WHERE tier = 'TIER_3';

ALTER TABLE public.launch DROP CONSTRAINT IF EXISTS launch_tier_check;
ALTER TABLE public.launch
  ADD CONSTRAINT launch_tier_check CHECK (tier IN ('TIER_1', 'TIER_2'));
