-- Grant table privileges so the authenticated role (and service_role) can access epic_success_configs.
-- Required when the table was created by the bootstrap migration, which does not run GRANT.
-- Idempotent; safe to run even if privileges were already granted.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_success_configs TO authenticated;
GRANT ALL ON public.epic_success_configs TO service_role;
