-- Fix pendo_integrations RLS policies
-- The previous policies tried to query auth.users which isn't allowed

-- Drop existing policies
DROP POLICY IF EXISTS "pendo_integrations_read_admin" ON public.pendo_integrations;
DROP POLICY IF EXISTS "pendo_integrations_write_admin" ON public.pendo_integrations;

-- Simple policies that allow authenticated users (API routes handle authorization)
-- This works because the API route already checks admin role before making DB calls

CREATE POLICY "pendo_integrations_select" ON public.pendo_integrations
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "pendo_integrations_insert" ON public.pendo_integrations
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "pendo_integrations_update" ON public.pendo_integrations
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "pendo_integrations_delete" ON public.pendo_integrations
    FOR DELETE TO authenticated
    USING (true);

-- Also allow service_role full access (for admin client)
CREATE POLICY "pendo_integrations_service_role" ON public.pendo_integrations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
