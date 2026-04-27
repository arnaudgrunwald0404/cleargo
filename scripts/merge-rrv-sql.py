"""Merge RRV Supabase migrations into one file with ClearGo table renames. Run from repo root."""
from __future__ import annotations

import re
from pathlib import Path

# RRV repo (same machine path as previous merge work)
RRV = Path(r"C:/Users/AllenDepew/dyad-apps/roadmap-rewind-visualizer-main/supabase/migrations")


def main() -> None:
    cleargo_root = Path(__file__).resolve().parents[1]  # .../cleargo
    files = [
        # skip create_confidence_ratings — table is 20260427100000_roadmap_rewind_schema.sql
        "add_release_delivery_metrics.sql",
        "add_period_release_delivery_metrics.sql",
        "add_historical_analysis_support.sql",
        "optimize_historical_analysis.sql",
        "fix_year_boundary_movements.sql",
        "add_outside_report_window_movements.sql",
        "fix_missing_items_in_movements.sql",
        "add_impact_categorized_movements.sql",
        "add_positive_impact_level.sql",
        "update_rpc_release_only.sql",
        "add_aha_progress_to_rpc.sql",
        "add_aha_progress_to_main_rpc.sql",
        "add_csm_priority_to_rpc.sql",
        "add_priority_goals_delivery_metrics.sql",
        "add_strategic_items_detail.sql",
        "fix_release_movements.sql",
        "fix_week_start_alignment.sql",
        "add_yearly_movements_rpc.sql",
    ]
    chunks: list[str] = []
    for fn in files:
        p = RRV / fn
        if not p.exists():
            print("SKIP missing:", fn)
            continue
        chunks.append(f"\n-- ==== SOURCE: {fn} ====\n")
        chunks.append(p.read_text(encoding="utf-8"))

    text = "".join(chunks)
    # Remove trailing test SELECTs (best-effort)
    text = re.sub(r"\n-- Test the function\nSELECT[^;]+;", "", text, flags=re.I | re.S)
    text = re.sub(r"\nSELECT \* FROM get_[^;]+;", "", text, flags=re.I)
    text = re.sub(r"\nSELECT aha_key[^;]+;", "", text, flags=re.I)

    text = text.replace("public.roadmap", "public.roadmap_snapshot")
    text = text.replace("FROM roadmap ", "FROM roadmap_snapshot ")
    text = text.replace("JOIN roadmap ", "JOIN roadmap_snapshot ")
    text = text.replace("confidence_ratings", "confidence_rating")
    text = text.replace("pm_impact_overrides", "pm_impact_override")
    text = text.replace("r.created_at::date", "r.snapshot_date")
    text = text.replace("rs.created_at::date", "rs.snapshot_date")
    text = text.replace("roadmap_snapshot_snapshot", "roadmap_snapshot")

    out = cleargo_root / "supabase/migrations/20260427120000_roadmap_rewind_functions.sql"
    header = (
        "-- Ported from Roadmap Rewind Visualizer migrations; adapted for ClearGo:\n"
        "--   roadmap -> roadmap_snapshot, confidence_ratings -> confidence_rating,\n"
        "--   pm_impact_overrides -> pm_impact_override, created_at::date filters -> snapshot_date\n"
        "-- Review duplicate DROP/CREATE order if applying on DB with partial history.\n\n"
    )
    out.write_text(header + text, encoding="utf-8")
    print("Wrote", out, "bytes", out.stat().st_size)


if __name__ == "__main__":
    main()
