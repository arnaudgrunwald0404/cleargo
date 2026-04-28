# Roadmap Rewind Visualizer (RRV) → ClearGo bulk historical import

One-shot import per the merge plan (`.cursor/plans/merge-rrv-into-cleargo.plan.md` § 4a).
RRV's `roadmap` table is insert-only and feeds `roadmap_snapshot` in ClearGo.

> Run **once** during Phase 1 cutover. After this, the weekly cron
> (`/api/jobs/roadmap-snapshot`) keeps `roadmap_snapshot` current.

The import is **additive only** — it inserts into new ClearGo tables (`roadmap_snapshot`,
`confidence_rating`, `confidence_adjustment_history`, `pm_impact_override`,
`roadmap_hidden_item`) and into `epic_comment` rows tagged `category='movement'`.
All inserts use `ON CONFLICT … DO NOTHING`, so reruns are safe.

---

## Recommended path: GitHub Actions cutover (production)

Runs on a clean Ubuntu runner with `psql`/`pg_dump` already installed —
no operator tooling required, secrets stay in GitHub, every run is auditable
in the workflow logs and uploads the dump + reconciliation report as an artifact.

### One-time setup

1. **Repo secrets** (Settings → Secrets and variables → Actions):
   - `RRV_DATABASE_URL` — `postgres://postgres:<pw>@db.<rrv-ref>.supabase.co:5432/postgres`
   - `CLEARGO_DATABASE_URL` — same shape, target ClearGo project. Operator
     swaps this between the dev test and the production cutover.
2. **GitHub Environment** (Settings → Environments → `rrv-import`, optional but
   strongly recommended for production): add yourself as a Required reviewer.
   This pauses the `insert` job for manual approval before any writes.
3. Confirm migrations through `20260427100000_roadmap_rewind_schema.sql` are
   applied to the target Supabase project. Partitions for 2023-01 → 2032-12
   are pre-created by that migration.

### Run order

1. **Dev test** — set `CLEARGO_DATABASE_URL` to the dev/staging Supabase project.
   - Run **Actions → "RRV → ClearGo Bulk Import" → Run workflow** with
     `confirm_project_ref` set to the dev project ref (e.g. `zgmlspqannohbhbdoakb`)
     and `do_insert = false`.
   - Review the job summary + downloaded artifact (`reconcile-dry-run.log`,
     `stage.log`, the SQL dump). Confirm coverage % and the unmatched-keys list
     are acceptable.
   - Re-run with `do_insert = true`. The `insert` job will write into the dev
     project. Confirm the parity-check log shows zero mismatches.
2. **Production cutover** — update `CLEARGO_DATABASE_URL` to the production
   Supabase project URL, then repeat the two-pass run. The
   `confirm_project_ref` input must match the new URL or the workflow refuses
   to proceed (catches the most common foot-gun: forgetting to swap the secret).

The `insert` job re-verifies the ref → URL match before writing, so a secret
rotation between the two job phases is also caught.

### What gets uploaded

- `rrv-import-<ref>-<timestamp>` (30-day retention) — full pg_dump, staging
  log, dry-run reconciliation report. **Contains production-equivalent data**;
  treat as sensitive. Set `retention-days` lower in the workflow if desired.
- `rrv-import-<ref>-<timestamp>-insert` (90-day retention) — the actual insert
  log, parity-check output, and staging-drop confirmation.

---

## Local dev path: Node-based importer (REST / HTTPS, no psql required)

For local rehearsal against your dev ClearGo Supabase project, use the all-in-one
Node script — it uses the Supabase JS client over HTTPS, so it works on
Windows/macOS/Linux without `psql`/`pg_dump`/Docker and bypasses the Supabase
Postgres pooler entirely (no SCRAM/IPv6 weirdness).

### Prerequisites

- `npm install` has been run
- Service-role keys for both projects:
  - `RRV_SUPABASE_SERVICE_ROLE_KEY` — RRV's Supabase project (read)
  - `CLEARGO_SUPABASE_SERVICE_ROLE_KEY` — your dev ClearGo project (write).
    The script also accepts `SUPABASE_SERVICE_ROLE_KEY` from `.env` as a
    fallback, which is what you most likely already have set up.
- The RRV migrations have been applied to the dev ClearGo project. The script
  refuses to run if any of the 6 destination tables are missing and tells you
  the exact `supabase db push` command to fix it.
- The Supabase project URLs are derived from the `ref` claim in each
  service-role JWT, so you usually only need to set the keys. Override with
  `RRV_SUPABASE_URL` / `CLEARGO_SUPABASE_URL` if you want to point at a
  different project.

Get the service-role keys from
`https://supabase.com/dashboard/project/<ref>/settings/api` (the row labelled
**service_role** — never check this into git).

