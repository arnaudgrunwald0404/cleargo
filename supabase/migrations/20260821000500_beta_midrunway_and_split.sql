-- Beta becomes a real mid-runway gate, and Enablement splits in two.
--
-- AGREED: product enablement comes after the closed beta (Talya Reynolds' point
-- on the workback slide, confirmed 2026-08-21). Market and field materials go
-- before the beta; product enablement goes after it. That has three consequences.
--
-- 1. "Beta proof gate passed" stops being inert. It was gate=false with no
--    T-minus offset, no dependents, and no owner — it could not be chased and
--    could never be late. It is now a gate inside the runway.
--
-- 2. "Enablement Brief delivered" splits. That one row was described as
--    "delivered by PMM + Product Education" — two functions, one owner slot, one
--    status — and the agreement now puts those two functions on opposite sides of
--    a gate. It becomes "Field Enablement Guide delivered" (PMM, pre-beta) and
--    "Product Enablement delivered" (Product Education, post-beta).
--
-- 3. The runway grows. A design-partner beta that proves adoption cannot run in
--    the 7-day gap that existed between Enablement Brief and Campaign Brief on
--    both tiers. Tier 1 goes 63 -> 105 days, Tier 2 goes 42 -> 77.
--
--    These numbers preserve today's window rhythm (7 days between the gates and
--    around the tail, 14 days for each brief) and give the beta 21 days on Tier 1
--    and 14 on Tier 2. They are Kristin's to adjust — they are data in this one
--    migration, not logic.
--
-- Chain after this migration:
--   Name -> Pricing -> Story -> Message -> Field Enbl -> Beta -> Product Enbl
--        -> Campaign -> Supporting Assets
--
-- Gate 2 also gets its blocking relation corrected. The doc says an unresolved
-- pricing gate "may enter the Story Brief for alignment, but cannot reach field
-- enablement or GTM", so pricing keeps its place in the sequence but its hard
-- block moves onto Field Enablement via blocked_by_criterion_id.

DO $$
DECLARE
  v_phase   text := 'Phase 01: Artifact Runway';
  v_name    uuid;
  v_pricing uuid;
  v_beta    uuid;
  v_story   uuid;
  v_message uuid;
  v_field   uuid;
  v_product uuid;
  v_camp    uuid;
  v_assets  uuid;
