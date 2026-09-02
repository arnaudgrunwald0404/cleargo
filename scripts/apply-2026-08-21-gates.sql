-- ClearGO · gates, ownership, and criterion placement
-- Generated bundle of supabase/migrations/20260821*.sql, in order.
-- Paste into the Supabase SQL editor: migrations are not auto-applied on deploy.
-- Safe to re-run (idempotent guards throughout).

-- ============================================================
-- 20260821000000_launch_criterion_not_applicable.sql
-- ============================================================
-- Allow NOT_APPLICABLE on a launch checklist row.
--
-- WHY: the Beta proof gate is "if applicable" (Kristin's 00 Launch Gate
-- Checklist, Gate 3 — it only applies to capabilities that run a design-partner
-- beta). Today that is harmless because the row is gate=false with no date and
-- nothing depending on it, so it is inert. The moment it becomes a real gate
-- with dependents, every capability WITHOUT a beta would carry a permanently
-- unclearable gate sitting in front of product enablement.
--
-- launch_asset already has this fourth state (20260819010000); the checklist
-- never got it. Same four values, so the two tables now agree.
--
-- The original CHECK in 20260314000001 was declared inline and unnamed, so
-- Postgres auto-named it. Resolve the name from the catalog rather than assuming
-- it, because a table repaired by hand may carry a different one.

DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'launch_criterion_status'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) LIKE '%NOT_STARTED%'
   LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.launch_criterion_status DROP CONSTRAINT %I',
      v_name
    );
  END IF;
END $$;

ALTER TABLE public.launch_criterion_status
  ADD CONSTRAINT launch_criterion_status_status_check
  CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE'));

-- ============================================================
-- 20260821000100_criterion_ownership.sql
-- ============================================================
-- Ownership and equivalence on `criterion`.
--
-- Four gaps this closes, all found while reconciling Kristin's 00 Launch Gate
-- Checklist against what ClearGO can actually store:
--
-- 1. decision_owner_role — src/types/criteria.ts has defined DecisionOwnerRole
--    with 14 roles since the beginning, but no column ever existed to hold it.
--    src/lib/services/analyticsService.ts selects and filters on it, which means
--    that query has always 400'd; because only `data` is destructured and never
--    `error`, the failure is silent and the branch just returns nothing.
--
-- 2. required_signoff_roles — the checklist requires two or three co-signers per
--    gate (Gate 1: PMM + CPO · Gate 2: CPO + RevOps · Gate 3: PMM + Product + SE
--    lead). A single decision_owner_email cannot express that.
--
-- 3. equivalent_criterion_id — nothing relates a launch criterion to its release
--    counterpart, so `Overall Support Signoff` (Epic) and `Sign-off: Support`
--    (Launch) are joined only by having similar words in them.
--
-- 4. is_derived — marks a row whose status is computed from elsewhere rather than
--    answered here. Used for the eight launch sign-offs that roll up from the
--    epic matrix.

