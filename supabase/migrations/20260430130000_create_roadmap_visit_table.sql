-- Roadmap visit tracking
--
-- Records who has visited the Roadmap Snapshot / Roadmap Rewind pages and
-- when, with one row per (user, snapshot_date, page) so re-visits during
-- the same snapshot week don't multiply totals (matches RRV's
-- (ip_address, department, snapshot_date) dedup model, but using ClearGo's
-- authenticated user identity instead of IP scraping).
--
-- We deliberately tie the visit to the *snapshot_date* (not just the calendar
-- date) so totals reset naturally when a new weekly snapshot lands and
-- "12 PMs looked at the Apr 28 snapshot" stays meaningful even months later.

CREATE TABLE IF NOT EXISTS public.roadmap_visit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id        UUID NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
  snapshot_date      DATE NOT NULL,
  page               TEXT NOT NULL CHECK (page IN ('snapshot', 'rewind')),
  first_visited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_visited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_count        INTEGER NOT NULL DEFAULT 1 CHECK (visit_count > 0),
  CONSTRAINT roadmap_visit_unique UNIQUE (app_user_id, snapshot_date, page)
);

CREATE INDEX IF NOT EXISTS idx_roadmap_visit_snapshot_page
  ON public.roadmap_visit (snapshot_date, page);
CREATE INDEX IF NOT EXISTS idx_roadmap_visit_user
  ON public.roadmap_visit (app_user_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_visit_recent
  ON public.roadmap_visit (snapshot_date, page, last_visited_at DESC);

ALTER TABLE public.roadmap_visit ENABLE ROW LEVEL SECURITY;

-- Read: every authenticated user sees the totals (honor-system, matches RRV).
DROP POLICY IF EXISTS "roadmap_visit_select_authenticated" ON public.roadmap_visit;
CREATE POLICY "roadmap_visit_select_authenticated"
  ON public.roadmap_visit FOR SELECT TO authenticated
  USING (true);

-- Write: a user can only insert/update their own visit row. The actual
-- write path goes through `/api/roadmap/visits` (which uses
-- `getAuthenticatedUserEmail` and the service-role client, so it works
-- for both Supabase Auth and magic-link/lr_session users). These RLS
-- policies are defense in depth in case anything ever writes through
-- the user-scoped client.
DROP POLICY IF EXISTS "roadmap_visit_insert_self" ON public.roadmap_visit;
CREATE POLICY "roadmap_visit_insert_self"
  ON public.roadmap_visit FOR INSERT TO authenticated
  WITH CHECK (
    app_user_id IN (
      SELECT id FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

DROP POLICY IF EXISTS "roadmap_visit_update_self" ON public.roadmap_visit;
CREATE POLICY "roadmap_visit_update_self"
  ON public.roadmap_visit FOR UPDATE TO authenticated
  USING (
    app_user_id IN (
      SELECT id FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  )
  WITH CHECK (
    app_user_id IN (
      SELECT id FROM public.app_user
      WHERE LOWER(email) = LOWER((select auth.jwt())->>'email')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.roadmap_visit TO authenticated;
GRANT ALL ON public.roadmap_visit TO service_role;

NOTIFY pgrst, 'reload schema';
