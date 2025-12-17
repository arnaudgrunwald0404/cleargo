-- Add INSERT policy for app_settings to allow upsert operations
-- This is needed because the settings update uses upsert which requires INSERT permission
-- Note: Role-based access control is enforced at the application layer (API routes check for
-- SUPERADMIN, PRODUCT_OPS, or CPO roles). This policy matches the existing UPDATE policy pattern.

DROP POLICY IF EXISTS "Authenticated users can insert app_settings" ON app_settings;
CREATE POLICY "Authenticated users can insert app_settings" ON app_settings 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

