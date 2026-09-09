-- PaPriCo agenda defects found on the first live run (2026-09-18 meeting).
-- Spec: docs/PaPriCo-report-spec.md
--
-- Three schema-level fixes:
--   1. paprico_gating_criterion.tiers                   - per-criterion tier scope
--   2. paprico_gating_criterion.default_time_box_minutes - a time box for generated items
--   3. backfill of paprico_item.owner_email             - owner was never propagated
--
-- Deliberately NOT here: closing the release items that were already
-- materialized for out-of-tier epics. The tier column changes what future
-- computations generate; existing items keep their state so nothing a human
-- has looked at, deferred or decided on disappears underneath them. Clearing
-- the untouched ones is a separate, deliberate action (see the PR description).

-- ── 1. Per-criterion tier scope ─────────────────────────────────────────────
-- Materialization previously ignored tier entirely, so every gating criterion
-- pulled in Tier 3 work. The scope is per criterion, not one global floor:
-- "Commercialization" is plausibly worth watching at Tier 3, while the SVP
-- revenue-forecast review is not, and a single setting cannot say both.
ALTER TABLE public.paprico_gating_criterion
    ADD COLUMN IF NOT EXISTS tiers TEXT[] NOT NULL DEFAULT ARRAY['TIER_1', 'TIER_2']::TEXT[];

COMMENT ON COLUMN public.paprico_gating_criterion.tiers IS
    'Epic tiers this criterion pulls onto the agenda. An epic whose tier is not in this array (or is null) is skipped during materialization.';

-- Reject empty arrays: an empty scope reads as "all tiers" to a human and as
-- "no tiers" to the filter. Removing the criterion is how you turn it off.
ALTER TABLE public.paprico_gating_criterion
    DROP CONSTRAINT IF EXISTS paprico_gating_criterion_tiers_nonempty;
ALTER TABLE public.paprico_gating_criterion
    ADD CONSTRAINT paprico_gating_criterion_tiers_nonempty
    -- array_length() of an empty array is NULL, and a NULL CHECK passes, so the
    -- length has to be coalesced or the constraint silently allows '{}'.
    CHECK (COALESCE(array_length(tiers, 1), 0) >= 1);

-- ── 2. Default time box for generated items ─────────────────────────────────
-- Generated items were inserted with a null time_box_minutes, and the agenda
-- total counted nulls as zero -- 85 items reported as 52 minutes of a 90 minute
-- meeting. NULL still means "no default"; the agenda now reports how many items
-- are unbudgeted alongside the total.
ALTER TABLE public.paprico_gating_criterion
    ADD COLUMN IF NOT EXISTS default_time_box_minutes INTEGER;

COMMENT ON COLUMN public.paprico_gating_criterion.default_time_box_minutes IS
    'Time box (minutes) stamped onto release items generated for this criterion. NULL leaves the item unbudgeted.';

ALTER TABLE public.paprico_gating_criterion
    DROP CONSTRAINT IF EXISTS paprico_gating_criterion_default_time_box_range;
ALTER TABLE public.paprico_gating_criterion
    ADD CONSTRAINT paprico_gating_criterion_default_time_box_range
    CHECK (default_time_box_minutes IS NULL OR (default_time_box_minutes BETWEEN 1 AND 480));

-- ── 3. Backfill owner_email on existing release items ───────────────────────
-- loadAgendaInputs never selected epic_criterion_status.decision_owner_id, so
-- every generated item landed with a null owner. Same fallback chain the
-- service now uses: criterion decision owner -> epic owner -> null.
--
-- epic_criterion_status has no unique constraint on (epic_id, criterion_id),
-- so DISTINCT ON makes the choice deterministic: prefer a row that actually
-- carries a decision owner, then the most recently updated one.
UPDATE public.paprico_item AS target
SET owner_email = resolved.owner_email,
    updated_at = now()
FROM (
    SELECT DISTINCT ON (item.id)
           item.id,
           COALESCE(owner_user.email, epic.owner_email) AS owner_email
    FROM public.paprico_item AS item
    JOIN public.epic AS epic ON epic.id = item.epic_id
    LEFT JOIN public.epic_criterion_status AS ecs
           ON ecs.epic_id = item.epic_id
          AND ecs.criterion_id = item.criterion_id
    LEFT JOIN public.app_user AS owner_user ON owner_user.id = ecs.decision_owner_id
    WHERE item.source = 'release'
      AND item.owner_email IS NULL
      AND item.epic_id IS NOT NULL
      AND item.criterion_id IS NOT NULL
    ORDER BY item.id,
             (ecs.decision_owner_id IS NULL),
             ecs.last_updated_at DESC NULLS LAST
) AS resolved
WHERE target.id = resolved.id
  AND resolved.owner_email IS NOT NULL;
