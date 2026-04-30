-- Roadmap Rewind (RRV merge): partitioned snapshots, confidence, epic comments, hidden items.
-- Partition maintenance: use public.ensure_roadmap_snapshot_partitions() from cron.

-- -----------------------------------------------------------------------------
-- 1. roadmap_snapshot (weekly Aha! pivot rows; PARTITION BY RANGE snapshot_date)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roadmap_snapshot (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  epic_id             UUID REFERENCES public.epic(id) ON DELETE SET NULL,
  snapshot_date       DATE NOT NULL,
  aha_key             TEXT NOT NULL,
  aha_name            TEXT,
  aha_description     TEXT,
  aha_start_date      TEXT,
  aha_end_date        TEXT,
  aha_status          TEXT,
  aha_t_shirt_est     TEXT,
  aha_primary_goal    TEXT,
  aha_calculated_devs TEXT,
  aha_owner           TEXT,
  aha_initial_est     TEXT,
  aha_release         TEXT,
  aha_pod             TEXT,
  jira_key            TEXT,
  aha_release_date    TEXT,
  aha_csm_priority    TEXT,
  aha_progress        INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roadmap_snapshot_pkey PRIMARY KEY (snapshot_date, id),
  CONSTRAINT roadmap_snapshot_snapshot_aha_unique UNIQUE (snapshot_date, aha_key)
) PARTITION BY RANGE (snapshot_date);

COMMENT ON TABLE public.roadmap_snapshot IS 'Weekly Aha! custom-pivot snapshots for Roadmap Rewind (time-series comparison).';

