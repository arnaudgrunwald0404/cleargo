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
-- NOTE: the slide is titled DRAFT WORKBACK. Treat these numbers as the starting
-- position Kristin can move, not as a ratified schedule.

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
  v_phase   text := 'Phase 0: Artifact Runway';
  v_story   uuid;
  v_message uuid;
  v_enable  uuid;
  v_camp    uuid;
  v_assets  uuid;
BEGIN
  -- 1. Story Brief -- head of the chain, required at every tier.
  -- Inserted here if missing: 20260718000000 seeded it but was never applied to
  -- production, and the runway has no head without it.
  SELECT id INTO v_story FROM public.criterion
   WHERE context = 'launch' AND label = 'Story Brief delivered to PMM + Product Education';

  IF v_story IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
    VALUES
      ('Story Brief delivered to PMM + Product Education',
       'Day-one handoff gate: the story brief (what / why / customer value, disruption assessment) is delivered to PMM and Product Education at build kickoff, before any downstream GTM work begins.',
       'Strategy', true, 'ALL', 'launch', v_phase, 0, 56)
    RETURNING id INTO v_story;
  END IF;

  -- 2. Message Brief -- the single source every downstream asset quotes.
  SELECT id INTO v_message FROM public.criterion
   WHERE context = 'launch' AND label = 'Message Brief ratified';
  IF v_message IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
    VALUES
      ('Message Brief ratified',
       'Messaging and positioning doc ratified by PMM: naming rules, positioning statement, message house with the hero pillar marked, and the claims register. Every downstream asset quotes this document rather than restating it.',
       'Strategy', true, 'TIER_1,TIER_2', 'launch', v_phase, 1, 42)
    RETURNING id INTO v_message;
  END IF;

  -- 3. Enablement Brief -- Tier 2 baseline is 12 sections; Tier 1 adds six more.
  SELECT id INTO v_enable FROM public.criterion
   WHERE context = 'launch' AND label = 'Enablement Brief delivered';
  IF v_enable IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
    VALUES
      ('Enablement Brief delivered',
       'Field Enablement Guide delivered by PMM + Product Education, quoting the ratified Message Brief. Tier 2 baseline is the 12-section template; Tier 1 adds Product Deep Dive, Persona Grid, Internal FAQ, Configuration Reference, CSM Email Guide, and Communication Timeline.',
       'Enablement', true, 'TIER_1,TIER_2', 'launch', v_phase, 2, 28)
    RETURNING id INTO v_enable;
  END IF;

  -- 4. Campaign Brief -- the launch operating document, not a marketing artifact.
  -- The template is 10 parts: launch identification and key dates, customer and
  -- market, messaging drawn from the ratified messaging doc, pricing and
  -- packaging, an 11-row stakeholder RACI, an 11-item asset checklist, GTM
  -- motion plan by audience, a T-6 to T+60 workback calendar, success metrics,
  -- and a risks and approval log.
  --
  -- TIER OPEN QUESTION: seeded TIER_1 only, following the workback slide (whose
  -- T2 row omits "Camp") and the BOM slide (T2 = "targeted play + comms" vs T1's
  -- "full campaign + comms"). The template itself disagrees -- it is headed
  -- "Tier [1 / 2] Launch Brief", is subtitled "Capability Launch" which is the
  -- deck's own name for Tier 2, and anchors its workback at "T-6 for T2; extend
  -- for T1". If Kristin confirms it covers both tiers, change this row to
  -- 'TIER_1,TIER_2', give it a TIER_2 offset, and repoint Supporting Assets to
  -- depend on it (the asset checklist lives inside this document).
  SELECT id INTO v_camp FROM public.criterion
   WHERE context = 'launch' AND label = 'Campaign Brief delivered';
  IF v_camp IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
    VALUES
      ('Campaign Brief delivered',
       'Launch operating document owned by PMM: launch identification and key dates, customer problem and proof, messaging quoted from the ratified Message Brief, pricing and packaging, stakeholder RACI, asset checklist, GTM motion plan by audience, workback calendar, success metrics, and the approval log. Locked once the approval log is signed.',
       'Enablement', false, 'TIER_1', 'launch', v_phase, 3, 21)
    RETURNING id INTO v_camp;
  END IF;

  -- 5. Supporting Assets -- vignettes, video, proof points.
  SELECT id INTO v_assets FROM public.criterion
   WHERE context = 'launch' AND label = 'Supporting Assets delivered';
  IF v_assets IS NULL THEN
    INSERT INTO public.criterion
      (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
    VALUES
      ('Supporting Assets delivered',
       'Vignettes, demo video, and proof points handed to Sales Consultants / SEs. The SE reality-check is the earliest signal that the claims upstream are grounded.',
       'Enablement', false, 'TIER_1,TIER_2', 'launch', v_phase, 4, 14)
    RETURNING id INTO v_assets;
  END IF;

  -- Per-tier lead times, straight from the workback slide.
  --   T1 ~8wk (56d) -> Story 56, Msg 42, Enable 28, Camp 21, Assets 14
  --   T2 ~5wk (35d) -> Story 35, Msg 28, Enable 21,          Assets 14
  --   T3 ~2wk (14d) -> Story (light) 14 only; T3 ships as a release note, no beta.
  -- TIER_3 is carried for forward-compatibility: launches are only ever T1/T2
  -- (see src/types/launches.ts), but epics do have a TIER_3 and the deck
  -- specifies a T3 motion.
  UPDATE public.criterion SET
      phase = v_phase,
      tier_offset_days = '{"TIER_1": 56, "TIER_2": 35, "TIER_3": 14}'::jsonb,
      depends_on_criterion_id = NULL
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
      tier_offset_days = '{"TIER_1": 21}'::jsonb,
      depends_on_criterion_id = v_enable
    WHERE id = v_camp;

  -- Assets depends on Enablement, not Campaign: Campaign is Tier 1 only, so a
  -- Tier 2 launch would otherwise depend on a criterion it never instantiates.
  UPDATE public.criterion SET
      phase = v_phase,
      tier_offset_days = '{"TIER_1": 14, "TIER_2": 14}'::jsonb,
      depends_on_criterion_id = v_enable
    WHERE id = v_assets;
END $migration$;
