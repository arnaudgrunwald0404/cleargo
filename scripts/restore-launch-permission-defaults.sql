-- Give the launch (GTM) side back to PMM.
--
-- app_settings.permissions had every launch-side capability narrowed to [CPO],
-- which reads as a deliberate rollout fence rather than seven separate
-- decisions. Effect in production:
--
--   capability                      DEFAULT_RULES                    override
--   launches.manage                 [PMM]                            [CPO]
--   launches.view                   [PMM, CPO, PRODUCT_OPS]          [CPO]
--   launchCriteria.create           [PMM, CPO, PRODUCT_OPS]          [CPO]
--   launchCriteria.update           [PMM, CPO, PRODUCT_OPS]          [CPO]
--   launchCriteria.delete           [PMM, CPO, PRODUCT_OPS]          [CPO]
--   launchCriteria.status.update    [PM,PMM,ENG,CPO,PRODUCT_OPS,PRODUCT] [CPO]
--   launchSchedule.manage           [PMM, CPO, PRODUCT_OPS]          [CPO]
--   launch.status.update            [PRODUCT_OPS, CPO]               []
--
-- DELETING the keys rather than rewriting them is deliberate. Effective rules
-- are {...DEFAULT_RULES, ...overrides}, so a removed key inherits the default --
-- and keeps inheriting when the default changes. Writing [PMM, CPO,
-- PRODUCT_OPS] back in as an override would freeze today's answer forever and
-- silently diverge from the code the next time someone edits permissions.ts.
--
-- The defaults already say exactly what is wanted, which is why there is
-- nothing to write.
--
-- NOT touched: launch.tier.update, launch.risk.update and launch.delete are
-- overridden WIDER than their defaults (the first two to all 15 roles). Those
-- are separate decisions and nobody is blocked by them, so they are left alone.
--
-- Alternative to running this: Settings -> Permissions in the admin UI, which
-- goes through validation and the gated PATCH endpoint. Requires
-- settings.update (PRODUCT_OPS, CPO, SUPERADMIN).

-- ---------------------------------------------------------------------------
-- STEP 1 -- Confirm what is there now. Read-only.
-- ---------------------------------------------------------------------------
SELECT key AS capability, value AS override_roles
FROM public.app_settings, jsonb_each(permissions)
WHERE id = 1
  AND key IN (
      'launches.manage',
      'launches.view',
      'launchCriteria.create',
      'launchCriteria.update',
      'launchCriteria.delete',
      'launchCriteria.status.update',
      'launchSchedule.manage',
      'launch.status.update'
  )
ORDER BY key;


-- ---------------------------------------------------------------------------
-- STEP 2 -- Drop them so they inherit the defaults. Transactional.
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE public.app_settings
SET permissions = permissions
        - 'launches.manage'
        - 'launches.view'
        - 'launchCriteria.create'
        - 'launchCriteria.update'
        - 'launchCriteria.delete'
        - 'launchCriteria.status.update'
        - 'launchSchedule.manage'
        - 'launch.status.update',
    updated_at = now()
WHERE id = 1;

-- Expect 1. Then COMMIT.
COMMIT;


-- ---------------------------------------------------------------------------
-- STEP 3 -- Verify. Should return no rows.
-- ---------------------------------------------------------------------------
SELECT key AS still_overridden
FROM public.app_settings, jsonb_each(permissions)
WHERE id = 1
  AND key LIKE 'launch%'
  AND key NOT IN ('launch.tier.update', 'launch.risk.update', 'launch.delete');


-- ---------------------------------------------------------------------------
-- STEP 4 -- What remains overridden on the launch side, for the record.
-- These are all WIDER than default and were left deliberately.
-- ---------------------------------------------------------------------------
SELECT key AS capability, value AS override_roles
FROM public.app_settings, jsonb_each(permissions)
WHERE id = 1
  AND key IN ('launch.tier.update', 'launch.risk.update', 'launch.delete')
ORDER BY key;
