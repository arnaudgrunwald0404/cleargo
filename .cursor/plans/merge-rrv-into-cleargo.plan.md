# Merge Roadmap Rewind Visualizer into ClearGo

**Status:** Ready for kickoff — all open questions resolved
**Estimated effort:** 3–4 weeks of focused work for one developer
**Source app:** `c:/Users/AllenDepew/dyad-apps/roadmap-rewind-visualizer-main` (RRV)
**Target app:** `c:/Repos/cleargo` (ClearGo)

---

## 1. Goal & Strategy

Combine ClearGo (launch readiness console) and Roadmap Rewind Visualizer (roadmap snapshot/movement tracker) into a single product hosted in the ClearGo repo.

**Strategy:** Adopt ClearGo's UI, design system, auth, and integrations as the foundation. Port RRV's unique features (snapshot history, release-movement analytics, confidence ratings) as new pages/components/tabs in ClearGo. Drop RRV's auth, navigation, design system, and any features ClearGo already does better.

**Key insight:** Both apps already share the same Aha! source data, joined by `aha_key` ↔ `epic.aha_id` (Aha! `reference_num`, e.g. `CC-EPIC-123`). ClearGo holds the **current state** of each epic; RRV holds **time-series history** of how each epic has moved across the roadmap. They are complementary, not competing.

> ⚠️ Earlier draft used `epic.aha_ref` — the actual column is `epic.aha_id` (see `src/lib/aha/mapping.ts` and `supabase/migrations/20240101000000_initial_schema.sql`). Every join below uses `aha_id`.

