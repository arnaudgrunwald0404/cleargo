"""Post-process merged RRV SQL: use snapshot_date for calendar logic on roadmap_snapshot."""
from pathlib import Path

P = Path(__file__).resolve().parents[1] / "supabase/migrations/20260427120000_roadmap_rewind_functions.sql"


def main() -> None:
    t = P.read_text(encoding="utf-8")
    # Order matters: longer / qualified first
    pairs = [
        ("ON prev.created_at::date =", "ON prev.snapshot_date ="),
        ("SELECT DISTINCT created_at::date as snapshot_date", "SELECT DISTINCT snapshot_date as snapshot_date"),
        ("SELECT MAX(created_at::date)", "SELECT MAX(snapshot_date)"),
        ("SELECT MIN(created_at::date)", "SELECT MIN(snapshot_date)"),
        ("ORDER BY created_at::date", "ORDER BY snapshot_date"),
        ("prev.created_at::date", "prev.snapshot_date"),
        ("curr.created_at::date", "curr.snapshot_date"),
        ("l.created_at::date", "l.snapshot_date"),
        ("p.created_at::date", "p.snapshot_date"),
        ("r.created_at::date", "r.snapshot_date"),
        ("rs.created_at::date", "rs.snapshot_date"),
        ("sp.created_at::date", "sp.snapshot_date"),
        ("sd.created_at::date", "sd.snapshot_date"),
        ("WHERE created_at::date", "WHERE snapshot_date"),
        ("AND created_at::date", "AND snapshot_date"),
        ("OR created_at::date", "OR snapshot_date"),
    ]
    for a, b in pairs:
        t = t.replace(a, b)
    P.write_text(t, encoding="utf-8")
    print("OK", P, "size", P.stat().st_size)


if __name__ == "__main__":
    main()