ALTER TABLE public.criterion
  ADD COLUMN IF NOT EXISTS decision_owner_role   TEXT,
  ADD COLUMN IF NOT EXISTS required_signoff_roles TEXT[],
  ADD COLUMN IF NOT EXISTS equivalent_criterion_id UUID
    REFERENCES public.criterion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_derived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_by_criterion_id UUID
    REFERENCES public.criterion(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.criterion.decision_owner_role IS
  'Accountable function (DecisionOwnerRole in src/types/criteria.ts). Distinct from decision_owner_email, which names a person.';
COMMENT ON COLUMN public.criterion.required_signoff_roles IS
  'Roles that must each sign before this gate clears. Recorded per launch in launch_criterion_signoff.';
COMMENT ON COLUMN public.criterion.equivalent_criterion_id IS
  'The same question asked in the other context, so a launch row can derive from its epic counterpart.';
COMMENT ON COLUMN public.criterion.is_derived IS
  'Unused. Derived sign-offs were removed 2026-08-21: a launch requires explicit action, not a status inherited from its epics.';
-- depends_on_criterion_id is the runway SEQUENCE: it drives due dates (a row is
-- due when its successor starts) and the "your predecessor is delivered" message.
-- blocked_by is the HARD gate, which is a different relation. Gate 2 needs both:
-- the doc says an unresolved pricing gate "may enter the Story Brief for
-- alignment, but cannot reach field enablement or GTM" — so pricing sequences
-- ahead of the Story Brief while genuinely blocking Field Enablement.
COMMENT ON COLUMN public.criterion.blocked_by_criterion_id IS
  'Hard blocker, distinct from the depends_on sequence: this row cannot clear until the referenced gate does.';

CREATE INDEX IF NOT EXISTS idx_criterion_equivalent
  ON public.criterion (equivalent_criterion_id)
  WHERE equivalent_criterion_id IS NOT NULL;

-- Backfill the role from the placeholder owner strings already in use, so the
-- new column is not empty on day one. These placeholders are resolved to a real
-- person at instantiation (resolveCriterionOwner in src/lib/launchCriteria.ts);
-- the role is the durable half of that intent.
UPDATE public.criterion
   SET decision_owner_role = 'PM'
 WHERE decision_owner_role IS NULL
   AND decision_owner_email = '[name of pod''s product manager]';

UPDATE public.criterion
   SET decision_owner_role = 'PMM'
 WHERE decision_owner_role IS NULL
   AND default_owner_email = '[launch owner (PMM)]';

-- ============================================================
-- 20260821000200_create_criterion_items.sql
-- ============================================================
-- Gate checklist items as first-class records.
--
-- A gate in ClearGO is one row with one owner and one status. A gate in Kristin's
-- 00 Launch Gate Checklist is a set of checklist items, each naturally owned by a
-- different function, signed off as a whole by two or three co-signers.
--
-- "Beta proof gate passed" is the clearest case: one checkbox standing in for
-- five items owned by five different functions — PM (entry conditions), SE lead
-- (claims hold up live), UX/Research (adoption is real), PMM (the story lands),
-- and RevOps (net-new motion sequenced).
--
-- Modelled as its own table rather than as `parent_criterion_id` on `criterion`
-- so that readiness scoring, notifications, and gatesTotal keep seeing three gate
-- rows instead of twenty. The gate keeps a single status; it is now DERIVED from
-- its items (gateStatusFromItems in src/lib/launchCriteria.ts).
--
-- Mirrors the template/instance split already used twice in this schema —
-- criterion/launch_criterion_status and launch_asset_template/launch_asset — so a
-- later template rename never rewrites the history of a shipped launch.
--
-- NOTE ON GRANTS: 20260717000000 had to repair the launch tables, which were
-- created without role grants and returned 42501 on every request. Both tables
-- below are granted at creation so that cannot recur.

CREATE TABLE IF NOT EXISTS public.criterion_item (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id        UUID NOT NULL REFERENCES public.criterion(id) ON DELETE CASCADE,
  item_key            TEXT NOT NULL UNIQUE,
  label               TEXT NOT NULL,
  description         TEXT,
  -- Accountable function, from DecisionOwnerRole in src/types/criteria.ts.
  owner_role          TEXT,
  default_owner_email TEXT,
  -- An item that may legitimately not apply to a given launch.
  optional            BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_criterion_item_criterion
  ON public.criterion_item (criterion_id, sort_order);

CREATE TABLE IF NOT EXISTS public.launch_criterion_item (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id       UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES public.criterion_item(id) ON DELETE CASCADE,
  -- Copied at instantiation, not joined, for the same reason launch_asset copies
  -- its label: renaming a template must not relabel shipped launches.
  label           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'NOT_STARTED'
                    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE')),
  owner_email     TEXT,
  notes           TEXT,
  -- The checklist's SOURCE OF TRUTH lines, same shape as launch_criterion_status.links.
  links           JSONB DEFAULT '[]'::jsonb,
  optional        BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  last_updated_by UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (launch_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_launch_criterion_item_launch
  ON public.launch_criterion_item (launch_id);
CREATE INDEX IF NOT EXISTS idx_launch_criterion_item_status
  ON public.launch_criterion_item (launch_id, status);

ALTER TABLE public.criterion_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_criterion_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ci_select_authenticated" ON public.criterion_item;
CREATE POLICY "ci_select_authenticated" ON public.criterion_item
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ci_write_authenticated" ON public.criterion_item;
CREATE POLICY "ci_write_authenticated" ON public.criterion_item
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lci_select_authenticated" ON public.launch_criterion_item;
CREATE POLICY "lci_select_authenticated" ON public.launch_criterion_item
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lci_write_authenticated" ON public.launch_criterion_item;
CREATE POLICY "lci_write_authenticated" ON public.launch_criterion_item
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.criterion_item       TO anon, authenticated, service_role;
GRANT ALL ON public.launch_criterion_item TO anon, authenticated, service_role;

-- ============================================================
-- 20260821000300_create_launch_criterion_signoff.sql
-- ============================================================
-- Co-signatures on a gate.
--
-- Every gate in the 00 Launch Gate Checklist ends with a signature block naming
-- two or three functions and leaving space for a name and a date:
--
--   Gate 1  Sign-off — PMM + CPO
--   Gate 2  Sign-off — CPO + RevOps
--   Gate 3  Sign-off — PMM + Product + SE lead
--
-- ClearGO stores one decision_owner per criterion, so "both signed" has never
-- been representable. That is the schema half of Akram's point about ownership
-- being unclear when multiple stakeholders are involved — no amount of filling in
-- existing fields fixes it.
--
-- One row per (launch, criterion, role): the roles required are declared on the
-- criterion (required_signoff_roles) and satisfied here.

CREATE TABLE IF NOT EXISTS public.launch_criterion_signoff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id     UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,
  criterion_id  UUID NOT NULL REFERENCES public.criterion(id) ON DELETE CASCADE,
  -- The role being satisfied, from criterion.required_signoff_roles.
  role          TEXT NOT NULL,
  signer_user_id UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  -- Kept alongside the FK because the checklist records a typed name, and a
  -- signature should survive the signer later leaving.
  signer_name   TEXT,
  signer_email  TEXT,
  signed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT,
  UNIQUE (launch_id, criterion_id, role)
);

CREATE INDEX IF NOT EXISTS idx_launch_criterion_signoff_launch
  ON public.launch_criterion_signoff (launch_id, criterion_id);

ALTER TABLE public.launch_criterion_signoff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lcso_select_authenticated" ON public.launch_criterion_signoff;
CREATE POLICY "lcso_select_authenticated" ON public.launch_criterion_signoff
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lcso_write_authenticated" ON public.launch_criterion_signoff;
CREATE POLICY "lcso_write_authenticated" ON public.launch_criterion_signoff
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.launch_criterion_signoff TO anon, authenticated, service_role;

-- ============================================================
-- 20260821000400_seed_gate_items.sql
-- ============================================================
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

-- ============================================================
-- 20260821000500_beta_midrunway_and_split.sql
-- ============================================================
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

-- ============================================================
-- 20260821000600_retire_legacy_launch_criteria.sql
-- ============================================================
-- Retire the pre-workback launch checklist, and the two duplicate asset rows.
--
-- A row-by-row pass over all 145 criteria (74 release + 60 launch + 11 assets)
-- found the Launch checklist carrying the wrong altitude of question. The Phase
-- 1-6 rows predate the workback model and ask per-FEATURE questions at
-- BUNDLE level: with four epics on one launch, "Deliver setup & configuration
-- guide" has no single answer. Most of them are also already answered somewhere:
--
--   22 rows are a section of an artifact or a row in the asset table
--      ("Draft product positioning statement" is a Message Brief section;
--       "Launch blog / feature spotlight" is the Blog Post asset)
--    9 rows are per-feature questions the Epic matrix already asks
--      ("Deliver self-service docs & FAQs" = Support Tools & Documentation)
--    2 rows are fields pretending to be tasks
--      ("Determine launch tier" is launch.tier)
--
-- The 8 "Sign-off: X" rows are deliberately NOT retired here — they stay active
-- and become derived roll-ups of the Epic matrix (20260821000700).
--
-- Nothing is deleted. is_active = false keeps the history of shipped launches
-- readable; the read paths now filter on it (src/app/api/launches/[id]/route.ts),
-- which they did not before — the column was selected and never used.

-- 44 legacy launch criteria: everything outside Phase 00 / Phase 01 except the
-- sign-offs, which have their own fate.
UPDATE public.criterion
   SET is_active = false
 WHERE context = 'launch'
   AND phase NOT LIKE 'Phase 0%'
   AND label NOT LIKE 'Sign-off:%';

-- The four release criteria that genuinely belong to the Launch. They need no new
-- launch rows: "Website / product page live" and "Activate growth campaign"
-- already exist there, and Sales Collateral / Sales Materials are covered by the
-- "Sales Talk Track Update" asset. So these are deactivations only.
--
-- Each fails the placement test — "if this epic never gets a launch, does the
-- question still need an answer?" — where the other 70 release criteria pass it.
-- Note that "Launch Campaign (if applicable)" carries its own hedge in the label,
-- which is what a per-epic matrix looks like when the question is not per-epic.
UPDATE public.criterion
   SET is_active = false
 WHERE context = 'release'
   AND label IN (
     'Sales Collateral',
     'Website/Landing Pages',
     'Launch Campaign (if applicable)',
     'Sales Materials'
   );

-- The two asset rows that are the same documents as the Phase 01 artifacts.
-- "Launch Brief" is described in its own seed as "The Campaign Brief itself", and
-- the Field Enablement Guide asset carries text identical to the Enablement Brief
-- criterion. Since the Assets tab now lists the five artifacts above the
-- supporting assets, these two rendered twice on one screen.
UPDATE public.launch_asset_template
   SET is_active = false
 WHERE asset_key IN ('launch_brief', 'field_enablement_guide');

-- Deactivating a template does not touch rows already instantiated on a launch,
-- so close those out explicitly rather than leaving them permanently unticked.
UPDATE public.launch_asset a
   SET status = 'NOT_APPLICABLE',
       notes = COALESCE(NULLIF(a.notes, '') || ' | ', '')
               || 'Superseded 2026-08-21: tracked as a Phase 01 artifact instead.'
  FROM public.launch_asset_template t
 WHERE a.template_id = t.id
   AND t.asset_key IN ('launch_brief', 'field_enablement_guide')
   AND a.status <> 'NOT_APPLICABLE';

-- ============================================================
-- 20260821000900_gate_decision_and_source_fields.sql
-- ============================================================
-- DECISION OF RECORD and SOURCE OF TRUTH as typed gate items.
--
-- v2 of the 00 Launch Gate Checklist added two blocks to every gate that v1 did
-- not have, and they are the reason the doc exists in the form it does:
--
--   DECISION OF RECORD  "the actual answer, captured here so a reader sees what
--                        was signed, not just that it was signed"
--   SOURCE OF TRUTH     "link the authoritative artifact for each item so the
--                        current version is always one click away"
--
-- Both are LABELLED slots. Collapsing them into one freeform notes box and one
-- unlabelled link array — which is what the first cut of this work did — throws
-- away the labels, and without the labels a reader cannot tell which answer they
-- are looking at. So they become items too, distinguished by `kind`:
--
--   check     a ☐ line. These are what clear the gate.
--   decision  a named answer, recorded in launch_criterion_item.notes
--   source    a named link, recorded in launch_criterion_item.links
--
-- Only `check` items gate the status (see gateStatusFromItems), because each
-- gate's own CLEARS WHEN clause is written in terms of the checkboxes. The
-- decision and source rows document the answer rather than deciding it.

ALTER TABLE public.criterion_item
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'check'
    CHECK (kind IN ('check', 'decision', 'source'));

COMMENT ON COLUMN public.criterion_item.kind IS
  'check = a checklist line that gates clearance; decision = a named DECISION OF RECORD answer; source = a named SOURCE OF TRUTH link.';

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
    RAISE EXCEPTION 'Commercialization gates not found; run 20260821000400_seed_gate_items.sql first';
  END IF;

  -- Sort orders start at 100 (decision) and 200 (source) so the checkboxes,
  -- which are 0-6, always render first without renumbering them.
  INSERT INTO public.criterion_item
    (criterion_id, item_key, label, description, kind, owner_role, sort_order)
  VALUES
    -- ---------------- GATE 1 · naming ----------------
    (v_gate1, 'gate1_dec_name',    'Approved name (or "no name" + rationale)',
     'A no-name outcome is a valid, recorded result — say which and why.', 'decision', 'PMM', 100),
    (v_gate1, 'gate1_dec_class',   'Classification & name type',
     'Enhancement / net-new / cross-module differentiator, and rename / feature-in-package / new product.', 'decision', 'PMM', 101),
    (v_gate1, 'gate1_dec_pricelist','Where it maps on the price list / sales structure',
     'The name must never imply packaging that does not exist.', 'decision', 'REV_OPS', 102),
    (v_gate1, 'gate1_src_cleargo', 'ClearGo listing (record ID)',
     'The launch record itself. Kept for parity with the paper checklist.', 'source', 'PMM', 200),
    (v_gate1, 'gate1_src_approval','Naming decision / Gate 1 approval',
     NULL, 'source', 'PMM', 201),
    (v_gate1, 'gate1_src_pricelist','Price-list entry',
     NULL, 'source', 'REV_OPS', 202),

    -- ---------------- GATE 2 · pricing ----------------
    (v_gate2, 'gate2_dec_model',   'Final pricing model (and status: stable / in-flight)',
     'A live price with a moving structure does not clear this gate.', 'decision', 'CPO', 100),
    (v_gate2, 'gate2_dec_existing','Packaging treatment — existing customers (migration path)',
     NULL, 'decision', 'REV_OPS', 101),
    (v_gate2, 'gate2_dec_netnew',  'Packaging treatment — net-new (target model)',
     NULL, 'decision', 'REV_OPS', 102),
    (v_gate2, 'gate2_dec_case',    'Business case / forecast reference',
     NULL, 'decision', 'CPO', 103),
    (v_gate2, 'gate2_src_cleargo', 'ClearGo listing (record ID)',
     NULL, 'source', 'CPO', 200),
    (v_gate2, 'gate2_src_model',   'Pricing model / business case',
     NULL, 'source', 'CPO', 201),
    (v_gate2, 'gate2_src_legal',   'Order-form & legal language',
     NULL, 'source', 'LEGAL', 202),
    (v_gate2, 'gate2_src_crm',     'Price-list / CRM sign-off',
     NULL, 'source', 'REV_OPS', 203),

    -- ---------------- GATE 3 · beta proof ----------------
    (v_gate3, 'gate3_dec_partners','Design partners & success criteria (as agreed up front)',
     'Agreed up front, not reconstructed afterwards.', 'decision', 'PM', 100),
    (v_gate3, 'gate3_dec_claims',  'What the beta proved — claims that held up',
     'No claim reaches enablement unless beta proved it.', 'decision', 'SE', 101),
    (v_gate3, 'gate3_dec_adoption','Adoption / usage evidence',
     'Partners hit the intended workflow, not just switched it on.', 'decision', 'UX', 102),
    (v_gate3, 'gate3_dec_refs',    'References & vignettes captured',
     'Their language and outcomes, in their words.', 'decision', 'PMM', 103),
    (v_gate3, 'gate3_src_readout', 'Beta results / readout',
     NULL, 'source', 'PM', 200),
    (v_gate3, 'gate3_src_claims',  'Claims register',
     NULL, 'source', 'PMM', 201),
    (v_gate3, 'gate3_src_usage',   'Usage / engagement data',
     NULL, 'source', 'UX', 202),
    (v_gate3, 'gate3_src_library', 'Reference & vignette library',
     NULL, 'source', 'PMM', 203)
  ON CONFLICT (item_key) DO NOTHING;
END $$;

-- ============================================================
-- 20260821001000_backfill_launch_criterion_items.sql
-- ============================================================
-- Backfill gate items onto launches that already exist.
--
-- Items instantiate at launch creation (src/app/api/launches/route.ts), so
-- without this the launches created before today would carry the three gates with
-- no items inside them — which looks exactly like the feature not working.
--
-- Tier filtering mirrors launchCriterionApplies(): 'ALL' applies to everything,
-- otherwise the launch tier must appear in the comma-separated list, and a launch
-- with no tier set gets the full battery because there is nothing to filter on.
--
-- Idempotent: UNIQUE (launch_id, item_id) plus the NOT EXISTS guard, so re-running
-- adds only what is genuinely missing.

INSERT INTO public.launch_criterion_item
  (launch_id, item_id, label, status, owner_email, optional, sort_order)
SELECT
  l.id,
  ci.id,
  ci.label,
  'NOT_STARTED',
  -- NOT defaulted to the launch owner: an item belongs to a function, so an
  -- unassigned one shows its role until a real person takes it.
  CASE
    WHEN ci.default_owner_email IS NULL THEN NULL
    WHEN ci.default_owner_email LIKE '[%' THEN NULL
    ELSE ci.default_owner_email
  END,
  ci.optional,
  ci.sort_order
FROM public.launch l
JOIN public.launch_criterion_status lcs ON lcs.launch_id = l.id
JOIN public.criterion_item ci ON ci.criterion_id = lcs.criterion_id
JOIN public.criterion c ON c.id = ci.criterion_id
WHERE ci.is_active = true
  AND c.is_active = true
  AND (
    c.tier_applicability = 'ALL'
    OR l.tier IS NULL
    OR l.tier = ANY (string_to_array(replace(c.tier_applicability, ' ', ''), ','))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.launch_criterion_item existing
     WHERE existing.launch_id = l.id
       AND existing.item_id = ci.id
  );

-- ============================================================
-- 20260821001100_adhoc_rows_and_asset_tiers.sql
-- ============================================================
-- One-off rows inside a launch, and assets that actually respect tier.
--
-- THREE GAPS THIS CLOSES
--
-- 1. Ad-hoc checklist rows and gate items were impossible. launch_asset has
--    always allowed them (template_id nullable, label copied), but
--    launch_criterion_status.criterion_id and launch_criterion_item.item_id are
--    NOT NULL, so the only way to add a one-off row to a single launch was to add
--    a template row and change it for every launch. These columns become nullable
--    with a local label, exactly the shape launch_asset already uses.
--
-- 2. Assets ignored tier entirely. All eleven templates were seeded
--    tier_applicability = 'ALL', so launchCriterionApplies() had nothing to filter
--    on. They become 'TIER_1,TIER_2' because that is derivable rather than
--    invented: a Tier 3 capability runs the commercialization gates and a Story
--    Brief and stops (see the tier_offset_days set in 20260821000500), and every
--    asset sits downstream of "Supporting Assets delivered", which is itself
--    TIER_1,TIER_2. The finer Tier 1 vs Tier 2 split is a content decision and is
--    left to the new admin screen rather than guessed at here.
--
-- 3. NOT_APPLICABLE was gated by the `optional` flag rather than by role. Marking
--    a row N/A is now a permission (launch.markNotApplicable, PMM + SUPERADMIN),
--    so `optional` goes back to being a hint about which rows commonly do not
--    apply, not a lock on who may say so.

-- ---------------------------------------------------------------------------
-- 1. Ad-hoc rows
-- ---------------------------------------------------------------------------
ALTER TABLE public.launch_criterion_status
  ALTER COLUMN criterion_id DROP NOT NULL;

-- Local label for a row with no template behind it. Templated rows leave this
-- null and keep reading through the criterion join, so nothing existing changes.
ALTER TABLE public.launch_criterion_status
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS gate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phase TEXT;

COMMENT ON COLUMN public.launch_criterion_status.label IS
  'Set only for ad-hoc rows (criterion_id null). Templated rows read their label through the criterion join.';

-- Postgres treats NULLs as distinct in a unique index, so UNIQUE (launch_id,
-- criterion_id) keeps preventing a templated criterion being instantiated twice
-- while allowing any number of ad-hoc rows per launch. Same trick launch_asset
-- relies on.

ALTER TABLE public.launch_criterion_item
  ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE public.launch_criterion_item
  ADD COLUMN IF NOT EXISTS criterion_id UUID
    REFERENCES public.criterion(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS owner_role TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'check'
    CHECK (kind IN ('check', 'decision', 'source'));

-- An ad-hoc item has no template to hang off, so it needs to know which gate it
-- belongs to directly. Backfill the templated rows so every item can be grouped
-- by criterion_id without a join.
UPDATE public.launch_criterion_item lci
   SET criterion_id = ci.criterion_id,
       owner_role   = COALESCE(lci.owner_role, ci.owner_role),
       kind         = COALESCE(NULLIF(lci.kind, ''), ci.kind)
  FROM public.criterion_item ci
 WHERE lci.item_id = ci.id
   AND lci.criterion_id IS DISTINCT FROM ci.criterion_id;

COMMENT ON COLUMN public.launch_criterion_item.criterion_id IS
  'The gate this item belongs to. Denormalised from criterion_item so ad-hoc items (item_id null) can be grouped the same way.';

-- ---------------------------------------------------------------------------
-- 2. Assets respect tier
-- ---------------------------------------------------------------------------
UPDATE public.launch_asset_template
   SET tier_applicability = 'TIER_1,TIER_2'
 WHERE tier_applicability = 'ALL';

-- ============================================================
-- 20260821001200_explicit_launches_and_check_only_items.sql
-- ============================================================
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