---

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| Supabase consolidation | Migrate RRV's tables/RPCs/data **into ClearGo's existing Supabase project** |
| Rollout shape | Full phased plan (no PoC slice) |
| Default rule | **Favor ClearGo wherever possible**; only port RRV features that have no equivalent |
| Churn Analysis | **Drop** (was alpha) |
| Reactions (emoji buttons) | **Drop** |
| PM Notes | **Fold into ClearGo comments**, but preserve PM Notes categorization (Internal/External movement cause + from/to release) |
| Visit tracking | **Drop**, use ClearGo's `user_activity` |
| AI Roadmap Assistant (chat) | **Drop** |
| AI-generated card descriptions (`ai_description_cache`) | **Drop** (ride-along with Assistant — we're cutting the entire AI surface for the rewind module) |
| Access control for snapshot/rewind views | **Universal read** — every authenticated ClearGo user can see Roadmap Snapshot and Roadmap Rewind, matching RRV's "everyone in the company has access" model. PM-adjust controls remain role-gated. |
| Confidence ratings | Port |
| Release movement heatmap, snapshot view, rewind analytics | Port |

---

## 3. Tech Stack Alignment

| Concern | Decision |
|---|---|
| Framework | Keep Next.js 16 App Router |
| UI | Mantine 8 + Tailwind 4 (no shadcn survives the merge) |
| Data fetching | Add `@tanstack/react-query` to ClearGo for new pages |
| Charts | Add `recharts` to ClearGo |
| AI | **No new AI surface added** for the rewind module (Assistant + card descriptions both dropped). ClearGo's existing `@ai-sdk/anthropic`/`@ai-sdk/google` stay untouched for their current uses. |
| Auth | Use ClearGo's JWT + role-based system; drop RRV's `PasswordProtection` and `sessionStorage` flag |
| API | Port RRV's Express endpoints (`api/*`) to Next.js Route Handlers in `src/app/api/*` |
| Routing | All RRV `react-router-dom` paths translated to file-based Next.js routes |

**New deps to add to `package.json`:**
- `@tanstack/react-query@^5`
- `recharts@^3`
- `react-day-picker@^9` (if Mantine DatePicker doesn't cover the use case)

---

## 4. Data Model Changes

### How ClearGo captures historical data today (audit reference)

ClearGo treats `epic` as live state synced from Aha! and **does not take row-level weekly snapshots**. The history that does exist is field-level / event-level:

| Existing table | What it captures | Granularity |
|---|---|---|
| `epic_history` (`20260419000003`) | One row per field change (`field_name`, `old_value`, `new_value`, `changed_by`, `changed_at`) | Field-level audit log |
| `audit_log` (`20240101000000`) | Generic `json_diff` per entity change | Diff-level |
| `decision_snapshot` | Go/No-Go verdicts with full snapshot JSON | Per decision only |
| `criterion_status_history` (`20260309000000`) | Criterion status transitions per epic | Per status change |
| `metric_history` / `epic_success_metric_history` | HEART/success metric values over time | Per metric measurement |

**None of these reproduce a full weekly roadmap snapshot** — that's the gap RRV's `roadmap` table fills. The `roadmap_snapshot` table below is therefore additive, not duplicative, of ClearGo's existing history.

### Tables to **add** to ClearGo Supabase

| New table | Source | Notes |
|---|---|---|
| `roadmap_snapshot` | RRV `roadmap` | Time-series snapshots. **Declared as a partitioned table from day one** — `PARTITION BY RANGE (snapshot_date)` with monthly child partitions. See § 4c for partitioning details. Add `epic_id uuid REFERENCES epic(id) ON DELETE SET NULL` populated via `aha_key = epic.aha_id`. Insert-only (one row per epic per weekly run). |
| `confidence_rating` | RRV `confidence_ratings` | One row per (aha_key, snapshot_date). RLS rewritten for ClearGo role model. |
| `confidence_adjustment_history` | RRV same | Append-only audit log of PM adjustments. |
| `pm_impact_override` | RRV same | PM overrides for impact level on a movement. |
| `hidden_item` | RRV same | User-hidden roadmap items (per-user, not global). |
| ~~`ai_description_cache`~~ | **dropped** | AI Assistant + card descriptions removed; no need for this cache. |

### RPCs to port (PostgreSQL functions)
- `get_latest_and_previous_roadmap_versions`
- `get_weekly_roadmap_changes(releases)`
- `get_quarter_to_date_roadmap_changes(releases)`
- `get_year_to_date_roadmap_changes(releases)`
- `get_all_year_release_movements`
- `get_yearly_movements`
- `get_release_delivery_metrics`
- `get_period_release_delivery_metrics`
- `get_priority_goals_delivery_metrics`
- `get_strategic_items_detail`
- `get_impact_categorized_movements`

All RPCs must have RLS-aware wrappers or use security definer with explicit auth checks.

### Tables to **drop** entirely from RRV
- `pm_notes` — folded into new `epic_comment` (see below)
- `reactions` — feature dropped
- `user_visits` — replaced by ClearGo's `user_activity`

### New table to **create** in ClearGo: `epic_comment`

ClearGo's existing `criterion_comment` is keyed to `epic_criterion_status`, not epics. PM Notes need an epic-level comment table:

```sql
CREATE TABLE public.epic_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES epic(id) ON DELETE CASCADE,
  comment_text text NOT NULL CHECK (LENGTH(TRIM(comment_text)) > 0),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- PM Notes movement-cause categorization (preserved from RRV)
  category text NULL CHECK (category IN ('general', 'movement', 'risk', 'decision')),
  movement_cause text NULL CHECK (movement_cause IN ('Internal', 'External')),
  movement_date timestamptz NULL,
  from_release text NULL,
  to_release text NULL,
  -- Optional snapshot context for rewind-tab linkage
  related_snapshot_date date NULL
);
CREATE INDEX idx_epic_comment_epic ON epic_comment(epic_id, created_at DESC);
CREATE INDEX idx_epic_comment_category ON epic_comment(category) WHERE category IS NOT NULL;
CREATE INDEX idx_epic_comment_movement ON epic_comment(epic_id, movement_date) WHERE movement_date IS NOT NULL;
ALTER TABLE epic_comment ENABLE ROW LEVEL SECURITY;
-- RLS policies aligned with ClearGo's role model (read=all authed, write=PM/PMM/PRODUCT_OPS/admin)
```

PM Notes data migration: every `pm_notes` row → `epic_comment` row with `category='movement'`, copying movement_cause/movement_date/from_release/to_release.

### Permissions/capabilities to add (`src/lib/permissions.ts`)

Universal read access — Roadmap Snapshot, Roadmap Rewind, and Confidence views are visible to **every authenticated ClearGo user**, matching RRV's "everyone in the company has access" model. We don't add `*.read` capabilities for these, because gating on "is authenticated" is already covered by the auth middleware. Only **write/adjust** actions are role-gated:

- `roadmap.confidence.adjust` (PM / PRODUCT_OPS / CPO only)
- `roadmap.impactOverride.write` (PM / PRODUCT_OPS only)
- `roadmap.hiddenItem.write` (any authed — per-user setting, no special role)
- `roadmap.movementNote.write` (any authed — same model as ClearGo's existing comment threads)

---

## 4a. Bulk historical-data migration (RRV Supabase → ClearGo Supabase)

RRV's `roadmap` table is **insert-only** (every weekly n8n run appends — never updates), so the migration is a one-shot bulk copy. Run once during Phase 1.

**Step A — Export from RRV's Supabase**

```bash
pg_dump --data-only \
  --table=public.roadmap \
  --table=public.confidence_ratings \
  --table=public.confidence_adjustment_history \
  --table=public.pm_notes \
  --table=public.pm_impact_overrides \
  --table=public.hidden_items \
  --table=public.ai_description_cache \
  "$RRV_SUPABASE_DB_URL" \
  > rrv_data.sql
```

Skip `reactions` and `user_visits` — feature-dropped per § 2.

**Step B — Land into a `rrv_import` staging schema in ClearGo Supabase**

```bash
sed 's/public\./rrv_import./g' rrv_data.sql > rrv_data.staged.sql
psql "$CLEARGO_SUPABASE_DB_URL" -c "CREATE SCHEMA rrv_import;" -f rrv_data.staged.sql
```

Staging schema = no FK to `epic`, so the import never fails on key mismatches.

**Step C — Reconcile `aha_key` ↔ `epic.aha_id`** (the riskiest step)

```sql
-- Coverage check
SELECT
  COUNT(DISTINCT r.aha_key)                                 AS rrv_distinct_keys,
  COUNT(DISTINCT e.aha_id)                                  AS matched_in_cleargo,
  COUNT(DISTINCT r.aha_key) FILTER (WHERE e.id IS NULL)     AS unmatched_keys
FROM rrv_import.roadmap r
LEFT JOIN public.epic e ON e.aha_id = r.aha_key;

-- Triage list of unmatched keys
SELECT DISTINCT r.aha_key, r.aha_name, MAX(r.created_at) AS last_seen
FROM rrv_import.roadmap r
LEFT JOIN public.epic e ON e.aha_id = r.aha_key
WHERE e.id IS NULL
GROUP BY r.aha_key, r.aha_name
ORDER BY last_seen DESC;
```

**Buckets of unmatched keys** and how to handle each:
- *Epics RRV's report tracks but ClearGo's Aha! sync never pulled* → backfill via the existing Aha! ingestion path (preferred — preserves continuity)
- *Epics deleted/merged in Aha! but still in RRV history* → keep snapshots in `roadmap_snapshot` with `epic_id = NULL` (the FK is `ON DELETE SET NULL`); they'll still be queryable by `aha_key` for historical accuracy
- *Mismatched key formats* → unlikely (same Aha! tenant) but reconcile manually if it appears

**Step D — Final copy with FK populated**

```sql
INSERT INTO public.roadmap_snapshot (
  epic_id, aha_key, aha_name, aha_release, aha_release_date,
  aha_start_date, aha_end_date, aha_status, aha_t_shirt_est,
  aha_primary_goal, aha_calculated_devs, aha_owner, aha_initial_est,
  aha_pod, jira_key, aha_csm_priority, aha_progress, aha_description,
  snapshot_date, created_at
)
SELECT
  e.id, r.aha_key, r.aha_name, r.aha_release, r.aha_release_date,
  r.aha_start_date, r.aha_end_date, r.aha_status, r.aha_t_shirt_est,
  r.aha_primary_goal, r.aha_calculated_devs, r.aha_owner, r.aha_initial_est,
  r.aha_pod, r.jira_key, r.aha_csm_priority, r.aha_progress, r.aha_description,
  r.created_at::date, r.created_at
FROM rrv_import.roadmap r
LEFT JOIN public.epic e ON e.aha_id = r.aha_key;  -- LEFT JOIN preserves orphan history
```

Then:
- `pm_notes → epic_comment` (with `category='movement'`)
- `confidence_ratings`, `confidence_adjustment_history`, `pm_impact_overrides`, `hidden_items`, `ai_description_cache` straight across — already keyed by `aha_key`; populate their new `epic_id` columns via the same `LEFT JOIN`

**Step E — Index, ANALYZE, drop staging**

```sql
ANALYZE public.roadmap_snapshot, public.confidence_rating, public.epic_comment;
DROP SCHEMA rrv_import CASCADE;
```

**Validation gate before declaring success** (from Phase 5):
- Pick 20 random `aha_key`s; assert `roadmap_snapshot` row counts and most-recent `snapshot_date` match RRV's `roadmap` for each
- Confirm `pm_notes` → `epic_comment` row count matches and movement-cause fields round-trip

---

## 4b. Snapshot ingestion — replacing n8n with a ClearGo cron job

**Decision:** the n8n workflow is **not** carried over. Snapshot capture lives entirely inside ClearGo as a Next.js Route Handler triggered by GitHub Actions cron, matching the pattern of the existing 13 `/api/jobs/*` endpoints. This is built in **Phase 1**, not Phase 5 — there is no parallel-run period because n8n is retired before launch.

### What we're replacing (reference inventory of the n8n workflow)

For each n8n node, the equivalent in the TypeScript port:

| n8n node | What it does | TS equivalent |
|---|---|---|
| `Schedule Trigger` (7-day interval) | Fires the workflow weekly | GitHub Actions cron `0 8 * * 1` → POST `/api/jobs/roadmap-snapshot` |
| `Config URL` (function node) | Seeds the first page URL `…/api/v1/bookmarks/custom_pivots/7536220207968959930?view=list` and propagates `next` between pages | Loop initializer in the route handler; pivot ID from `process.env.AHA_ROADMAP_PIVOT_ID` |
| `Get Aha Roadmap` (HTTP request, header auth) | Fetches one page from Aha! | `fetch()` via existing `src/lib/aha/client.ts`, reusing the workspace's `AHA_API_TOKEN`/`AHA_DOMAIN` |
| `Normalize Data` (code node, ~120 lines of JS) | Flattens each cell to a scalar; handles `rich_value` (object/string/array), `text_value`, `html_value`, `plain_value`; special-cases `Epic progress bar` to extract integer percent; regex-extracts `aha_key` from the first column's HTML link `/\/epics\/([A-Z]+-[A-Z]+-\d+)/` | New module `src/lib/aha/pivotNormalizer.ts` — line-for-line TS port, with Jest tests covering each branch |
| `Edit Fields` (set node) | Maps 17 pivot column titles → DB column names | A typed mapping table in `src/lib/aha/pivotNormalizer.ts` |
| `Save Roadmap` (Supabase insert) | Appends rows to `roadmap` | Supabase admin-client batch insert into `roadmap_snapshot` |
| `Edit Fields1` + `Check if pagination?` + `Get Next Page` | Re-builds the paginated URL by incrementing `page=` | `while (url)` loop using the `next` URL from each page response; falls back to incrementing `page=` if absent (mirrors n8n's `(?:replace /page=\d+/) ?? (?:append page=N)` logic) |

### Implementation deliverables in Phase 1

**1. `src/lib/aha/pivotNormalizer.ts`** — port the entire `Normalize Data` JS verbatim. Preserve every behavior:
- The `pickValue(cell, columnTitle)` precedence order: `rich_value` (handle array/object/string forms) → `text_value` → stripped `html_value` → `plain_value`
- The `Epic progress bar` short-circuit: parse percentage from html or text via `/(\d+)%/`, return `null` if neither yields a match (do **not** fall through to the generic path)
- The `fromObject(obj)` helper that prefers `name | label | value | text`, then `values | choices | options | items` arrays joined by `, `, then "first stringy property" as last resort
- The `aha_key` extraction from column 0's HTML: `/\/epics\/([A-Z]+-[A-Z]+-\d+)/`
- `INCLUDE_EMPTY_FIELDS = true` behavior — every column key is present even when null

**2. `src/lib/aha/pivotMapping.ts`** — a typed map from pivot column title → `roadmap_snapshot` column. Exact mapping from the n8n `Edit Fields` node:

| Pivot column title | DB column | Notes |
|---|---|---|
| `Epic key` | `aha_key` | Primary join key |
| `Epic name` | `aha_name` | |
| `Epic description` | `aha_description` | |
| `Epic start date` | `aha_start_date` | |
| `Epic end date` | `aha_end_date` | |
| `Epic status` | `aha_status` | |
| `T-Shirt Est.` | `aha_t_shirt_est` | |
| `Primary Goal - '25/'26` | `aha_primary_goal` | Year-tagged label — **see § 4b note below** |
| `Est. Applied Devs` | `aha_calculated_devs` | |
| `Epic assigned to email` | `aha_owner` | n8n stores the **email** in `aha_owner`, not the display name |
| `Epic initial estimate` | `aha_initial_est` | |
| `Epic releases name` | `aha_release` | |
| `Dev Backlog/Pod` | `aha_pod` | |
| `Jira key` | `jira_key` | |
| `Epic releases date (external)` | `aha_release_date` | |
| `CSM Priority` | `aha_csm_priority` | |
| `Epic progress bar` | `aha_progress` | Integer percent, post-normalizer |

> The pivot column for primary goal is named `Primary Goal - '25/'26`. Each fiscal year you'll likely rename it in Aha!. Either keep the mapping as a regex (`/^Primary Goal/`) or treat the column title as a configurable env var. **Recommend regex** to avoid yearly maintenance.

**3. `src/app/api/jobs/roadmap-snapshot/route.ts`** — the cron endpoint:

```ts
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const pivotId = process.env.AHA_ROADMAP_PIVOT_ID!;
  let url: string | null =
    `https://${process.env.AHA_DOMAIN}.aha.io/api/v1/bookmarks/custom_pivots/${pivotId}?view=list`;

  let totalInserted = 0;
  let unmatched: string[] = [];

  while (url) {
    const page = await ahaFetchPivot(url); // wraps fetch() with Aha! auth + retry
    const normalized = normalizePivotRows(page); // port of the n8n JS
    const mapped = normalized.map(mapPivotRowToSnapshot); // typed column map
    const epicIdByKey = await lookupEpicIdsByAhaKey(supabase, mapped.map(m => m.aha_key));

    const rows = mapped.map(m => {
      const epicId = epicIdByKey.get(m.aha_key) ?? null;
      if (!epicId) unmatched.push(m.aha_key);
      return { ...m, epic_id: epicId, snapshot_date: snapshotDate };
    });

    const { error } = await supabase.from('roadmap_snapshot').insert(rows);
    if (error) throw error;
    totalInserted += rows.length;

    url = nextPageUrl(page); // mirrors n8n's "next ?? page=N+1" logic
  }

  if (unmatched.length > 0) {
    await notifyUnmatchedAhaKeys(unmatched, snapshotDate); // Slack alert
  }

  return NextResponse.json({
    ok: true,
    snapshot_date: snapshotDate,
    rows_inserted: totalInserted,
    unmatched_aha_keys: unmatched.length,
  });
}
```

Wrapped with `withRateLimit` and using the existing Aha! retry/backoff helpers from `src/lib/aha/client.ts` so the route inherits ClearGo's standard 3-retry exponential-backoff behavior.

**4. `.github/workflows/roadmap-snapshot.yml`** — GitHub Actions cron at `0 8 * * 1` (Monday 08:00 UTC), POSTing to `/api/jobs/roadmap-snapshot` with the `CRON_SECRET` header. Mirror the existing job workflows like `.github/workflows/weekly-digest.yml`.

**5. Jest tests** — `src/lib/aha/__tests__/pivotNormalizer.test.ts` covering the four tricky cases:
- `rich_value` as object, array, and string
- `Epic progress bar` html-encoded percent extraction
- `aha_key` regex against the first cell's `html_value`
- The "skip rich_value, use text_value" fallback path

### Why we can confidently retire n8n

The n8n workflow has **zero data-only logic** — every transformation is either an HTTP fetch (replicated), an Aha! pivot pagination scheme (replicated), or the `Normalize Data` JS function (replicated verbatim). No part of it depends on n8n features (no triggers from external systems, no credential sharing across workflows). It's purely a scheduled ETL job, which Next.js Route Handlers + GitHub Actions cron handle natively.

### New env vars (add to CLAUDE.md → Required)

| Variable | Purpose |
|---|---|
| `AHA_ROADMAP_PIVOT_ID` | Aha! custom-pivot ID for the weekly snapshot report (currently `7536220207968959930`) |

`AHA_DOMAIN` and `AHA_API_TOKEN` are already required by the existing Aha! integration — no new auth.

### Cutover plan (no parallel run needed)

Because we're not carrying n8n forward at all:

1. Phase 1 lands the cron job in production, gated by `FEATURE_ROADMAP_REWIND` so it can run *before* the UI ships.
2. First scheduled run lands in `roadmap_snapshot`. Smoke-test that row counts roughly match what the previous week's n8n run produced in RRV's Supabase.
3. Once verified, **disable the n8n workflow** (set `active: false` in the n8n UI, don't delete — keep it as a documented reference for one quarter, then archive).
4. Phase 5 cleanup deletes RRV's old `roadmap` table and Supabase project.

If the smoke test fails, re-enable the n8n workflow (it's still pointed at the old RRV Supabase, which is intact through Phase 5 anyway), debug, redeploy. No data loss either way because the bulk import in § 4a already preserved everything pre-merge.

---

## 4c. Partitioning strategy for `roadmap_snapshot`

**Decision:** declare `roadmap_snapshot` as a `PARTITION BY RANGE (snapshot_date)` table from the very first migration, with **monthly partitions**. Do this even though row counts won't justify it for a couple of years — the cost of declaring partitioning up front is near-zero, and converting a non-partitioned table later is painful (table swap with constraints/indexes/RLS reattach).

### Why partition at all, and why monthly

- **Working set is by date range.** Every RRV RPC starts with a `WHERE snapshot_date >= …` filter (latest, latest+previous, weekly window, quarter-to-date, year-to-date, year-boundary deltas). Range partitioning on `snapshot_date` lets Postgres prune entire months from query plans for free.
- **Volume is predictable.** ~200 epics × 52 weeks/year = ~10K rows/year. After 5 years that's ~50K rows. Tiny by Postgres standards, but RPCs do `LATERAL` joins and self-joins across multiple snapshots, which is where partition pruning earns its keep.
- **Monthly granularity is the sweet spot.** Quarterly is too coarse (single partition holds 13 weeks of snapshots — half the typical query window), weekly is too fine (~5K partitions in a decade — bloats the planner's relcache). Monthly (~120 partitions in 10 years) is what Postgres docs and Citus/Timescale guidance both recommend for time-series with this cadence.
- **RLS attaches cleanly.** Postgres automatically inherits RLS policies onto child partitions, so we set policies once on the parent.

### Schema sketch

```sql
CREATE TABLE public.roadmap_snapshot (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  epic_id         uuid REFERENCES epic(id) ON DELETE SET NULL,
  aha_key         text NOT NULL,
  snapshot_date   date NOT NULL,
  -- ... 17 Aha! pivot columns (aha_name, aha_release, …, aha_progress) ...
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, id)             -- partition key MUST be in PK
) PARTITION BY RANGE (snapshot_date);

CREATE INDEX ON public.roadmap_snapshot (epic_id, snapshot_date DESC);
CREATE INDEX ON public.roadmap_snapshot (aha_key,  snapshot_date DESC);
CREATE INDEX ON public.roadmap_snapshot (snapshot_date);

ALTER TABLE public.roadmap_snapshot ENABLE ROW LEVEL SECURITY;

-- Pre-create partitions for the historical import window + next 12 months
CREATE TABLE roadmap_snapshot_2024_01 PARTITION OF public.roadmap_snapshot
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- … one per month covering RRV's earliest snapshot through 2027-04-01 …
```

### Automatic partition creation

ClearGo already runs scheduled jobs via GitHub Actions cron (`/api/jobs/*`). Add a tiny one to keep partitions ahead of the calendar:

- **`src/app/api/jobs/ensure-snapshot-partitions/route.ts`** — runs monthly (`0 0 1 * *`), checks that partitions exist for current month + next 3 months, creates any missing ones via `pg_partman` (preferred) or a `CREATE TABLE … PARTITION OF` template. Idempotent.

Alternative: install `pg_partman` extension and let it manage retention/creation automatically. Either works; the cron-job approach is simpler if `pg_partman` requires extra Supabase support tickets.

### Indexes go on the parent

All three indexes (`(epic_id, snapshot_date DESC)`, `(aha_key, snapshot_date DESC)`, `(snapshot_date)`) are declared on the parent table. Postgres automatically creates matching local indexes on each child partition. No special handling needed in the cron job.

### What this does NOT solve

Partitioning is a query-planner aid, not a write-throughput aid. Weekly inserts of ~200 rows per pivot run are trivially small either way. If the snapshot job ever expands to multiple pivots or much higher row counts, revisit then.

### Bulk-import compatibility

The `INSERT ... SELECT` from § 4a Step D works against the partitioned parent — Postgres routes each row to the correct child partition automatically. Just make sure all the pre-created partitions cover the full date range of RRV's historical data (the `pg_dump` output's earliest `created_at` tells you the lower bound).

---

## 5. Information Architecture (Sidebar)

**Current ClearGo sidebar:**
```
Home
Releases
  ├ Portfolio
  ├ Releases
  └ Comments
GTM Launches (admin/PMM)
  ├ Planning
  └ Comments
Tools
  ├ Analytics
  ├ Feedback
  └ Settings
```

**After merge:**
```
Home
Releases
  ├ Portfolio
  ├ Releases
  ├ Roadmap Snapshot      ← NEW (RRV "This Week")
  ├ Roadmap Rewind        ← NEW (RRV "Performance Insights")
  └ Comments
GTM Launches (admin/PMM)
  ├ Planning
  └ Comments
Tools
  ├ Analytics
  ├ Feedback
  └ Settings
```

**Sidebar nav items are visible to every authenticated user** — no role gating on Roadmap Snapshot or Roadmap Rewind. Matches RRV's everyone-has-access model.

**Epic detail page (`/epics/[id]`)** gains two new tabs:
- **Rewind** — release/timeline/scope/owner change history for this epic, scrollable timeline, source = `roadmap_snapshot` deltas. Visible to everyone.
- **Confidence** — current confidence rating with breakdown. **Tab itself is visible to everyone**; the **PM adjustment control inside it** is gated by `roadmap.confidence.adjust`.

**Critical UX rule:** Anywhere a roadmap card is shown (e.g., the Snapshot or Rewind page), clicking it **navigates to `/epics/[id]`** and lands on the Rewind tab. No more standalone item-history slideout — the epic detail page is the single source of truth.

---

## 6. Phased Plan

### Phase 0 — Foundation (1–2 days)

- [ ] Add deps: `@tanstack/react-query`, `recharts` (and `react-day-picker` only if Mantine DatePicker can't cover the snapshot picker)
- [ ] Wrap `src/app/layout.tsx` with `<QueryClientProvider>`
- [ ] Confirm Supabase project for the merge; export RRV data via `pg_dump` for replay
- [ ] Create feature flag `FEATURE_ROADMAP_REWIND` in `src/lib/flags.ts` so rollout is gated
- [ ] Add new write/adjust capabilities to `src/lib/permissions.ts` (`roadmap.confidence.adjust`, `roadmap.impactOverride.write`, `roadmap.hiddenItem.write`, `roadmap.movementNote.write`) — no `*.read` capabilities since views are universal

### Phase 1 — Schema migration (2–3 days)

- [ ] Migration: create `roadmap_snapshot` as **`PARTITION BY RANGE (snapshot_date)` from day one** — see § 4c. Schema mirrors RRV's `roadmap` columns: `aha_key`, `aha_name`, `aha_description`, `aha_start_date`, `aha_end_date`, `aha_status`, `aha_t_shirt_est`, `aha_primary_goal`, `aha_calculated_devs`, `aha_owner`, `aha_initial_est`, `aha_release`, `aha_release_date`, `aha_pod`, `jira_key`, `aha_csm_priority`, `aha_progress`, `created_at`. PK `(snapshot_date, id)`. Indexes on parent: `(epic_id, snapshot_date DESC)`, `(aha_key, snapshot_date DESC)`, `(snapshot_date)`. Pre-create monthly partitions covering the historical-import window through current month + 12.
- [ ] Migration: create `src/app/api/jobs/ensure-snapshot-partitions/route.ts` (monthly cron, keeps current+next-3-months partitions ahead of the calendar)
- [ ] Migration: create `confidence_rating`, `confidence_adjustment_history`, `pm_impact_override`, `hidden_item` (no `ai_description_cache` — AI features dropped)
- [ ] Migration: create `epic_comment` (with PM Notes categorization columns)
- [ ] Port all RRV RPCs as Supabase functions, with ClearGo-aligned RLS / `SECURITY DEFINER` patterns
- [ ] **Bulk historical import — see § 4a below** (`pg_dump` from RRV → staging schema in ClearGo Supabase → reconcile `aha_key` ↔ `epic.aha_id` → `INSERT INTO public.roadmap_snapshot SELECT …`)
- [ ] One-time data import script: `pm_notes → epic_comment` with `category='movement'`, preserving `movement_cause`/`movement_date`/`from_release`/`to_release` and `related_snapshot_date = pm_notes.snapshot_date`
- [ ] **Snapshot ingestion — see § 4b below** (build the cron job from day one; n8n is being retired, not migrated)
  - [ ] `src/lib/aha/pivotNormalizer.ts` — verbatim TS port of the n8n `Normalize Data` JS, with Jest tests
  - [ ] `src/lib/aha/pivotMapping.ts` — typed pivot-column → DB-column map (use regex for `Primary Goal - '25/'26` to survive yearly renames)
  - [ ] `src/app/api/jobs/roadmap-snapshot/route.ts` — paginated Aha! pivot fetch → normalize → batch insert → Slack alert on unmatched `aha_key`s
  - [ ] `.github/workflows/roadmap-snapshot.yml` — `0 8 * * 1` cron, mirrors `weekly-digest.yml`
  - [ ] Add `AHA_ROADMAP_PIVOT_ID` to env docs and `CLAUDE.md` Required table
  - [ ] Smoke-test first run vs. last n8n run, then disable the n8n workflow (keep it `active: false` for one quarter as a reference, archive after)

### Phase 2 — Data layer port (3–4 days)

Port to ClearGo's `src/lib/services/` and React hooks (Mantine + TanStack Query):

- [ ] `useRoadmapData` (latest + previous snapshot diff)
- [ ] `useHistoricalRoadmapData(date)`
- [ ] `useAvailableSnapshots`
- [ ] `usePeriodReleaseMovements`
- [ ] `useYearlyMovements`
- [ ] `useReleaseDeliveryMetrics`
- [ ] `useImpactCategorizedMovements`
- [ ] `usePriorityGoalsDeliveryMetrics`
- [ ] `useStrategicItemsDetail`
- [ ] `useConfidenceRating`, `usePMImpactOverride`, `useHiddenItems`

Drop hooks that ClearGo replaces or whose features are dropped:
- `useVisitTracking`, `useVisitStats` (use `user_activity`)
- `useReactions` (feature dropped)
- `usePMNotes` (folded into `epic_comment` API)
- `useChurnData` (feature dropped)
- `useCardDescriptions` (AI summary cache — AI Assistant + descriptions dropped)
- `useRoadmapAssistant` / chat hooks (AI Assistant dropped)

Server-side wrappers for each Supabase RPC live under `src/app/api/roadmap/*/route.ts`, with `withRateLimit` + auth.

### Phase 3 — Feature pages & components (1 week)

New Next.js routes:
- [ ] `src/app/portfolio/snapshot/page.tsx` (was RRV `ThisWeek.tsx`, ~32KB) — port to Mantine
- [ ] `src/app/portfolio/rewind/page.tsx` (was RRV `Analytics.tsx`) — port to Mantine; **rename to "Roadmap Rewind"** to disambiguate from ClearGo's existing `/analytics`
- [ ] `src/app/epics/[id]/(tabs)/rewind/page.tsx` — new tab on epic detail
- [ ] `src/app/epics/[id]/(tabs)/confidence/page.tsx` — new tab on epic detail (gated)

Components to re-skin in Mantine (one-by-one, each in `src/components/roadmap/`):
- [ ] `RoadmapCard` → Mantine `Card`, links to `/epics/[id]?tab=rewind`
- [ ] `RoadmapFilters` → Mantine `Select` / `MultiSelect` / `DatePicker`
- [ ] `ReleaseMovementHeatmap` → Recharts inside Mantine `Card`
- [ ] `UpcomingReleaseImpact` → Mantine layout
- [ ] `ConfidenceBadge` → Mantine `Badge` + `Popover` for adjustment
- [ ] `ConfidenceAdjustmentDialog` → Mantine `Modal` + `Slider`
- [ ] `ImpactBadge`, `ImpactOverrideDialog` → Mantine equivalents
- [ ] `RoadmapStats`, `PriorityAndGoalsMetrics`, `ReleaseDeliveryMetrics` → Mantine + Recharts
- [ ] `ItemHistorySlideout` → **deleted** (replaced by epic detail Rewind tab)
- [ ] `SnapshotDateSelector` → Mantine `DatePicker` constrained to available snapshots

Components to **not port** (because dropped or replaced):
- `PasswordProtection`, `Layout`, `LeftNav` — replaced by ClearGo's `Sidebar`
- `ReactionButtons`, `VisitStatsDialog`, `VisitStatsView`
- `PMNotesDialog` — replaced by ClearGo comment thread filtered to `category='movement'`
- `churn/*`, `ChurnAnalysis.tsx`
- `RoadmapAssistant` and any AI chat UI — AI Assistant dropped
- AI-generated card description renderers (`useCardDescriptions` consumers) — AI descriptions dropped

### Phase 4 — Cross-cutting integration (3–4 days)

- [ ] On `/epics/[id]`, when `tab=rewind`, render the timeline of changes pulled from `roadmap_snapshot` deltas + `epic_comment` rows where `category='movement'`, sorted chronologically (this is the "Unified History & Notes" promise from RRV's release notes Oct 17)
- [ ] On the Rewind tab, expose a "Add movement note" action that opens a Mantine modal pre-populated with from/to release based on the selected change row, and writes an `epic_comment` with `category='movement'`
- [ ] Update Sidebar (`src/components/Sidebar.tsx`) to add new "Roadmap Snapshot" and "Roadmap Rewind" nav items under the Releases section — **visible to every authenticated user, no role gating**
- [ ] Update `EpicDetailTabs.tsx` to register the two new tabs — both **always visible**; only the confidence-adjustment control inside the Confidence tab is gated by `roadmap.confidence.adjust`

### Phase 5 — Cleanup & cutover (2–3 days)

- [ ] Validate data parity: spot-check 20 epics across ClearGo and RRV, confirm snapshots and confidence ratings render identically post-merge
- [ ] Remove `FEATURE_ROADMAP_REWIND` flag once stable
- [ ] Update `docs/PRD-Retroactive.md` with new Roadmap Rewind feature section (required by ClearGo's pre-commit hook)
- [ ] Archive RRV git repo with a README pointing to ClearGo
- [ ] Drop the dropped tables (`pm_notes`, `reactions`, `user_visits` etc.) from RRV's Supabase project once data is migrated; eventually delete the RRV Supabase project
- [ ] Update `CLAUDE.md` and `.cursorrules` to mention the new roadmap module
- [ ] Add Jest tests for confidence calculator port (`src/lib/roadmap/confidenceCalculator.ts`)
- [ ] Add Playwright e2e for Snapshot and Rewind pages

---

## 7. Risks & Guardrails

| Risk | Mitigation |
|---|---|
| Two parallel "epic" concepts confuse users | Strict rule: `epic` is the entity; `roadmap_snapshot` is just history of one of its fields. Cards always link to `/epics/[id]`. |
| RRV's "honor system" RLS is incompatible with ClearGo's role model | Rewrite all RLS during port; treat the migration as a security upgrade, not a copy. |
| Mantine vs shadcn = mixed UI mess | **Hard rule: zero shadcn components survive.** Every RRV component is rebuilt with Mantine. Don't dual-import. |
| Snapshot ingestion job parity | Verify the GitHub Actions cron runs on the same schedule RRV used, populating `roadmap_snapshot` weekly. |
| Express API endpoints don't run on Netlify Next.js | Each `api/*.js` from RRV is rewritten as a Next.js Route Handler with `force-dynamic`. |
| PM Notes movement context lost | Preserve `movement_cause`, `movement_date`, `from_release`, `to_release` columns on `epic_comment`. |
| Performance regression from joining `epic` ↔ `roadmap_snapshot` on every page load | Pre-compute hot paths server-side, cache in `@tanstack/react-query`, paginate where appropriate. Monthly partitioning on `snapshot_date` (§ 4c) lets the planner prune to one or two partitions for typical "current vs. previous week" queries. |
| Aha! key mismatches | Bulk-import script logs every `aha_key` that fails to find an `epic.aha_id`; reconcile via Aha! sync or accept as orphan history before declaring import complete. |
| Partition coverage gap (insert into a date with no matching child partition fails) | `ensure-snapshot-partitions` cron runs monthly to keep current+next-3-months covered; the bulk-import job pre-creates partitions covering the full historical date range. |

---

## 8. Out-of-Scope (Explicit Non-Goals)

- Churn Analysis page (dropped)
- Reactions on roadmap cards (dropped)
- RRV's password gate / sessionStorage auth (replaced by ClearGo auth)
- RRV's separate visit tracking (replaced by ClearGo `user_activity`)
- Maintaining shadcn components in ClearGo (forbidden)
- Keeping RRV repo alive after Phase 5
- **AI Roadmap Assistant chat** (dropped — no chat UI, no `/api/roadmap/assistant/route.ts`, no `react-markdown`/`remark-gfm` deps)
- **AI-generated card descriptions / `ai_description_cache`** (dropped together with the Assistant)
- **n8n workflow** (retired — replaced by the in-repo cron job in § 4b)
- **Role-based gating of Roadmap Snapshot / Roadmap Rewind / Confidence views** (every authenticated user sees them; only adjustment controls are role-gated)

---

## 9. Open Questions — All Resolved

- [x] ~~Confirm the production Aha! integration is currently feeding **both** ClearGo's `epic` table and RRV's `roadmap` table.~~ **Resolved:** ClearGo's `epic` is webhook/sync-driven from Aha! generally; RRV's `roadmap` is fed by an n8n workflow against Aha! custom pivot `7536220207968959930` on a 7-day schedule. After merge, n8n is **retired** (see § 4b) and replaced by `src/app/api/jobs/roadmap-snapshot/route.ts` running on GitHub Actions cron. ClearGo's existing webhook sync continues to maintain `epic`. Coverage gaps surface during the Phase 1 reconcile (§ 4a Step C).
- [x] ~~Confirm whether the n8n workflow should be carried over.~~ **Resolved:** No — port the logic to a ClearGo cron job in Phase 1, retire n8n at smoke-test time, archive after one quarter.
- [x] ~~Decide whether `roadmap_snapshot` should be partitioned.~~ **Resolved:** Yes, declared as `PARTITION BY RANGE (snapshot_date)` from the first migration, monthly child partitions, with a cron job (`ensure-snapshot-partitions`) keeping the calendar covered. Details in § 4c.
- [x] ~~Decide whether to expose Roadmap Rewind to non-Product roles.~~ **Resolved:** Universal access — every authenticated user sees Roadmap Snapshot, Roadmap Rewind, and the Confidence tab. Only the **adjustment controls** inside Confidence (and Impact Override / movement-note write actions) are role-gated.
- [x] ~~Confirm whether the Roadmap AI Assistant should be available on the epic detail Rewind tab.~~ **Resolved:** AI Assistant is **dropped entirely**. AI-generated card descriptions (`ai_description_cache`) are dropped with it. No new AI surface in the rewind module. ClearGo's existing AI integrations are untouched.

**Status:** Plan is ready for kickoff. Phase 0 can begin.
