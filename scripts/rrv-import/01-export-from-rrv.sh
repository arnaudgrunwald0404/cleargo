#!/usr/bin/env bash
# Export the RRV tables we care about (data only) — see ../README.md.
set -euo pipefail

if [[ -z "${RRV_SUPABASE_DB_URL:-}" ]]; then
  echo "RRV_SUPABASE_DB_URL must be set (postgres://…)." >&2
  exit 1
fi

OUT_DIR="${OUT_DIR:-./tmp/rrv-import}"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/rrv_data.sql"

echo "Dumping RRV tables to $OUT_FILE …"
pg_dump --data-only \
  --no-owner --no-privileges \
  --table=public.roadmap \
  --table=public.confidence_ratings \
  --table=public.confidence_adjustment_history \
  --table=public.pm_notes \
  --table=public.pm_impact_overrides \
  --table=public.hidden_items \
  "$RRV_SUPABASE_DB_URL" > "$OUT_FILE"

echo "Done. Lines exported: $(wc -l < "$OUT_FILE")"
echo "Note: reactions, user_visits, ai_description_cache intentionally skipped."
