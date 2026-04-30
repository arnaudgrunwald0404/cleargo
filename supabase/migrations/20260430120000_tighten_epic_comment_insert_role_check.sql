-- Tighten the INSERT policy on `epic_comment` (PM / movement notes on the
-- Roadmap Rewind timeline) so that only PM / PRODUCT_OPS / CPO / SUPERADMIN
-- can create new comments. Previously the policy only verified the writer
-- was present in `app_user` with no role check, which effectively let any
-- authenticated user post a "PM note" on any epic.
--
-- This brings the table in line with how `confidence_rating`,
-- `confidence_adjustment_history`, and `pm_impact_override` already gate
-- writes (see 20260427100000_roadmap_rewind_schema.sql).
--
-- UPDATE / DELETE policies remain "own-row only" (the author can clean up
-- their own past notes even if their role changes later); the role check
-- is enforced at the create gate.

DROP POLICY IF EXISTS "epic_comment_insert_authenticated" ON public.epic_comment;
DROP POLICY IF EXISTS "epic_comment_insert_pm" ON public.epic_comment;

CREATE POLICY "epic_comment_insert_pm"
  ON public.epic_comment FOR INSERT TO authenticated
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

NOTIFY pgrst, 'reload schema';
