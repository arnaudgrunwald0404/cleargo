-- Allow super admins to update any feedback (e.g. status), not only their own.
-- Existing "Allow update own feedback" stays for creators; this adds superadmin.

CREATE POLICY "Allow super admins to update feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_user
      WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
        AND roles @> ARRAY['SUPERADMIN']::text[]
    )
  );
