#!/usr/bin/env bash
# Stage the RRV dump into a `rrv_import` schema in ClearGo Supabase — see ../README.md.
set -euo pipefail

if [[ -z "${CLEARGO_SUPABASE_DB_URL:-}" ]]; then
  echo "CLEARGO_SUPABASE_DB_URL must be set (postgres://…)." >&2
  exit 1
fi

OUT_DIR="${OUT_DIR:-./tmp/rrv-import}"
SRC_FILE="$OUT_DIR/rrv_data.sql"
STAGED_FILE="$OUT_DIR/rrv_data.staged.sql"

if [[ ! -f "$SRC_FILE" ]]; then
  echo "Missing $SRC_FILE — run 01-export-from-rrv.sh first." >&2
  exit 1
fi

echo "Rewriting public.* references → rrv_import.* in $STAGED_FILE …"
sed 's/public\./rrv_import./g' "$SRC_FILE" > "$STAGED_FILE"

echo "Creating rrv_import schema (no FKs) and loading data …"
psql "$CLEARGO_SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -c 'CREATE SCHEMA IF NOT EXISTS rrv_import;' \
  -c "SET search_path TO rrv_import;" \
  -c 'CREATE TABLE IF NOT EXISTS rrv_import.roadmap (
        id uuid, created_at timestamptz, rank int, aha_key text, aha_name text,
        aha_description text, aha_start_date text, aha_end_date text, aha_status text,
        aha_t_shirt_est text, aha_primary_goal text, aha_calculated_devs text,
        aha_owner text, aha_initial_est text, aha_release text, aha_release_date text,
        aha_components text, aha_cross_functional_deps text, aha_pod text,
        jira_key text, aha_csm_priority text, aha_progress int
      );' \
  -c 'CREATE TABLE IF NOT EXISTS rrv_import.confidence_ratings (
        id uuid, aha_key text, snapshot_date date, calculated_confidence text,
        calculated_percentage int, pm_adjustment int, final_confidence text,
        final_percentage int, last_calculated_at timestamptz, author_email text,
        created_at timestamptz, updated_at timestamptz
      );' \
  -c 'CREATE TABLE IF NOT EXISTS rrv_import.confidence_adjustment_history (
        id uuid, aha_key text, snapshot_date date, previous_adjustment int,
        new_adjustment int, adjustment_delta int, previous_final_percentage int,
        new_final_percentage int, adjustment_note text, author_email text,
        created_at timestamptz
      );' \
  -c 'CREATE TABLE IF NOT EXISTS rrv_import.pm_notes (
        id uuid, aha_key text, snapshot_date timestamptz, note_text text,
        author_email text, created_at timestamptz, updated_at timestamptz,
        movement_cause text, movement_date timestamptz, from_release text, to_release text
      );' \
  -c 'CREATE TABLE IF NOT EXISTS rrv_import.pm_impact_overrides (
        id uuid, aha_key text, week_start date, original_impact text,
        override_impact text, override_note text, author_email text,
        created_at timestamptz, updated_at timestamptz
      );' \
  -c 'CREATE TABLE IF NOT EXISTS rrv_import.hidden_items (
        id uuid, aha_key text, hidden_at timestamptz, author_email text
      );' \
  -f "$STAGED_FILE"

echo "Staging complete. Sanity counts:"
psql "$CLEARGO_SUPABASE_DB_URL" -c "
  SELECT
    (SELECT COUNT(*) FROM rrv_import.roadmap)                       AS roadmap_rows,
    (SELECT COUNT(*) FROM rrv_import.confidence_ratings)            AS confidence_ratings_rows,
    (SELECT COUNT(*) FROM rrv_import.confidence_adjustment_history) AS confidence_history_rows,
    (SELECT COUNT(*) FROM rrv_import.pm_notes)                      AS pm_notes_rows,
    (SELECT COUNT(*) FROM rrv_import.pm_impact_overrides)           AS impact_override_rows,
    (SELECT COUNT(*) FROM rrv_import.hidden_items)                  AS hidden_item_rows;
"
