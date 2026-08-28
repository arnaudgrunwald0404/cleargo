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
