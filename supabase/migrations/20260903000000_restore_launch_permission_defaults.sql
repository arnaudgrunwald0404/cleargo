-- Give the launch (GTM) side back to PMM.
--
-- app_settings.permissions had every launch-side capability narrowed to [CPO],
-- which reads as a rollout fence rather than seven separate decisions:
--
--   capability                     DEFAULT_RULES                          override
--   launches.manage                [PMM]                                  [CPO]
--   launches.view                  [PMM, CPO, PRODUCT_OPS]                [CPO]
--   launchCriteria.create          [PMM, CPO, PRODUCT_OPS]                [CPO]
--   launchCriteria.update          [PMM, CPO, PRODUCT_OPS]                [CPO]
--   launchCriteria.delete          [PMM, CPO, PRODUCT_OPS]                [CPO]
--   launchCriteria.status.update   [PM,PMM,ENG,CPO,PRODUCT_OPS,PRODUCT]   [CPO]
--   launchSchedule.manage          [PMM, CPO, PRODUCT_OPS]                [CPO]
--   launch.status.update           [PRODUCT_OPS, CPO]                     []
--
-- PMM should be managing launches, so these come off.
--
-- DELETING the keys rather than rewriting them is the point. Effective rules
-- are {...DEFAULT_RULES, ...overrides} (getEffectivePermissionRules in
-- src/lib/settings-db.ts), so a removed key inherits the default -- and keeps
-- inheriting when the default changes. Writing [PMM, CPO, PRODUCT_OPS] back in
-- as an override would freeze today's answer and silently diverge from
-- src/lib/permissions.ts the next time someone edits it. The defaults already
-- say exactly what is wanted, which is why nothing is written.
--
-- NOT touched: launch.tier.update and launch.risk.update are overridden to all
-- 15 roles and launch.delete adds LEARNING. Those are WIDER than default,
-- nobody is blocked by them, and narrowing them is a separate decision.
--
-- Idempotent: the jsonb `-` operator on an absent key is a no-op, so this is
-- safe to replay and safe in an environment that never had the overrides.

UPDATE public.app_settings
SET permissions = COALESCE(permissions, '{}'::jsonb)
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
