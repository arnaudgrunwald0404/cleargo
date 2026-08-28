-- The three commercialization gates, decomposed into their checklist items.
--
-- Transcribed from Kristin Penney's "00 Launch Gate Checklist" v2. Item labels
-- and descriptions are the doc's own words; owner_role is the proposed
-- accountable function, derived from what each item produces and who the doc says
-- signs it. Gate 2's "Packaging treatment decided — both clocks" becomes two rows
-- because the doc requires the existing-customer path and the net-new path to be
-- sequenced against each other, so one can be settled while the other is not.
--
-- Three roles this needs did not exist in ClearGO before: UX (Proof 2 is
-- behavioural evidence — the same thing UX owns as "Behavioral Baseline
-- Established" on the epic matrix), SE (Proof 1 is explicitly an SE
-- reality-check), and LEGAL (order-form language). Added to DecisionOwnerRole in
-- src/types/criteria.ts alongside this migration.
--
-- 17 rows: Gate 1 x 5, Gate 2 x 7, Gate 3 x 5.

DO $$
DECLARE
  v_gate1 uuid;
  v_gate2 uuid;
  v_gate3 uuid;
BEGIN
  SELECT id INTO v_gate1 FROM public.criterion
   WHERE context = 'launch' AND label = 'Final product name signed off';
  SELECT id INTO v_gate2 FROM public.criterion
   WHERE context = 'launch' AND label = 'Pricing and packaging cleared';
  SELECT id INTO v_gate3 FROM public.criterion
   WHERE context = 'launch' AND label = 'Beta proof gate passed';

  IF v_gate1 IS NULL OR v_gate2 IS NULL OR v_gate3 IS NULL THEN
    RAISE EXCEPTION 'Commercialization gates not found; run 20260819000000_add_tier_workback_schedule.sql first';
  END IF;

  -- ---------------------------------------------------------------------------
  -- Gate context: the doc gives each gate a question, an anchor, and an explicit
  -- CLEARS WHEN clause. All three were empty in ClearGO, which is why the person
  -- voting had nothing to go on.
  -- ---------------------------------------------------------------------------
  UPDATE public.criterion SET
      description = 'Does it get a name — and how does it map to what we sell?',
      status_definition_go = 'Name (or no-name) is locked and mapped to sales structure. This decision feeds the Story Brief header and the Message Brief.',
      decision_owner_role = 'PMM',
      required_signoff_roles = ARRAY['PMM', 'CPO']
   WHERE id = v_gate1;

  UPDATE public.criterion SET
      description = 'Is pricing a blocker — and what does value tell us? Anchor: commercialize around full-customer value, not the feature in isolation.',
      status_definition_go = 'Pricing model is locked and stable, packaging is decided for both existing and net-new, and systems can represent it.',
      status_definition_conditional = 'An unresolved pricing gate may enter the Story Brief for alignment, but cannot reach field enablement or GTM.',
      status_definition_no_go = 'Unpriced, OR a changing model (PEPM to banded, flat to credit, standalone to packaged). A live price with a moving structure does NOT clear this gate.',
      decision_owner_role = 'CPO',
      required_signoff_roles = ARRAY['CPO', 'REV_OPS']
   WHERE id = v_gate2;

  UPDATE public.criterion SET
      description = 'Has the beta earned the launch — or are we assuming it did? Anchor: beta earns the launch, it does not replace it. Existing-customer only; clearing beta proves it for existing accounts, not automatically for net-new.',
      status_definition_go = 'All three proofs met · claims register updated from what held up · references and vignettes captured · net-new packaging and pricing sequenced (Gate 2).',
      decision_owner_role = 'PMM',
      required_signoff_roles = ARRAY['PMM', 'PRODUCT', 'SE']
   WHERE id = v_gate3;

  -- ---------------------------------------------------------------------------
  -- GATE 1 · NAMING / COMMERCIALIZATION
  -- ---------------------------------------------------------------------------
  INSERT INTO public.criterion_item
    (criterion_id, item_key, label, description, owner_role, optional, sort_order)
  VALUES
    (v_gate1, 'gate1_classified', 'Classified',
     'Enhancement · net-new · or cross-module differentiator — decided and recorded.',
     'PM', false, 0),

    (v_gate1, 'gate1_name_or_not', 'Name-or-not decision made',
     'Only named if it adds customer value or clarity. A no-name outcome is a valid, recorded result.',
     'PMM', false, 1),

    (v_gate1, 'gate1_name_type', 'Name type set',
     'Rename existing · feature in a package · or new product / add-on.',
     'PMM', false, 2),

    (v_gate1, 'gate1_mapped_to_structure', 'Mapped to structure',
     'Where it lives on the price list is defined; the name never implies false packaging.',
     'REV_OPS', false, 3),

    (v_gate1, 'gate1_convention_check', 'Convention check passed',
     'Follows the established ClearCo naming pattern.',
     'PMM', false, 4)
  ON CONFLICT (item_key) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- GATE 2 · PRICING / PACKAGING
  -- ---------------------------------------------------------------------------
  INSERT INTO public.criterion_item
    (criterion_id, item_key, label, description, owner_role, optional, sort_order)
  VALUES
    (v_gate2, 'gate2_model_stable', 'Gate status confirmed — model is STABLE, not in-flight',
     'Priced and stable = light lift. Unpriced OR a changing model = HARD BLOCKER. A live price with a moving structure does not clear this gate.',
     'CPO', false, 0),

    (v_gate2, 'gate2_full_customer_value', 'Full-customer value established',
     'Account worth · buyer vs. user · expansion role.',
     'PMM', false, 1),

    (v_gate2, 'gate2_cost_to_deliver', 'True cost to deliver known',
     '3rd-party re-host · internal build · ongoing load.',
     'ENG', false, 2),

    (v_gate2, 'gate2_legal_orderform', 'Legal / order-form language drafted',
     'Contract terms exist before systems have to represent them.',
     'LEGAL', false, 3),

    -- The doc treats these as one checkbox with "both clocks", but requires the
    -- two paths to be sequenced so neither launches ahead of the other. Two rows,
    -- so one can be settled while the other is not.
    (v_gate2, 'gate2_packaging_existing', 'Packaging treatment decided — existing customers',
     'Included in tier · add-on · or standalone. Migration path plus amended terms, sequenced against the net-new path so neither launches ahead of the other.',
     'REV_OPS', false, 4),

    (v_gate2, 'gate2_packaging_netnew', 'Packaging treatment decided — net-new',
     'Target model set for net-new, sequenced against the existing-customer path so neither launches ahead of the other.',
     'REV_OPS', false, 5),

    (v_gate2, 'gate2_systems_ready', 'Systems representation ready',
     'Order form · CRM · price-list sign-off.',
     'REV_OPS', false, 6)
  ON CONFLICT (item_key) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- GATE 3 · BETA PROOF GATE (if applicable)
  -- Optional throughout: the gate only applies to capabilities that run a
  -- design-partner beta, so each item must be closeable as NOT_APPLICABLE.
  -- ---------------------------------------------------------------------------
  INSERT INTO public.criterion_item
    (criterion_id, item_key, label, description, owner_role, optional, sort_order)
  VALUES
    (v_gate3, 'gate3_entry_conditions', 'Entry conditions were met',
     'Named design partners (existing customers only) · success criteria agreed up front · feedback loop and NDA in place · scoped to a workflow, not the whole product.',
     'PM', true, 0),

    (v_gate3, 'gate3_proof_claims', 'Proof 1 — the claims hold up live',
     'The SE team can demonstrate it in a real account matching what we plan to say. No claim reaches enablement unless beta proved it. Feeds: claims register · SE reality-check.',
     'SE', true, 1),

    (v_gate3, 'gate3_proof_adoption', 'Proof 2 — adoption is real',
     'Design partners actually use it and hit the intended workflow — not just switched on. Usage / engagement data backs it up. Feeds: ROI / value narrative.',
     'UX', true, 2),

    (v_gate3, 'gate3_proof_story', 'Proof 3 — the story lands',
     'Partners can articulate the value in their words; their language and outcomes become proof points and vignettes. Feeds: story brief · references.',
     'PMM', true, 3),

    (v_gate3, 'gate3_netnew_sequenced', 'Net-new motion sequenced',
     'Net-new packaging and pricing sequenced before market (ties to Gate 2). Clearing beta for existing accounts does not make it net-new ready.',
     'REV_OPS', true, 4)
  ON CONFLICT (item_key) DO NOTHING;
END $$;
