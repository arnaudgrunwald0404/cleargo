-- 20260314000001_create_launches_tables.sql
-- Add launch support to shared tables and create new launch-specific tables.
-- Shared tables get a `context` discriminator column; new tables support the
-- Asana-style task-tracker model for product marketing launch readiness.

-- =============================================================================
-- 1. Alter `criterion` — add launch support columns (skip if already present)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='criterion' AND column_name='context') THEN
    ALTER TABLE public.criterion
      ADD COLUMN context TEXT NOT NULL DEFAULT 'release'
        CHECK (context IN ('release', 'launch'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='criterion' AND column_name='phase') THEN
    ALTER TABLE public.criterion ADD COLUMN phase TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='criterion' AND column_name='default_owner_email') THEN
    ALTER TABLE public.criterion ADD COLUMN default_owner_email TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='criterion' AND column_name='default_due_offset_days') THEN
    ALTER TABLE public.criterion ADD COLUMN default_due_offset_days INTEGER;
  END IF;
END $$;

-- =============================================================================
-- 2. Alter `release_schedule` — add context discriminator (skip if already present)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='release_schedule' AND column_name='context') THEN
    ALTER TABLE public.release_schedule
      ADD COLUMN context TEXT NOT NULL DEFAULT 'release'
        CHECK (context IN ('release', 'launch'));
  END IF;
END $$;

ALTER TABLE public.release_schedule
  DROP CONSTRAINT IF EXISTS release_schedule_release_name_key;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_name_context_unique') THEN
    ALTER TABLE public.release_schedule
      ADD CONSTRAINT schedule_name_context_unique UNIQUE (release_name, context);
  END IF;
END $$;

-- =============================================================================
-- 3. Create `launch` table — groups 1+ epics into a marketing launch
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.launch (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  tier        TEXT CHECK (tier IN ('TIER_1', 'TIER_2', 'TIER_3')),
  target_launch_date DATE,
  status      TEXT NOT NULL DEFAULT 'Planning'
                CHECK (status IN ('Planning', 'In Progress', 'Launched', 'Post-Launch')),
  owner_id    UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  owner_email TEXT,
  readiness_pct NUMERIC NOT NULL DEFAULT 0,
  schedule_id BIGINT REFERENCES public.release_schedule(id) ON DELETE SET NULL,
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.launch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "launch_select_authenticated" ON public.launch;
CREATE POLICY "launch_select_authenticated" ON public.launch
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "launch_insert_app_user" ON public.launch;
CREATE POLICY "launch_insert_app_user" ON public.launch
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "launch_update_app_user" ON public.launch;
CREATE POLICY "launch_update_app_user" ON public.launch
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "launch_delete_app_user" ON public.launch;
CREATE POLICY "launch_delete_app_user" ON public.launch
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- =============================================================================
-- 4. Create `launch_epic` junction table — many-to-many launches ↔ epics
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.launch_epic (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id   UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,
  epic_id     UUID NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (launch_id, epic_id)
);

ALTER TABLE public.launch_epic ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "launch_epic_select_authenticated" ON public.launch_epic;
CREATE POLICY "launch_epic_select_authenticated" ON public.launch_epic
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "launch_epic_insert_app_user" ON public.launch_epic;
CREATE POLICY "launch_epic_insert_app_user" ON public.launch_epic
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "launch_epic_delete_app_user" ON public.launch_epic;
CREATE POLICY "launch_epic_delete_app_user" ON public.launch_epic
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- =============================================================================
-- 5. Create `launch_criterion_status` — per-launch task instance (Asana-style)
--    Uses NOT_STARTED / IN_PROGRESS / DONE instead of GO / COND / NO_GO
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.launch_criterion_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id       UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,
  criterion_id    UUID NOT NULL REFERENCES public.criterion(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'NOT_STARTED'
                    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE')),
  owner_id        UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  owner_email     TEXT,
  due_date        DATE,
  notes           TEXT,
  links           JSONB DEFAULT '[]'::jsonb,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  last_updated_by UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (launch_id, criterion_id)
);

ALTER TABLE public.launch_criterion_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lcs_select_authenticated" ON public.launch_criterion_status;
CREATE POLICY "lcs_select_authenticated" ON public.launch_criterion_status
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "lcs_insert_app_user" ON public.launch_criterion_status;
CREATE POLICY "lcs_insert_app_user" ON public.launch_criterion_status
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "lcs_update_app_user" ON public.launch_criterion_status;
CREATE POLICY "lcs_update_app_user" ON public.launch_criterion_status
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "lcs_delete_app_user" ON public.launch_criterion_status;
CREATE POLICY "lcs_delete_app_user" ON public.launch_criterion_status
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- =============================================================================
-- 6. Indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_criterion_context ON public.criterion(context);
CREATE INDEX IF NOT EXISTS idx_release_schedule_context ON public.release_schedule(context);
CREATE INDEX IF NOT EXISTS idx_launch_archived ON public.launch(archived);
CREATE INDEX IF NOT EXISTS idx_launch_schedule_id ON public.launch(schedule_id);
CREATE INDEX IF NOT EXISTS idx_launch_epic_epic_id ON public.launch_epic(epic_id);
CREATE INDEX IF NOT EXISTS idx_launch_epic_launch_id ON public.launch_epic(launch_id);
CREATE INDEX IF NOT EXISTS idx_lcs_launch_id ON public.launch_criterion_status(launch_id);
CREATE INDEX IF NOT EXISTS idx_lcs_criterion_id ON public.launch_criterion_status(criterion_id);
CREATE INDEX IF NOT EXISTS idx_lcs_status ON public.launch_criterion_status(status);
