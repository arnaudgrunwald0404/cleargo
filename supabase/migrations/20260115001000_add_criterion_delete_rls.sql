-- Allow admin roles to delete criteria (criterion)
-- Fixes: UI delete succeeded locally but did not persist due to missing RLS DELETE policy.

DROP POLICY IF EXISTS "Allow delete access to admins" ON public.criterion;
CREATE POLICY "Allow delete access to admins" ON public.criterion
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_user
      WHERE LOWER(email) = LOWER(auth.jwt()->>'email')
        AND (
          roles @> ARRAY['PRODUCT_OPS']::text[]
          OR roles @> ARRAY['CPO']::text[]
          OR roles @> ARRAY['SUPERADMIN']::text[]
        )
    )
  );

