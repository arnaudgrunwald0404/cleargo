-- CLEARGO-I-15 (Kristin Penney): start the GTM clock at Product Definition.
-- Adds a "Story Brief delivered to PMM + Product Education" GATE criterion at
-- the very start of the launch checklist (largest T-minus offset in the set),
-- so GTM prep cannot show progress until the day-one handoff has happened.
INSERT INTO public.criterion
  (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
SELECT
  'Story Brief delivered to PMM + Product Education',
  'Day-one handoff gate: the story brief (what / why / customer value, disruption assessment) is delivered to PMM and Product Education at build kickoff, before any downstream GTM work begins.',
  'Strategy', true, 'ALL',
  'launch', 'Phase 1: Strategy & Positioning', 0, 60
WHERE NOT EXISTS (
  SELECT 1 FROM public.criterion
  WHERE context = 'launch'
    AND label = 'Story Brief delivered to PMM + Product Education'
);
