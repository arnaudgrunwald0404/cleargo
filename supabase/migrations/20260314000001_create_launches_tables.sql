-- 20260314000001_create_launches_tables.sql
-- Add launch support to shared tables and create new launch-specific tables.
-- Shared tables get a `context` discriminator column; new tables support the
-- Asana-style task-tracker model for product marketing launch readiness.

-- =============================================================================
-- 1. Alter `criterion` — add launch support columns
-- =============================================================================

-- Discriminator: 'release' (existing) or 'launch' (new)
ALTER TABLE public.criterion
  ADD COLUMN context TEXT NOT NULL DEFAULT 'release'
    CHECK (context IN ('release', 'launch'));

-- Launch-specific columns (nullable — only populated for launch criteria)
ALTER TABLE public.criterion
  ADD COLUMN phase TEXT;                          -- grouping for launch criteria (replaces category)

ALTER TABLE public.criterion
  ADD COLUMN default_owner_email TEXT;            -- default task owner for launches

ALTER TABLE public.criterion
  ADD COLUMN default_due_offset_days INTEGER;     -- days before launch date the task is due

-- =============================================================================
-- 2. Alter `release_schedule` — add context discriminator
-- =============================================================================

ALTER TABLE public.release_schedule
  ADD COLUMN context TEXT NOT NULL DEFAULT 'release'
    CHECK (context IN ('release', 'launch'));

-- Replace the unique on release_name with a composite unique on (release_name, context)
-- so releases and launches can share the same name independently.
ALTER TABLE public.release_schedule
  DROP CONSTRAINT IF EXISTS release_schedule_release_name_key;

ALTER TABLE public.release_schedule
  ADD CONSTRAINT schedule_name_context_unique UNIQUE (release_name, context);

-- =============================================================================
-- 3. Create `launch` table — groups 1+ epics into a marketing launch
-- =============================================================================

CREATE TABLE public.launch (
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

CREATE POLICY "launch_select_authenticated" ON public.launch
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "launch_insert_app_user" ON public.launch
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

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

CREATE TABLE public.launch_epic (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id   UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,
  epic_id     UUID NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (launch_id, epic_id)
);

ALTER TABLE public.launch_epic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "launch_epic_select_authenticated" ON public.launch_epic
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "launch_epic_insert_app_user" ON public.launch_epic
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

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

CREATE TABLE public.launch_criterion_status (
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

CREATE POLICY "lcs_select_authenticated" ON public.launch_criterion_status
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "lcs_insert_app_user" ON public.launch_criterion_status
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

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

CREATE INDEX idx_criterion_context ON public.criterion(context);
CREATE INDEX idx_release_schedule_context ON public.release_schedule(context);
CREATE INDEX idx_launch_archived ON public.launch(archived);
CREATE INDEX idx_launch_schedule_id ON public.launch(schedule_id);
CREATE INDEX idx_launch_epic_epic_id ON public.launch_epic(epic_id);
CREATE INDEX idx_launch_epic_launch_id ON public.launch_epic(launch_id);
CREATE INDEX idx_lcs_launch_id ON public.launch_criterion_status(launch_id);
CREATE INDEX idx_lcs_criterion_id ON public.launch_criterion_status(criterion_id);
CREATE INDEX idx_lcs_status ON public.launch_criterion_status(status);
