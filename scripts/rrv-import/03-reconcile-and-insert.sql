-- RRV → ClearGo bulk import. Run with:
--   psql "$CLEARGO_SUPABASE_DB_URL" -f scripts/rrv-import/03-reconcile-and-insert.sql
--
-- Two-phase: prints diagnostics, then (only if rrv_import.do_insert='1') inserts.
-- See scripts/rrv-import/README.md and merge plan § 4a.
\set ON_ERROR_STOP on

\echo '=== Coverage check (rrv_import.roadmap → public.epic) ==='
SELECT
  COUNT(DISTINCT r.aha_key)                              AS rrv_distinct_keys,
  COUNT(DISTINCT r.aha_key) FILTER (WHERE e.id IS NOT NULL) AS matched_in_cleargo,
  COUNT(DISTINCT r.aha_key) FILTER (WHERE e.id IS NULL) AS unmatched_keys,
  ROUND(
    100.0
    * COUNT(DISTINCT r.aha_key) FILTER (WHERE e.id IS NOT NULL)
    / NULLIF(COUNT(DISTINCT r.aha_key), 0),
    2
  ) AS match_pct
FROM rrv_import.roadmap r
LEFT JOIN public.epic e ON e.aha_id = r.aha_key;

\echo '=== Top unmatched keys (up to 100) — backfill via Aha! sync OR accept as orphan history ==='
SELECT r.aha_key, MIN(r.aha_name) AS aha_name, MAX(r.created_at) AS last_seen, COUNT(*) AS rrv_rows
FROM rrv_import.roadmap r
LEFT JOIN public.epic e ON e.aha_id = r.aha_key
WHERE e.id IS NULL
GROUP BY r.aha_key
ORDER BY last_seen DESC
LIMIT 100;