BEGIN
  SELECT id INTO v_name    FROM public.criterion WHERE context = 'launch' AND label = 'Final product name signed off';
  SELECT id INTO v_pricing FROM public.criterion WHERE context = 'launch' AND label = 'Pricing and packaging cleared';
  SELECT id INTO v_beta    FROM public.criterion WHERE context = 'launch' AND label = 'Beta proof gate passed';
  SELECT id INTO v_story   FROM public.criterion WHERE context = 'launch' AND label = 'Story Brief delivered to PMM + Product Education';
  SELECT id INTO v_message FROM public.criterion WHERE context = 'launch' AND label = 'Message Brief ratified';
  SELECT id INTO v_camp    FROM public.criterion WHERE context = 'launch' AND label = 'Campaign Brief delivered';
  SELECT id INTO v_assets  FROM public.criterion WHERE context = 'launch' AND label = 'Supporting Assets delivered';

  -- The old combined row becomes the field/market half, renamed in place so the
  -- launches already carrying it keep their status and history.
  SELECT id INTO v_field FROM public.criterion
   WHERE context = 'launch' AND label IN ('Enablement Brief delivered', 'Field Enablement Guide delivered');

  IF v_field IS NULL OR v_beta IS NULL OR v_story IS NULL THEN
    RAISE EXCEPTION 'Artifact runway not found; run 20260819000000_add_tier_workback_schedule.sql first';
  END IF;

  UPDATE public.criterion SET
      label = 'Field Enablement Guide delivered',
      description = 'Field Enablement Guide delivered by PMM, quoting the ratified Message Brief. Market and field-facing material: it precedes the closed beta. Tier 2 baseline is the 12-section template; Tier 1 adds Persona Grid, Internal FAQ, and CSM Email Guide.',
      decision_owner_role = 'PMM',
      sort_order = 2
   WHERE id = v_field;

  -- The product-education half, post-beta. New row rather than a rename, so the
  -- two halves can be owned, dated and cleared independently.
  SELECT id INTO v_product FROM public.criterion
   WHERE context = 'launch' AND label = 'Product Enablement delivered';

  IF v_product IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order,
       default_due_offset_days, decision_owner_role)
    VALUES
      ('Product Enablement delivered',
       'Product Education documentation and training ready for internal teams to consume: Product Deep Dive, Configuration Reference, training sessions, in-app education. Post-beta by agreement — no product enablement is built on claims the beta has not proved.',
       'Enablement', true, 'TIER_1,TIER_2', 'launch', v_phase, 4, 28, 'LEARNING')
    RETURNING id INTO v_product;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Beta joins the runway. It moves out of the Phase 00 gate block because it is
  -- no longer a pre-runway gate: it sits between the two enablement nodes.
  -- ---------------------------------------------------------------------------
  UPDATE public.criterion SET
      gate = true,
      phase = v_phase,
      sort_order = 3,
      tier_applicability = 'TIER_1,TIER_2',
      default_due_offset_days = 49
   WHERE id = v_beta;

  -- ---------------------------------------------------------------------------
  -- The chain.
  -- ---------------------------------------------------------------------------
  UPDATE public.criterion SET depends_on_criterion_id = NULL     WHERE id = v_name;
  UPDATE public.criterion SET depends_on_criterion_id = v_name    WHERE id = v_pricing;
  UPDATE public.criterion SET depends_on_criterion_id = v_pricing WHERE id = v_story;
  UPDATE public.criterion SET depends_on_criterion_id = v_story   WHERE id = v_message;
  UPDATE public.criterion SET depends_on_criterion_id = v_message WHERE id = v_field;
  UPDATE public.criterion SET depends_on_criterion_id = v_field   WHERE id = v_beta;
  UPDATE public.criterion SET depends_on_criterion_id = v_beta    WHERE id = v_product;
  UPDATE public.criterion SET depends_on_criterion_id = v_product WHERE id = v_camp;
  UPDATE public.criterion SET depends_on_criterion_id = v_camp    WHERE id = v_assets;

  -- Gate 2's hard block lands on field enablement, not on the Story Brief.
  UPDATE public.criterion SET blocked_by_criterion_id = v_pricing WHERE id = v_field;

  -- ---------------------------------------------------------------------------
  -- Offsets: where each artifact must START, counted back from the release.
  -- ---------------------------------------------------------------------------
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":105,"TIER_2":77,"TIER_3":28}'::jsonb, default_due_offset_days = 105 WHERE id = v_name;
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":98, "TIER_2":70,"TIER_3":21}'::jsonb, default_due_offset_days = 98  WHERE id = v_pricing;
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":91, "TIER_2":63,"TIER_3":14}'::jsonb, default_due_offset_days = 91  WHERE id = v_story;
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":77, "TIER_2":56}'::jsonb,             default_due_offset_days = 77  WHERE id = v_message;
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":63, "TIER_2":49}'::jsonb,             default_due_offset_days = 63  WHERE id = v_field;
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":49, "TIER_2":35}'::jsonb,             default_due_offset_days = 49  WHERE id = v_beta;
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":28, "TIER_2":21}'::jsonb,             default_due_offset_days = 28  WHERE id = v_product;
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":21, "TIER_2":14}'::jsonb,             default_due_offset_days = 21  WHERE id = v_camp;
  UPDATE public.criterion SET tier_offset_days = '{"TIER_1":14, "TIER_2":7}'::jsonb,              default_due_offset_days = 14  WHERE id = v_assets;

  -- Renumber the runway so the checklist reads in chain order.
  UPDATE public.criterion SET sort_order = 0 WHERE id = v_story;
  UPDATE public.criterion SET sort_order = 1 WHERE id = v_message;
  UPDATE public.criterion SET sort_order = 5 WHERE id = v_camp;
  UPDATE public.criterion SET sort_order = 6 WHERE id = v_assets;

  -- ---------------------------------------------------------------------------
  -- Backfill: launches created before this migration have no Product Enablement
  -- row, which would leave a hole in the middle of their chain. Instantiation
  -- only runs at creation (src/app/api/launches/route.ts), so add it here.
  -- ---------------------------------------------------------------------------
  INSERT INTO public.launch_criterion_status (launch_id, criterion_id, status, owner_email)
  SELECT l.id, v_product, 'NOT_STARTED', l.owner_email
    FROM public.launch l
   WHERE l.tier IN ('TIER_1', 'TIER_2')
     AND NOT EXISTS (
       SELECT 1 FROM public.launch_criterion_status s
        WHERE s.launch_id = l.id AND s.criterion_id = v_product
     );
END $$;
