-- Create pendo_integrations table if it doesn't exist
-- This table stores the Pendo API integration configuration

CREATE TABLE IF NOT EXISTS public.pendo_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_encrypted TEXT NOT NULL,
    environment TEXT DEFAULT 'prod' CHECK (environment IN ('prod', 'dev', 'staging')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disabled')),
    last_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pendo_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pendo_integrations (admin only)
DO $$ 
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "pendo_integrations_read_admin" ON public.pendo_integrations;
    DROP POLICY IF EXISTS "pendo_integrations_write_admin" ON public.pendo_integrations;
    DROP POLICY IF EXISTS "Allow read access to admins" ON public.pendo_integrations;
    DROP POLICY IF EXISTS "Allow write access to admins" ON public.pendo_integrations;
EXCEPTION WHEN OTHERS THEN
    -- Ignore errors from dropping non-existent policies
    NULL;
END $$;

-- Read policy - admins only
CREATE POLICY "pendo_integrations_read_admin" ON public.pendo_integrations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.app_user u
            WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
            AND u.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
        )
    );

-- Write policy - admins only  
CREATE POLICY "pendo_integrations_write_admin" ON public.pendo_integrations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.app_user u
            WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
            AND u.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
        )
    );

-- Grant permissions
GRANT ALL ON public.pendo_integrations TO authenticated;
GRANT ALL ON public.pendo_integrations TO service_role;

-- Add comment
COMMENT ON TABLE public.pendo_integrations IS 'Pendo API integration configuration';
