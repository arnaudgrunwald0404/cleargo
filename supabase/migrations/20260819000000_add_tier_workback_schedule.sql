-- Encodes the "CAPABILITIES LAUNCH - DRAFT WORKBACK" slide from Kristin Penney's
-- GTM Motion Operating Playbook (Q3 2026) as editable data.
--
-- Three gaps this closes:
--
--   1. default_due_offset_days is a single scalar, so every tier got identical
--      T-minus dates. The slide's whole point is that lead time scales with tier
--      (T1 ~8wk, T2 ~5wk, T3 ~2wk): the Story Brief gate seeded at 60 days is
--      right for T1 and 25 days too early for T2. tier_offset_days carries the
--      per-tier override; default_due_offset_days remains the fallback, so every
--      existing criterion keeps its current behaviour untouched.
--
--   2. The artifact chain is derivational -- the deck says each artifact
--      "sharpens the last", and the Enablement template says every claim in it
--      "quotes the messaging doc" -- but criteria had no dependency edge, so a
--      late Story Brief pushed nothing. depends_on_criterion_id adds that edge.
--
--   3. Four of the deck's five artifacts did not exist as launch criteria at
--      all. The 52 rows seeded by 20260314000002 are an older, generic launch
--      playbook vocabulary; only the Story Brief gate (CLEARGO-I-15) lines up.
--
-- Seeded values come straight from the slide and are editable in
-- Admin > Settings > Launch Criteria. Talya Reynolds' comment on that slide is
-- still OPEN -- she argues product enablement belongs *after* the closed beta,
-- not before it. Because the ordering and the offsets are data, resolving that
-- argument is a row change rather than a migration.
--
-- Also seeds the commercialization gate that precedes the runway, from Kristin's
-- "00 Launch Gate Checklist": Gate 1 naming, Gate 2 pricing/packaging, and a
-- dateless Gate 3 beta placeholder. The Story Brief now depends on Gate 2, per
-- that checklist ("No Story Brief starts until Naming and Pricing/Packaging are
-- cleared") and the deck's matching guardrail.
--
-- STATUS: the per-artifact durations were confirmed by Kristin Penney on
-- 2026-08-19 as the workback standard, so they are no longer a reading of a
-- draft slide. The GATE buffer (63/42/21) is still a chosen number -- her
-- checklist says "open this at ideation", which is not a date -- and beta
-- placement is still unsettled. Refine both with Dan and Kristin.

ALTER TABLE public.criterion
  ADD COLUMN IF NOT EXISTS tier_offset_days jsonb;

COMMENT ON COLUMN public.criterion.tier_offset_days IS
  'Per-tier T-minus offset in days, e.g. {"TIER_1": 56, "TIER_2": 35}. Falls back to default_due_offset_days when the launch tier has no entry. Editable in Admin > Settings > Launch Criteria.';

ALTER TABLE public.criterion
  ADD COLUMN IF NOT EXISTS depends_on_criterion_id uuid
  REFERENCES public.criterion(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.criterion.depends_on_criterion_id IS
  'Predecessor in the GTM artifact runway. A criterion cannot be meaningfully started before its predecessor is delivered.';

CREATE INDEX IF NOT EXISTS idx_criterion_depends_on
  ON public.criterion (depends_on_criterion_id)
  WHERE depends_on_criterion_id IS NOT NULL;

DO $migration$
DECLARE
  v_gate_phase text := 'Phase 00: Commercialization Gate';
  v_phase   text := 'Phase 0: Artifact Runway';
  v_gate1   uuid;
  v_gate2   uuid;
  v_gate3   uuid;
  v_story   uuid;
  v_message uuid;
  v_enable  uuid;
  v_camp    uuid;
  v_assets  uuid;
BEGIN
  -- ── The commercialization gate, ahead of the runway ──────────────────────
  -- Kristin's "00 Launch Gate Checklist": "No Story Brief starts until Naming
  -- and Pricing/Packaging are cleared." The deck's guardrail says the same
  -- ("Both gates cleared -> Story Brief -> Message Brief -> Enablement -> GTM"),
  -- as does the artifact slide ("Two hard blockers before anything can be sold:
  -- naming locked, and pricing approved by Finance + RevOps").
  --
  -- Phase name sorts before 'Phase 0:' because '0' < ':', so the gate renders
  -- ahead of the runway in the admin list (ordered by phase, then sort_order).

  -- Gate 1 - Naming / commercialization. Sign-off: PMM + CPO.
  -- This is CLEARGO-I-20's existing criterion, moved ahead of the Story Brief.
  -- I-20 placed it at T-55, which put naming AFTER the brief it is meant to
  -- unblock; the gate checklist inverts that. Inserted here if missing, since
  -- 20260814000000 was never applied to production either.
  SELECT id INTO v_gate1 FROM public.criterion
   WHERE context = 'launch' AND label = 'Final product name signed off';

  IF v_gate1 IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
    VALUES
      ('Final product name signed off',
       'Gate 1 - Naming / commercialization. Classified (enhancement / net-new / cross-module differentiator), name-or-not decision made, name type set, mapped to price-list structure, naming convention checked. A no-name outcome is a valid recorded result. Clears when the name is locked and mapped to sales structure; feeds the Story Brief header and the Message Brief. Sign-off: PMM + CPO.',
       'Strategy', true, 'ALL', 'launch', v_gate_phase, 0, 63)
    RETURNING id INTO v_gate1;
  END IF;

  -- Gate 2 - Pricing / packaging. Sign-off: CPO + RevOps.
  -- ClearGo had no pricing gate at all, only a non-gate task ("Build packaging
  -- & pricing strategy", T-50). That absence is the "even finding out IF there
  -- is a pricing/packaging impact takes sleuthing" complaint from the deck.
  SELECT id INTO v_gate2 FROM public.criterion
   WHERE context = 'launch' AND label = 'Pricing and packaging cleared';
  IF v_gate2 IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
    VALUES
      ('Pricing and packaging cleared',
       'Gate 2 - Pricing / packaging. Model is STABLE, not in-flight: unpriced OR a changing structure (PEPM to banded, flat to credit, standalone to packaged) is a HARD BLOCKER -- a live price with a moving structure does NOT clear this gate. Also requires full-customer value established, true cost to deliver known, legal / order-form language drafted, packaging decided for BOTH clocks (existing-customer migration path and net-new target model), and systems representation ready (order form, CRM, price list). An unresolved pricing gate may enter the Story Brief for alignment, but cannot reach field enablement or GTM. Sign-off: CPO + RevOps.',
       'Strategy', true, 'ALL', 'launch', v_gate_phase, 1, 63)
    RETURNING id INTO v_gate2;
  END IF;

  -- Gate 3 - Beta proof gate. Deliberately DATELESS and outside the dependency
  -- chain: three documents place beta differently. The gate checklist puts it
  -- before the Story Brief; the deck's beta slide sequences it "Gates cleared >
  -- Build > BETA > Full GTM launch"; the workback slide puts BETA after
  -- Supporting Assets, just before GA. Talya Reynolds' comment on the workback
  -- slide is open on the same question. Seeded as a non-gate so it appears on
  -- the checklist without blocking readiness, and with no offsets so it shows no
  -- date it cannot justify. Promote to gate=true and give it offsets once
  -- placement is settled. T3 is excluded: the deck is unambiguous that T3 skips
  -- beta entirely.
  SELECT id INTO v_gate3 FROM public.criterion
   WHERE context = 'launch' AND label = 'Beta proof gate passed';
  IF v_gate3 IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
    VALUES
      ('Beta proof gate passed',
       'Gate 3 - Beta proof gate (applies only where the capability runs a design-partner beta). Entry conditions met (named existing-customer design partners, success criteria agreed up front, feedback loop and NDA, scoped to a workflow). Proof 1: the claims hold up live -- the SE team can demonstrate it in a real account matching what we plan to say. Proof 2: adoption is real -- partners hit the intended workflow, backed by usage data. Proof 3: the story lands -- partners articulate the value in their own words. Net-new motion sequenced separately: clearing beta proves it for existing accounts, not for net-new. TIMING UNRESOLVED - placement relative to the Story Brief and GA is still being settled, so this carries no due date yet. Sign-off: PMM + Product + SE lead.',
       'Readiness', false, 'TIER_1,TIER_2', 'launch', v_gate_phase, 2, NULL)
    RETURNING id INTO v_gate3;
  END IF;

  -- 1. Story Brief -- head of the chain, required at every tier.
  -- Inserted here if missing: 20260718000000 seeded it but was never applied to
  -- production, and the runway has no head without it.
  SELECT id INTO v_story FROM public.criterion
   WHERE context = 'launch' AND label = 'Story Brief delivered to PMM + Product Education';

  IF v_story IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days, default_owner_email)
    VALUES
      ('Story Brief delivered to PMM + Product Education',
       'Day-one handoff gate: the story brief (what / why / customer value, disruption assessment) is delivered to PMM and Product Education at build kickoff, before any downstream GTM work begins.',
       'Strategy', true, 'ALL', 'launch', v_phase, 0, 56, '[name of pod''s product manager]')
    RETURNING id INTO v_story;
  END IF;

  -- 2. Message Brief -- the single source every downstream asset quotes.
  SELECT id INTO v_message FROM public.criterion
   WHERE context = 'launch' AND label = 'Message Brief ratified';
  IF v_message IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days, default_owner_email)
    VALUES
      ('Message Brief ratified',
       'Messaging and positioning doc ratified by PMM: naming rules, positioning statement, message house with the hero pillar marked, and the claims register. Every downstream asset quotes this document rather than restating it.',
       'Strategy', true, 'TIER_1,TIER_2', 'launch', v_phase, 1, 42, '[launch owner (PMM)]')
    RETURNING id INTO v_message;
  END IF;

  -- 3. Enablement Brief -- Tier 2 baseline is 12 sections; Tier 1 adds six more.
  SELECT id INTO v_enable FROM public.criterion
   WHERE context = 'launch' AND label = 'Enablement Brief delivered';
  IF v_enable IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days, default_owner_email)
    VALUES
      ('Enablement Brief delivered',
       'Field Enablement Guide delivered by PMM + Product Education, quoting the ratified Message Brief. Tier 2 baseline is the 12-section template; Tier 1 adds Product Deep Dive, Persona Grid, Internal FAQ, Configuration Reference, CSM Email Guide, and Communication Timeline.',
       'Enablement', true, 'TIER_1,TIER_2', 'launch', v_phase, 2, 28, '[launch owner (PMM)]')
    RETURNING id INTO v_enable;
  END IF;

  -- 4. Campaign Brief -- the launch operating document, not a marketing artifact.
  -- The template is 10 parts: launch identification and key dates, customer and
  -- market, messaging drawn from the ratified messaging doc, pricing and
  -- packaging, an 11-row stakeholder RACI, an 11-item asset checklist, GTM
  -- motion plan by audience, a T-6 to T+60 workback calendar, success metrics,
  -- and a risks and approval log.
  --
  -- Applies to BOTH tiers, confirmed by Kristin 2026-08-19: she gave Campaign a
  -- Tier 2 duration (14d), settling the apparent conflict where the workback
  -- slide's T2 row omitted "Camp". The template agreed all along -- it is headed
  -- "Tier [1 / 2] Launch Brief" and subtitled "Capability Launch", the deck's own
  -- name for Tier 2.
  SELECT id INTO v_camp FROM public.criterion
   WHERE context = 'launch' AND label = 'Campaign Brief delivered';
  IF v_camp IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days, default_owner_email)
    VALUES
      ('Campaign Brief delivered',
       'Launch operating document owned by PMM with Growth/Marketing: launch identification and key dates, customer problem and proof, messaging quoted from the ratified Message Brief, pricing and packaging, stakeholder RACI, asset checklist, GTM motion plan by audience, workback calendar, success metrics, and the approval log. Locked once the approval log is signed.',
       'Enablement', false, 'TIER_1,TIER_2', 'launch', v_phase, 3, 21, '[launch owner (PMM)]')
    RETURNING id INTO v_camp;
  END IF;

  -- 5. Supporting Assets -- vignettes, video, proof points.
  SELECT id INTO v_assets FROM public.criterion
   WHERE context = 'launch' AND label = 'Supporting Assets delivered';
  IF v_assets IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days, default_owner_email)
    VALUES
      ('Supporting Assets delivered',
       'Vignettes, demo video, and proof points handed to Sales Consultants / SEs. The SE reality-check is the earliest signal that the claims upstream are grounded.',
       'Enablement', false, 'TIER_1,TIER_2', 'launch', v_phase, 4, 14, '[launch owner (PMM)]')
    RETURNING id INTO v_assets;
  END IF;

  -- Per-tier lead times, straight from the workback slide.
  --   T1 (~8wk) -> Story 56, Msg 42, Enable 28, Camp 21, Assets 14
  --   T2 (~5wk) -> Story 35, Msg 28, Enable 21, Camp 14, Assets  7
  --   T3 (~2wk) -> Story (light) 14 only; T3 ships as a release note, no beta.
  -- Confirmed by Kristin Penney 2026-08-19 as the workback standard. Each number
  -- is the point the artifact must START, counted back from the release date.
  -- TIER_3 is carried for forward-compatibility: launches are only ever T1/T2
  -- (see src/types/launches.ts), but epics do have a TIER_3 and the deck
  -- specifies a T3 motion.
  -- Gates sit one week ahead of the Story Brief (63/42/21 vs 56/35/14).
  -- Kristin's checklist says "open this at ideation", which is not a date; one
  -- week is a chosen buffer to be refined with Dan and Kristin, not a ratified
  -- number. Editable per tier in Admin > Settings > Launch Criteria.
  UPDATE public.criterion SET
      phase = v_gate_phase,
      sort_order = 0,
      tier_offset_days = '{"TIER_1": 63, "TIER_2": 42, "TIER_3": 21}'::jsonb,
      depends_on_criterion_id = NULL
    WHERE id = v_gate1;

  UPDATE public.criterion SET
      phase = v_gate_phase,
      sort_order = 1,
      tier_offset_days = '{"TIER_1": 63, "TIER_2": 42, "TIER_3": 21}'::jsonb,
      depends_on_criterion_id = v_gate1
    WHERE id = v_gate2;

  -- Gate 3 keeps null offsets on purpose -- see the beta timing note above.
  UPDATE public.criterion SET
      phase = v_gate_phase,
      sort_order = 2,
      tier_offset_days = NULL,
      depends_on_criterion_id = NULL
    WHERE id = v_gate3;

  UPDATE public.criterion SET
      phase = v_phase,
      tier_offset_days = '{"TIER_1": 56, "TIER_2": 35, "TIER_3": 14}'::jsonb,
      depends_on_criterion_id = v_gate2
    WHERE id = v_story;

  UPDATE public.criterion SET
      phase = v_phase,
      tier_offset_days = '{"TIER_1": 42, "TIER_2": 28}'::jsonb,
      depends_on_criterion_id = v_story
    WHERE id = v_message;

  UPDATE public.criterion SET
      phase = v_phase,
      tier_offset_days = '{"TIER_1": 28, "TIER_2": 21}'::jsonb,
      depends_on_criterion_id = v_message
    WHERE id = v_enable;

  UPDATE public.criterion SET
      phase = v_phase,
      tier_offset_days = '{"TIER_1": 21, "TIER_2": 14}'::jsonb,
      depends_on_criterion_id = v_enable
    WHERE id = v_camp;

  -- Assets now depends on Campaign rather than Enablement: with Campaign
  -- confirmed for both tiers, it is the true predecessor, and the Campaign
  -- Brief's own asset checklist is what Supporting Assets delivers against.
  UPDATE public.criterion SET
      phase = v_phase,
      tier_offset_days = '{"TIER_1": 14, "TIER_2": 7}'::jsonb,
      depends_on_criterion_id = v_camp
    WHERE id = v_assets;
END $migration$;
