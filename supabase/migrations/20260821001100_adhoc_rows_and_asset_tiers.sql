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
