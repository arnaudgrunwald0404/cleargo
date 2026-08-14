-- CLEARGO-I-20: early gate for final product name sign-off.
-- Adds a GATE criterion in Phase 1 so the product name is assessed and signed off
-- before downstream teams build against it -- Product Education (training material,
-- help center articles), Solution Consultants (demo environments), Product Marketing
-- (website copy, collateral, decks) and Marketing (sales plays, digital campaigns).
--
-- Placement: T-55 sits just after "Lock product role in portfolio" (T-56) and ahead of
-- every downstream builder -- target customers (T-52), positioning statement and
-- packaging (T-50), message house (T-46) -- so naming is settled before the work that
-- depends on it starts. sort_order 2 ties with "Identify target customers"; the
-- launch-criteria list breaks ties alphabetically, which lands this row directly after
-- the portfolio-role item, matching the due-date order.
--
-- Follows the pattern established by 20260718000000_seed_story_brief_gate_criterion.sql
-- (CLEARGO-I-15). Idempotent, so it is safe to re-run.
INSERT INTO public.criterion
  (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
SELECT
  'Final product name signed off',
  'Naming gate: the final product name is assessed and signed off before any downstream materials are built -- training material and help center articles, demo environments, website copy, collateral and presentation decks, sales plays and digital campaigns.',
  'Strategy', true, 'ALL',
  'launch', 'Phase 1: Strategy & Positioning', 2, 55
WHERE NOT EXISTS (
  SELECT 1 FROM public.criterion
  WHERE context = 'launch'
    AND label = 'Final product name signed off'
);