-- Insert gate: re-run with `psql -v rrv_import_do_insert=1 -f …` to perform the insert.
\if :{?rrv_import_do_insert}
  \echo '=== Inserting into public.roadmap_snapshot (epic_id via LEFT JOIN; orphans → NULL) ==='
  INSERT INTO public.roadmap_snapshot (
    epic_id, snapshot_date, aha_key, aha_name, aha_description,
    aha_start_date, aha_end_date, aha_status, aha_t_shirt_est,
    aha_primary_goal, aha_calculated_devs, aha_owner, aha_initial_est,
    aha_release, aha_pod, jira_key, aha_release_date, aha_csm_priority,
    aha_progress, created_at
  )
  SELECT
    e.id,
    r.created_at::date,
    r.aha_key,
    r.aha_name, r.aha_description,
    r.aha_start_date, r.aha_end_date, r.aha_status, r.aha_t_shirt_est,
    r.aha_primary_goal, r.aha_calculated_devs, r.aha_owner, r.aha_initial_est,
    r.aha_release, r.aha_pod, r.jira_key, r.aha_release_date, r.aha_csm_priority,
    r.aha_progress, r.created_at
  FROM rrv_import.roadmap r
  LEFT JOIN public.epic e ON e.aha_id = r.aha_key
  ON CONFLICT (snapshot_date, aha_key) DO NOTHING;

  \echo '=== Inserting confidence_ratings → public.confidence_rating ==='
  INSERT INTO public.confidence_rating (
    epic_id, aha_key, snapshot_date,
    calculated_confidence, calculated_percentage,
    pm_adjustment,
    final_confidence, final_percentage,
    last_calculated_at, author_email,
    created_at, updated_at
  )
  SELECT
    e.id, c.aha_key, c.snapshot_date,
    c.calculated_confidence, c.calculated_percentage,
    COALESCE(c.pm_adjustment, 0),
    c.final_confidence, c.final_percentage,
    c.last_calculated_at, c.author_email,
    c.created_at, c.updated_at
  FROM rrv_import.confidence_ratings c
  LEFT JOIN public.epic e ON e.aha_id = c.aha_key
  ON CONFLICT (aha_key, snapshot_date) DO NOTHING;

  \echo '=== Inserting confidence_adjustment_history (no FK; append-only) ==='
  INSERT INTO public.confidence_adjustment_history (
    aha_key, snapshot_date, previous_adjustment, new_adjustment, adjustment_delta,
    previous_final_percentage, new_final_percentage, adjustment_note, author_email, created_at
  )
  SELECT
    h.aha_key, h.snapshot_date, h.previous_adjustment, h.new_adjustment, h.adjustment_delta,
    h.previous_final_percentage, h.new_final_percentage, h.adjustment_note,
    COALESCE(h.author_email, 'rrv-import@unknown'), h.created_at
  FROM rrv_import.confidence_adjustment_history h;

  \echo '=== Inserting pm_impact_overrides → public.pm_impact_override ==='
  INSERT INTO public.pm_impact_override (
    epic_id, aha_key, week_start, original_impact, override_impact,
    override_note, author_email, created_at, updated_at
  )
  SELECT
    e.id, p.aha_key, p.week_start,
    p.original_impact, p.override_impact,
    p.override_note, p.author_email, p.created_at, p.updated_at
  FROM rrv_import.pm_impact_overrides p
  LEFT JOIN public.epic e ON e.aha_id = p.aha_key
  ON CONFLICT (aha_key, week_start) DO NOTHING;

  \echo '=== Inserting hidden_items → public.roadmap_hidden_item (resolved by author_email) ==='
  -- RRV stored hidden items per author_email; ClearGo's table is keyed by app_user.id.
  -- We match on email; rows with no matching app_user are skipped (they are per-user
  -- preferences, not data integrity-critical).
  INSERT INTO public.roadmap_hidden_item (app_user_id, aha_key, hidden_at)
  SELECT u.id, h.aha_key, h.hidden_at
  FROM rrv_import.hidden_items h
  JOIN public.app_user u ON LOWER(u.email) = LOWER(h.author_email)
  ON CONFLICT (app_user_id, aha_key) DO NOTHING;

  \echo '=== Inserting pm_notes → public.epic_comment (category=movement) ==='
  -- Skip rows with no matching epic_id (epic_comment.epic_id is NOT NULL).
  -- These are unmatched aha_keys; they would be lost rather than orphaned.
  -- Triage list:
  SELECT COUNT(*) AS pm_notes_skipped_due_to_unmatched_epic
  FROM rrv_import.pm_notes p
  LEFT JOIN public.epic e ON e.aha_id = p.aha_key
  WHERE e.id IS NULL;

  INSERT INTO public.epic_comment (
    epic_id, comment_text, created_by, created_at, updated_at,
    category, movement_cause, movement_date, from_release, to_release,
    related_snapshot_date
  )
  SELECT
    e.id,
    NULLIF(TRIM(p.note_text), ''),
    u.id, -- nullable
    p.created_at, p.updated_at,
    'movement',
    p.movement_cause, p.movement_date, p.from_release, p.to_release,
    p.snapshot_date::date
  FROM rrv_import.pm_notes p
  JOIN public.epic e ON e.aha_id = p.aha_key
  LEFT JOIN public.app_user u ON LOWER(u.email) = LOWER(p.author_email)
  WHERE NULLIF(TRIM(p.note_text), '') IS NOT NULL;

  \echo '=== ANALYZE ==='
  ANALYZE public.roadmap_snapshot;
  ANALYZE public.confidence_rating;
  ANALYZE public.confidence_adjustment_history;
  ANALYZE public.pm_impact_override;
  ANALYZE public.roadmap_hidden_item;
  ANALYZE public.epic_comment;

  \echo '=== Final destination row counts ==='
  SELECT
    (SELECT COUNT(*) FROM public.roadmap_snapshot)              AS roadmap_snapshot,
    (SELECT COUNT(*) FROM public.confidence_rating)             AS confidence_rating,
    (SELECT COUNT(*) FROM public.confidence_adjustment_history) AS confidence_adjustment_history,
    (SELECT COUNT(*) FROM public.pm_impact_override)            AS pm_impact_override,
    (SELECT COUNT(*) FROM public.roadmap_hidden_item)           AS roadmap_hidden_item,
    (SELECT COUNT(*) FROM public.epic_comment WHERE category = 'movement') AS epic_comment_movement;
\else
  \echo ''
  \echo 'DRY RUN. Re-run with `-v rrv_import_do_insert=1` to perform the inserts:'
  \echo '  psql "$CLEARGO_SUPABASE_DB_URL" -v rrv_import_do_insert=1 -f scripts/rrv-import/03-reconcile-and-insert.sql'
\endif