CREATE INDEX IF NOT EXISTS idx_roadmap_snapshot_epic_snapshot_desc
  ON public.roadmap_snapshot (epic_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_roadmap_snapshot_aha_snapshot_desc
  ON public.roadmap_snapshot (aha_key, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_roadmap_snapshot_snapshot_date
  ON public.roadmap_snapshot (snapshot_date);

-- Monthly partitions (2023-01 through 2032-12)
DO $$
DECLARE
  d date := '2023-01-01'::date;
  lim date := '2033-01-01'::date;
  part_name text;
BEGIN
  WHILE d < lim LOOP
    part_name := 'roadmap_snapshot_' || to_char(d, 'YYYY_MM');
    BEGIN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.roadmap_snapshot FOR VALUES FROM (%L) TO (%L)',
        part_name,
        d,
        (d + interval '1 month')::date
      );
    EXCEPTION
      WHEN duplicate_table THEN
        NULL;
    END;
    d := (d + interval '1 month')::date;
  END LOOP;
END $$;

ALTER TABLE public.roadmap_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_snapshot_select_authenticated" ON public.roadmap_snapshot;
CREATE POLICY "roadmap_snapshot_select_authenticated"
  ON public.roadmap_snapshot FOR SELECT TO authenticated
  USING (true);

-- Inserts only via service role (cron / admin client); no INSERT policy for authenticated

-- -----------------------------------------------------------------------------
-- 2. epic_comment (epic-level PM notes / movement notes; was RRV pm_notes)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.epic_comment (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id                  UUID NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  comment_text             TEXT NOT NULL CHECK (LENGTH(TRIM(comment_text)) > 0),
  created_by               UUID REFERENCES public.app_user(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  category                 TEXT CHECK (category IS NULL OR category IN ('general', 'movement', 'risk', 'decision')),
  movement_cause           TEXT CHECK (movement_cause IS NULL OR movement_cause IN ('Internal', 'External')),
  movement_date            TIMESTAMPTZ,
  from_release             TEXT,
  to_release               TEXT,
  related_snapshot_date    DATE
);

CREATE INDEX IF NOT EXISTS idx_epic_comment_epic_created ON public.epic_comment (epic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_epic_comment_category ON public.epic_comment (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_epic_comment_movement ON public.epic_comment (epic_id, movement_date) WHERE movement_date IS NOT NULL;

ALTER TABLE public.epic_comment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epic_comment_select_authenticated" ON public.epic_comment;
CREATE POLICY "epic_comment_select_authenticated"
  ON public.epic_comment FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "epic_comment_insert_authenticated" ON public.epic_comment;
CREATE POLICY "epic_comment_insert_authenticated"
  ON public.epic_comment FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "epic_comment_update_own" ON public.epic_comment;
CREATE POLICY "epic_comment_update_own"
  ON public.epic_comment FOR UPDATE TO authenticated
  USING (
    created_by IN (
      SELECT id FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  )
  WITH CHECK (
    created_by IN (
      SELECT id FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "epic_comment_delete_own" ON public.epic_comment;
CREATE POLICY "epic_comment_delete_own"
  ON public.epic_comment FOR DELETE TO authenticated
  USING (
    created_by IN (
      SELECT id FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

CREATE OR REPLACE FUNCTION public.touch_epic_comment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_epic_comment_updated_at ON public.epic_comment;
CREATE TRIGGER trigger_epic_comment_updated_at
  BEFORE UPDATE ON public.epic_comment
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_epic_comment_updated_at();

-- -----------------------------------------------------------------------------
-- 3. confidence_rating (was RRV confidence_ratings)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.confidence_rating (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id                  UUID REFERENCES public.epic(id) ON DELETE SET NULL,
  aha_key                  TEXT NOT NULL,
  snapshot_date            DATE NOT NULL,
  calculated_confidence    TEXT NOT NULL CHECK (calculated_confidence IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  calculated_percentage    INTEGER NOT NULL CHECK (calculated_percentage >= 0 AND calculated_percentage <= 100),
  pm_adjustment            INTEGER NOT NULL DEFAULT 0 CHECK (pm_adjustment >= -20 AND pm_adjustment <= 20),
  final_confidence         TEXT NOT NULL CHECK (final_confidence IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  final_percentage         INTEGER NOT NULL CHECK (final_percentage >= 0 AND final_percentage <= 100),
  last_calculated_at       TIMESTAMPTZ DEFAULT now(),
  author_email             TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT confidence_rating_aha_snapshot_unique UNIQUE (aha_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_confidence_rating_aha ON public.confidence_rating (aha_key);
CREATE INDEX IF NOT EXISTS idx_confidence_rating_snapshot ON public.confidence_rating (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_confidence_rating_aha_snapshot_desc ON public.confidence_rating (aha_key, snapshot_date DESC);

ALTER TABLE public.confidence_rating ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "confidence_rating_select_authenticated" ON public.confidence_rating;
CREATE POLICY "confidence_rating_select_authenticated"
  ON public.confidence_rating FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "confidence_rating_update_pm" ON public.confidence_rating;
CREATE POLICY "confidence_rating_update_pm"
  ON public.confidence_rating FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user u
      WHERE LOWER(u.email) = LOWER((select auth.jwt())->>'email')
      AND (
        u.roles @> ARRAY['PM']::text[]
        OR u.roles @> ARRAY['PRODUCT_OPS']::text[]
        OR u.roles @> ARRAY['CPO']::text[]
        OR u.roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user u
      WHERE LOWER(u.email) = LOWER((select auth.jwt())->>'email')
      AND (
        u.roles @> ARRAY['PM']::text[]
        OR u.roles @> ARRAY['PRODUCT_OPS']::text[]
        OR u.roles @> ARRAY['CPO']::text[]
        OR u.roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

CREATE OR REPLACE FUNCTION public.touch_confidence_rating_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_confidence_rating_updated_at ON public.confidence_rating;
CREATE TRIGGER trigger_confidence_rating_updated_at
  BEFORE UPDATE ON public.confidence_rating
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_confidence_rating_updated_at();

-- -----------------------------------------------------------------------------
-- 4. confidence_adjustment_history
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.confidence_adjustment_history (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aha_key                    TEXT NOT NULL,
  snapshot_date              DATE NOT NULL,
  previous_adjustment        INTEGER NOT NULL DEFAULT 0 CHECK (previous_adjustment >= -20 AND previous_adjustment <= 20),
  new_adjustment             INTEGER NOT NULL CHECK (new_adjustment >= -20 AND new_adjustment <= 20),
  adjustment_delta             INTEGER NOT NULL,
  previous_final_percentage  INTEGER NOT NULL CHECK (previous_final_percentage >= 0 AND previous_final_percentage <= 100),
  new_final_percentage       INTEGER NOT NULL CHECK (new_final_percentage >= 0 AND new_final_percentage <= 100),
  adjustment_note              TEXT,
  author_email               TEXT NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confidence_adj_hist_aha ON public.confidence_adjustment_history (aha_key);
CREATE INDEX IF NOT EXISTS idx_confidence_adj_hist_created ON public.confidence_adjustment_history (aha_key, created_at DESC);

ALTER TABLE public.confidence_adjustment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "confidence_adjustment_history_select_authenticated" ON public.confidence_adjustment_history;
CREATE POLICY "confidence_adjustment_history_select_authenticated"
  ON public.confidence_adjustment_history FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "confidence_adjustment_history_insert_pm" ON public.confidence_adjustment_history;
CREATE POLICY "confidence_adjustment_history_insert_pm"
  ON public.confidence_adjustment_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user u
      WHERE LOWER(u.email) = LOWER((select auth.jwt())->>'email')
      AND (
        u.roles @> ARRAY['PM']::text[]
        OR u.roles @> ARRAY['PRODUCT_OPS']::text[]
        OR u.roles @> ARRAY['CPO']::text[]
        OR u.roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. pm_impact_override (was pm_impact_overrides)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pm_impact_override (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id           UUID REFERENCES public.epic(id) ON DELETE SET NULL,
  aha_key           TEXT NOT NULL,
  week_start        DATE NOT NULL,
  original_impact   TEXT NOT NULL CHECK (original_impact IN ('high', 'medium', 'low')),
  override_impact   TEXT NOT NULL CHECK (override_impact IN ('high', 'medium', 'low')),
  override_note     TEXT,
  author_email      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_impact_override_aha_week_unique UNIQUE (aha_key, week_start)
);

CREATE INDEX IF NOT EXISTS idx_pm_impact_override_week ON public.pm_impact_override (week_start);

ALTER TABLE public.pm_impact_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_impact_override_select_authenticated" ON public.pm_impact_override;
CREATE POLICY "pm_impact_override_select_authenticated"
  ON public.pm_impact_override FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "pm_impact_override_write_pm" ON public.pm_impact_override;
CREATE POLICY "pm_impact_override_write_pm"
  ON public.pm_impact_override FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user u
      WHERE LOWER(u.email) = LOWER((select auth.jwt())->>'email')
      AND (
        u.roles @> ARRAY['PM']::text[]
        OR u.roles @> ARRAY['PRODUCT_OPS']::text[]
        OR u.roles @> ARRAY['CPO']::text[]
        OR u.roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

DROP POLICY IF EXISTS "pm_impact_override_update_pm" ON public.pm_impact_override;
CREATE POLICY "pm_impact_override_update_pm"
  ON public.pm_impact_override FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user u
      WHERE LOWER(u.email) = LOWER((select auth.jwt())->>'email')
      AND (
        u.roles @> ARRAY['PM']::text[]
        OR u.roles @> ARRAY['PRODUCT_OPS']::text[]
        OR u.roles @> ARRAY['CPO']::text[]
        OR u.roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user u
      WHERE LOWER(u.email) = LOWER((select auth.jwt())->>'email')
      AND (
        u.roles @> ARRAY['PM']::text[]
        OR u.roles @> ARRAY['PRODUCT_OPS']::text[]
        OR u.roles @> ARRAY['CPO']::text[]
        OR u.roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

DROP POLICY IF EXISTS "pm_impact_override_delete_pm" ON public.pm_impact_override;
CREATE POLICY "pm_impact_override_delete_pm"
  ON public.pm_impact_override FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user u
      WHERE LOWER(u.email) = LOWER((select auth.jwt())->>'email')
      AND (
        u.roles @> ARRAY['PM']::text[]
        OR u.roles @> ARRAY['PRODUCT_OPS']::text[]
        OR u.roles @> ARRAY['CPO']::text[]
        OR u.roles @> ARRAY['SUPERADMIN']::text[]
      )
    )
  );

CREATE OR REPLACE FUNCTION public.touch_pm_impact_override_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pm_impact_override_updated_at ON public.pm_impact_override;
CREATE TRIGGER trigger_pm_impact_override_updated_at
  BEFORE UPDATE ON public.pm_impact_override
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_pm_impact_override_updated_at();

-- -----------------------------------------------------------------------------
-- 6. roadmap_hidden_item (per-user hide preference)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roadmap_hidden_item (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id  UUID NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
  aha_key      TEXT NOT NULL,
  hidden_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roadmap_hidden_item_user_key_unique UNIQUE (app_user_id, aha_key)
);

CREATE INDEX IF NOT EXISTS idx_roadmap_hidden_item_user ON public.roadmap_hidden_item (app_user_id);

ALTER TABLE public.roadmap_hidden_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_hidden_item_select_authenticated" ON public.roadmap_hidden_item;
CREATE POLICY "roadmap_hidden_item_select_authenticated"
  ON public.roadmap_hidden_item FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "roadmap_hidden_item_insert_own" ON public.roadmap_hidden_item;
CREATE POLICY "roadmap_hidden_item_insert_own"
  ON public.roadmap_hidden_item FOR INSERT TO authenticated
  WITH CHECK (
    app_user_id IN (
      SELECT id FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "roadmap_hidden_item_delete_own" ON public.roadmap_hidden_item;
CREATE POLICY "roadmap_hidden_item_delete_own"
  ON public.roadmap_hidden_item FOR DELETE TO authenticated
  USING (
    app_user_id IN (
      SELECT id FROM public.app_user WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

-- -----------------------------------------------------------------------------
-- 7. Partition maintenance RPC (called from cron; idempotent)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_roadmap_snapshot_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  lim date;
  part_name text;
BEGIN
  d := (date_trunc('month', current_date)::date - interval '1 month')::date;
  lim := (date_trunc('month', current_date)::date + interval '6 months')::date;
  WHILE d < lim LOOP
    part_name := 'roadmap_snapshot_' || to_char(d, 'YYYY_MM');
    BEGIN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.roadmap_snapshot FOR VALUES FROM (%L) TO (%L)',
        part_name,
        d,
        (d + interval '1 month')::date
      );
    EXCEPTION
      WHEN duplicate_table THEN
        NULL;
    END;
    d := (d + interval '1 month')::date;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_roadmap_snapshot_partitions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_roadmap_snapshot_partitions() TO service_role;
