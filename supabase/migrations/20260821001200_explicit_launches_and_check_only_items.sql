-- Four corrections to the 2026-08-21 gate work, after seeing it in the UI.
--
-- 1. NO DERIVED SIGN-OFFS. A launch requires explicit action, not an assumption
--    inherited from its epics. The roll-up also failed in the worst way: with no
--    epic criterion scored, "we have no data" resolved to NOT_APPLICABLE, so every
--    sign-off rendered as "does not apply" rather than "nobody has answered". The
--    eight Sign-off rows go back to being ticked on the launch.
--
-- 2. NO DECISION / SOURCE SUBTASKS. Capturing the DECISION OF RECORD and SOURCE OF
--    TRUTH blocks as checklist items made a gate read as twelve chores. Those
--    fields belong to a future asset-template concept that links out to Drive,
--    which is deliberately not built yet. Only the ☐ lines remain.
--
-- 3. BETA REJOINS THE OTHER TWO GATES. Moving it into Phase 01 split Kristin's
--    three commercialization gates across two sections, and it read as missing.
--    Phase is display grouping; depends_on and tier_offset_days are the schedule.
--    So it sits with Gates 1 and 2 while keeping its mid-runway dates and its
--    place in the chain between Field Enablement and Product Enablement.
--
-- 4. ITEMS SHOW THE ACCOUNTABLE FUNCTION. Instantiation resolved every item's
--    owner to the launch owner, so all 117 rows showed one person and the
--    per-function ownership the decomposition exists for was invisible. An
--    unassigned item now shows its role (SE, UX, LEGAL, REV_OPS...) until a real
--    person is named.

-- ---------------------------------------------------------------------------
-- 1. Sign-offs are answered here
-- ---------------------------------------------------------------------------
UPDATE public.criterion
   SET is_derived = false,
       equivalent_criterion_id = NULL,
       -- 20260821000700 overwrote these with "Derived: ..." text; they were empty
       -- before it and should be again.
       description = NULL
 WHERE context = 'launch'
   AND label LIKE 'Sign-off:%';

-- ---------------------------------------------------------------------------
-- 2. Only checkboxes remain
-- ---------------------------------------------------------------------------
DELETE FROM public.launch_criterion_item
 WHERE item_id IN (SELECT id FROM public.criterion_item WHERE kind <> 'check');

DELETE FROM public.criterion_item
 WHERE kind <> 'check';

-- ---------------------------------------------------------------------------
-- 3. Beta back alongside Gates 1 and 2
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_gate_phase text := 'Phase 00: Commercialization Gate';
  v_phase      text := 'Phase 01: Artifact Runway';
BEGIN
  UPDATE public.criterion
     SET phase = v_gate_phase,
         sort_order = 2
   WHERE context = 'launch' AND label = 'Beta proof gate passed';

  -- Close the gap Beta left behind so the runway still reads in chain order.
  UPDATE public.criterion SET sort_order = 3 WHERE context = 'launch' AND phase = v_phase AND label = 'Product Enablement delivered';
  UPDATE public.criterion SET sort_order = 4 WHERE context = 'launch' AND phase = v_phase AND label = 'Campaign Brief delivered';
  UPDATE public.criterion SET sort_order = 5 WHERE context = 'launch' AND phase = v_phase AND label = 'Supporting Assets delivered';
END $$;

-- ---------------------------------------------------------------------------
-- 4. An unassigned item shows its function, not the launch owner
-- ---------------------------------------------------------------------------
UPDATE public.launch_criterion_item
   SET owner_email = NULL
 WHERE owner_email IS NOT NULL;