### Run

PowerShell:

```powershell
# Add this once to your .env (or set in the current shell)
$env:RRV_SUPABASE_SERVICE_ROLE_KEY = "eyJ…"

# Dry run — reads RRV, prints coverage % and unmatched-key list; no writes.
npm run rrv-import:local

# After reviewing the dry-run output, perform the inserts.
# Easiest in PowerShell — call node directly so the flag isn't eaten by npm:
node scripts/rrv-import/local-import.mjs --do-insert
# …or use the env-var fallback that works in any shell:
$env:DO_INSERT = "true"; npm run rrv-import:local
```

bash/zsh:

```bash
export RRV_SUPABASE_SERVICE_ROLE_KEY="eyJ…"
npm run rrv-import:local
npm run rrv-import:local -- --do-insert
```

The script header prints the source/target URLs before doing anything — confirm
they're what you expect. All inserts are idempotent (upserts with
`ignoreDuplicates: true` against the matching unique constraint, or JS-side
fingerprint dedup for the two tables that have no unique constraint), so
reruns are safe.

### Flags

- `--do-insert` — actually run the inserts after diagnostics. Default: dry-run only.
- `--page-size=N` — PostgREST page size when reading RRV (default 1000, max 1000).
- `--batch-size=N` — max rows per cleargo upsert/insert call (default 500).
- `--sample-size=N` — parity-check sample size (default 20).

---

## Bash/psql path (CI runners and Linux/macOS dev)

Same logical pipeline as the Node script, but split across `01..04` files.
The GH Actions workflow above uses these.

### Prerequisites

- `pg_dump` and `psql` from PostgreSQL ≥ 14 client tools
- Two database URLs:
  - `RRV_SUPABASE_DB_URL` — RRV's Supabase project (read)
  - `CLEARGO_SUPABASE_DB_URL` — ClearGo's Supabase project (write)
- ClearGo migrations through `20260427100000_roadmap_rewind_schema.sql` already applied

### Steps

#### A. Export from RRV

```bash
export RRV_SUPABASE_DB_URL=postgres://…
bash scripts/rrv-import/01-export-from-rrv.sh
# → writes ./tmp/rrv-import/rrv_data.sql
```

Skips `reactions`, `user_visits`, and `ai_description_cache` (feature-dropped per § 2).

#### B. Stage into ClearGo

```bash
export CLEARGO_SUPABASE_DB_URL=postgres://…
bash scripts/rrv-import/02-stage-into-cleargo.sh
# → creates schema rrv_import.* in ClearGo Supabase
```

#### C. Reconcile (dry run, then insert)

```bash
# Dry run — counts + unmatched-key list, no writes to public.*
psql "$CLEARGO_SUPABASE_DB_URL" -f scripts/rrv-import/03-reconcile-and-insert.sql

# After review, re-run with the insert flag set:
psql "$CLEARGO_SUPABASE_DB_URL" -v rrv_import_do_insert=1 \
  -f scripts/rrv-import/03-reconcile-and-insert.sql
```

The script:

1. Reports `roadmap` row counts, distinct `aha_key`s, and how many match `epic.aha_id`
2. Lists up to 100 unmatched keys for triage
3. (Gated) Inserts `roadmap` → `roadmap_snapshot` with `epic_id` populated via LEFT JOIN
   (orphan `aha_key`s land with `epic_id = NULL` per the plan's "deleted/merged" bucket)
4. Migrates `pm_notes` → `epic_comment` with `category='movement'`
5. Migrates `confidence_ratings`, `confidence_adjustment_history`, `pm_impact_overrides`,
   `hidden_items` straight across, populating new `epic_id` columns where present
6. `ANALYZE`s the new tables and prints final row counts

#### D. Validate (recommended)

```bash
node scripts/rrv-import/04-parity-check.mjs
# → samples 20 random aha_keys and compares row counts + latest snapshot_date
#   between RRV and ClearGo.
```

#### E. Drop staging

```bash
psql "$CLEARGO_SUPABASE_DB_URL" -c 'DROP SCHEMA rrv_import CASCADE;'
```

---

## Rollback

The import is additive — it only inserts into new ClearGo tables. To roll back:

```sql
TRUNCATE TABLE public.roadmap_snapshot;
TRUNCATE TABLE public.confidence_rating, public.confidence_adjustment_history,
              public.pm_impact_override, public.roadmap_hidden_item;
DELETE FROM public.epic_comment WHERE category = 'movement';  -- only the imported PM notes
DROP SCHEMA IF EXISTS rrv_import CASCADE;
```

The existing `epic` table and any non-movement `epic_comment` rows are untouched.
