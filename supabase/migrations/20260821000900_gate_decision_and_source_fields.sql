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
