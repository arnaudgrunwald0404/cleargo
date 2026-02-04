-- Fix Supabase database linter findings:
-- 1. Drop duplicate indexes
-- 2. Auth RLS initplan: wrap auth.uid(), auth.jwt(), auth.role() in (select ...)
-- 3. Multiple permissive policies: change "Allow write access to ..." from FOR ALL to FOR INSERT, UPDATE, DELETE

-- =============================================================================
-- 1. Drop duplicate indexes
-- =============================================================================
DROP INDEX IF EXISTS idx_criterion_comment_status;
DROP INDEX IF EXISTS idx_epic_aha_id_not_null;

-- =============================================================================
-- 2. Auth RLS initplan + 3. Multiple permissive (combined where applicable)
-- =============================================================================

-- ---------- criterion: "Allow delete access to admins" (auth wrap only)
DROP POLICY IF EXISTS "Allow delete access to admins" ON public.criterion;
CREATE POLICY "Allow delete access to admins" ON public.criterion
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
        AND (
          roles @> ARRAY['PRODUCT_OPS']::text[]
          OR roles @> ARRAY['CPO']::text[]
          OR roles @> ARRAY['SUPERADMIN']::text[]
        )
    )
  );

-- ---------- feedback: "Allow update own feedback", "Allow delete own feedback"
DROP POLICY IF EXISTS "Allow update own feedback" ON public.feedback;
CREATE POLICY "Allow update own feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (
    created_by_id IN (
      SELECT id FROM app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "Allow delete own feedback" ON public.feedback;
CREATE POLICY "Allow delete own feedback" ON public.feedback
  FOR DELETE TO authenticated
  USING (
    created_by_id IN (
      SELECT id FROM app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- ---------- criterion_attachment
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON criterion_attachment;
CREATE POLICY "Authenticated users can upload attachments"
  ON criterion_attachment FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their own attachments" ON criterion_attachment;
CREATE POLICY "Users can delete their own attachments"
  ON criterion_attachment FOR DELETE
  USING (uploaded_by IN (
    SELECT id FROM app_user WHERE email = (select auth.jwt())->>'email'
  ));

-- ---------- criterion_comment
DROP POLICY IF EXISTS "Authenticated users can create comments" ON criterion_comment;
CREATE POLICY "Authenticated users can create comments"
  ON criterion_comment FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their own comments" ON criterion_comment;
CREATE POLICY "Users can delete their own comments"
  ON criterion_comment FOR DELETE
  USING (created_by IN (
    SELECT id FROM app_user WHERE email = (select auth.jwt())->>'email'
  ));

-- ---------- epic_success_metric_history: "Allow write access to PMs and admins" (INSERT only, auth wrap)
DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.epic_success_metric_history;
CREATE POLICY "Allow write access to PMs and admins" ON public.epic_success_metric_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

-- ---------- success_metrics: auth wrap + separate INSERT/UPDATE/DELETE (fix multiple permissive)
DROP POLICY IF EXISTS "Allow write access to admins" ON public.success_metrics;
CREATE POLICY "Allow insert access to admins" ON public.success_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );
CREATE POLICY "Allow update access to admins" ON public.success_metrics
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );
CREATE POLICY "Allow delete access to admins" ON public.success_metrics
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );

-- ---------- epic_success_configs: auth wrap + separate INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.epic_success_configs;
CREATE POLICY "Allow insert access to PMs and admins" ON public.epic_success_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );
CREATE POLICY "Allow update access to PMs and admins" ON public.epic_success_configs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );
CREATE POLICY "Allow delete access to PMs and admins" ON public.epic_success_configs
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

-- ---------- epic_success_metrics: auth wrap + separate INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.epic_success_metrics;
CREATE POLICY "Allow insert access to PMs and admins" ON public.epic_success_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );
CREATE POLICY "Allow update access to PMs and admins" ON public.epic_success_metrics
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );
CREATE POLICY "Allow delete access to PMs and admins" ON public.epic_success_metrics
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

-- ---------- pendo_integrations: "Allow read access to admins" (auth wrap) + "Allow write access to admins" (auth wrap + FOR INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Allow read access to admins" ON public.pendo_integrations;
CREATE POLICY "Allow read access to admins" ON public.pendo_integrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );

DROP POLICY IF EXISTS "Allow write access to admins" ON public.pendo_integrations;
CREATE POLICY "Allow insert access to admins" ON public.pendo_integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );
CREATE POLICY "Allow update access to admins" ON public.pendo_integrations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );
CREATE POLICY "Allow delete access to admins" ON public.pendo_integrations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (roles @> ARRAY['PRODUCT_OPS']::text[] OR roles @> ARRAY['CPO']::text[] OR roles @> ARRAY['SUPERADMIN']::text[])
    )
  );

-- ---------- epic_retros: auth wrap + separate INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.epic_retros;
CREATE POLICY "Allow insert access to PMs and admins" ON public.epic_retros
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );
CREATE POLICY "Allow update access to PMs and admins" ON public.epic_retros
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );
CREATE POLICY "Allow delete access to PMs and admins" ON public.epic_retros
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE email = (select auth.jwt())->>'email'
      AND (
        roles @> ARRAY['PM']::text[]
        OR roles @> ARRAY['PRODUCT_OPS']::text[]
        OR roles @> ARRAY['CPO']::text[]
        OR roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

-- ---------- launch_stages: separate INSERT/UPDATE/DELETE (no auth in expression)
DROP POLICY IF EXISTS "Allow write access to authenticated users" ON public.launch_stages;
CREATE POLICY "Allow insert access to authenticated users" ON public.launch_stages
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update access to authenticated users" ON public.launch_stages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete access to authenticated users" ON public.launch_stages
  FOR DELETE TO authenticated USING (true);

-- ---------- release_schedule: separate INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Allow write access to authenticated users" ON public.release_schedule;
CREATE POLICY "Allow insert access to authenticated users" ON public.release_schedule
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update access to authenticated users" ON public.release_schedule
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete access to authenticated users" ON public.release_schedule
  FOR DELETE TO authenticated USING (true);

-- ---------- manual_metric_values: auth wrap (auth.uid(), auth.role())
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.manual_metric_values;
CREATE POLICY "Allow read access to authenticated users" ON public.manual_metric_values
  FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow write access to PMs and admins" ON public.manual_metric_values;
CREATE POLICY "Allow write access to PMs and admins" ON public.manual_metric_values
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE id = (select auth.uid())
      AND (
        roles && ARRAY['PM', 'SUPERADMIN', 'PRODUCT_OPS', 'CPO']::text[]
      )
    )
  );

DROP POLICY IF EXISTS "Allow update access to PMs and admins" ON public.manual_metric_values;
CREATE POLICY "Allow update access to PMs and admins" ON public.manual_metric_values
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE id = (select auth.uid())
      AND (
        roles && ARRAY['PM', 'SUPERADMIN', 'PRODUCT_OPS', 'CPO']::text[]
      )
    )
  );

DROP POLICY IF EXISTS "Allow delete access to admins" ON public.manual_metric_values;
CREATE POLICY "Allow delete access to admins" ON public.manual_metric_values
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE id = (select auth.uid())
      AND (
        roles && ARRAY['SUPERADMIN', 'PRODUCT_OPS', 'CPO']::text[]
      )
    )
  );
