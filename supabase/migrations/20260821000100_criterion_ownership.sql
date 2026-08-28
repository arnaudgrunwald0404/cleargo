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
