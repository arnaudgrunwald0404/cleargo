-- Bootstrap epic_success_configs when the table is missing (e.g. remote DB never ran 20250104).
-- Idempotent: only creates the table and policies if they don't exist.
-- Schema matches current code: no benchmark_id; includes delegated_post_launch_owner_id, track_offline, success_metrics_published_at.

DO $bootstrap$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'epic_success_configs') THEN
    RETURN;
  END IF;

  CREATE TABLE public.epic_success_configs (
    epic_id uuid PRIMARY KEY REFERENCES public.epic(id) ON DELETE CASCADE,
    post_launch_owner uuid NOT NULL REFERENCES public.app_user(id),
    delegated_post_launch_owner_id uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
    track_offline boolean NOT NULL DEFAULT false,
    success_metrics_published_at timestamptz NULL,
    locked boolean NOT NULL DEFAULT false,
    locked_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_epic_success_configs_post_launch_owner
    ON public.epic_success_configs(post_launch_owner);
  CREATE INDEX IF NOT EXISTS idx_epic_success_configs_delegated_owner
    ON public.epic_success_configs(delegated_post_launch_owner_id);
  CREATE INDEX IF NOT EXISTS idx_epic_success_configs_locked_locked_at
    ON public.epic_success_configs(locked, locked_at);
  CREATE INDEX IF NOT EXISTS idx_epic_success_configs_track_offline
    ON public.epic_success_configs(track_offline) WHERE track_offline = true;

  COMMENT ON TABLE public.epic_success_configs IS 'Configuration linking epics to post-launch owners and published state';

  ALTER TABLE public.epic_success_configs ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Allow read access to authenticated users" ON public.epic_success_configs
    FOR SELECT TO authenticated USING (true);

  CREATE POLICY "Allow insert access to PMs and admins" ON public.epic_success_configs
    FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.app_user
        WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
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
        WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
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
        WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
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
        WHERE LOWER(email) = LOWER((auth.jwt()->>'email'))
        AND (
          roles @> ARRAY['PM']::text[]
          OR roles @> ARRAY['PRODUCT_OPS']::text[]
          OR roles @> ARRAY['CPO']::text[]
          OR roles @> ARRAY['SUPERADMIN']::text[]
        )
      )
    );

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_success_configs TO authenticated;
  GRANT ALL ON public.epic_success_configs TO service_role;

  RAISE NOTICE 'Created table public.epic_success_configs (bootstrap).';
END $bootstrap$;
