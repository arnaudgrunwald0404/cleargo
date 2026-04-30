# Roadmap Snapshot & Rewind — Production Cutover Checklist

This is the one-shot checklist for promoting the Roadmap Snapshot / Roadmap Rewind feature (the merged-in RRV functionality) from local + GitHub-Actions-on-staging to **prod ClearGo**.

The migration is reversible up until you flip the feature flag for end users — every step before that is additive.

---

## 0. Pre-flight (do this once)

- [ ] Confirm you're on the merged feature branch and `npm install` is current
- [ ] Confirm the feature is working end-to-end in your local + dev Supabase environment (browse `/portfolio/snapshot` and `/portfolio/rewind`, drill into an epic, adjust a confidence rating, add a movement note)
- [ ] Confirm the GitHub Actions secrets and variables exist in the repo (Settings → Secrets and variables → Actions):
  - `secrets.RRV_SUPABASE_SERVICE_ROLE_KEY` — RRV project service-role key
  - `secrets.CLEARGO_SUPABASE_SERVICE_ROLE_KEY` — **prod** ClearGo service-role key
  - `vars.RRV_SUPABASE_URL` — `https://vthulsgytvlwvstelmya.supabase.co`
  - `vars.CLEARGO_SUPABASE_URL` — **prod** ClearGo Supabase URL

---

## 1. Apply migrations to prod

Apply in order — they're all idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`).

```bash
# from repo root, with the prod project linked
supabase db push --linked
```

Specifically these four are the new ones still pending in prod:

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/migrations/20260428100000_ensure_feature_flags_column.sql` | Adds `app_settings.feature_flags JSONB DEFAULT '{}'` if missing |
| 2 | `supabase/migrations/20260428100100_grant_execute_roadmap_rewind_rpcs.sql` | `GRANT EXECUTE` on every roadmap RPC to `authenticated` |
| 3 | `supabase/migrations/20260428100200_grant_roadmap_rewind_table_privileges.sql` | `GRANT SELECT/INSERT/UPDATE/DELETE` on `roadmap_snapshot`, `epic_comment`, `confidence_rating`, `confidence_adjustment_history`, `pm_impact_override`, `roadmap_hidden_item`, `roadmap_delay_history` to `authenticated` |
| 4 | `supabase/migrations/20260428100300_drop_overloaded_roadmap_rpcs.sql` | Drops the redundant zero-arg overloads of the year-movements / impact / delivery RPCs (resolves the `PGRST203` error) and triggers `NOTIFY pgrst, 'reload schema'` |

After the push, run a quick sanity check in the prod SQL editor:

```sql
-- 1. feature_flags column exists
select column_name, data_type from information_schema.columns
 where table_name = 'app_settings' and column_name = 'feature_flags';

-- 2. RPC grants applied
select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as can_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like '%roadmap%' or p.proname like '%release_movements%';

-- 3. Table grants applied
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'authenticated'
   and table_name in ('roadmap_snapshot','epic_comment','confidence_rating','confidence_adjustment_history','pm_impact_override','roadmap_hidden_item');

-- 4. No overloaded RPCs remain
select proname, pg_get_function_arguments(oid)
  from pg_proc
 where proname in ('get_all_year_release_movements','get_year_movements_with_impact','get_year_movements_impact_summary','get_period_release_delivery_metrics')
 order by proname;
-- Each should return exactly one row, and its `pg_get_function_arguments` should mention `default`
```

---

## 2. Add Netlify environment variables

In Netlify → Site settings → Environment variables, add:

| Variable | Value | Notes |
|---|---|---|
| `AHA_ROADMAP_PIVOT_ID` | (your prod Aha! pivot ID) | required by the weekly snapshot cron |
| `NEXT_PUBLIC_FEATURE_FLAGS` | `roadmap_rewind` | turns on the sidebar links + page chrome immediately for any logged-in user; **see step 5 if you'd rather flip it from the in-app Settings UI** |

Save and trigger a deploy.

---

## 3. Run the bulk historical import (one-shot)

This backfills `roadmap_snapshot`, `confidence_rating`, `epic_comment` (movement notes), `pm_impact_override`, and `roadmap_hidden_item` from the RRV project into prod ClearGo. After this runs, the weekly cron takes over.

In GitHub → Actions → **RRV Bulk Import → Run workflow**, fill in:

| Input | Recommended value |
|---|---|
| `target` | `production` |
| `mode` | `dry-run` |

Run it. Inspect the workflow log:

- It should print row counts for each source table (`roadmap`, `confidence_ratings`, `confidence_adjustment_history`, `pm_notes`, `pm_impact_overrides`, `hidden_items`)
- It should print the coverage check (`rrv_distinct_keys`, `matched_in_cleargo`, `unmatched_keys`, `match_pct`) — match % on prod should be much higher than dev because prod has the full epic catalog
- It should NOT have written anything yet (dry-run guard)

If everything looks healthy, re-run with:

| Input | Value |
|---|---|
| `target` | `production` |
| `mode` | `insert` |

Re-inspect the parity spot-check at the end. Mismatches caused by the `(snapshot_date, aha_key)` unique constraint collapsing duplicate source rows are expected; mismatches in actual `latest` dates are not.

---

## 4. Verify the feature in prod (without showing it to users yet)

Open prod ClearGo with `NEXT_PUBLIC_FEATURE_FLAGS=roadmap_rewind` (or with the database `app_settings.feature_flags.roadmap_rewind = true`):

- [ ] Sidebar shows **Portfolio → Roadmap Snapshot** and **Portfolio → Roadmap Rewind**
- [ ] `/portfolio/snapshot` loads, every row has a confidence badge, and the "Changes vs prior week" column populates
- [ ] Click any row → slideout opens with current state + history timeline
- [ ] Pick a past snapshot date in the dropdown → table reloads, "Changes vs prior snapshot" column still populates
- [ ] As a PM/PRODUCT_OPS user: click a confidence badge → adjustment dialog opens, save persists
- [ ] As a PM user inside the Epic History slideout: "Add note" button shows; saving creates an `epic_comment` row visible immediately in the timeline
- [ ] `/portfolio/rewind` loads, the four summary tiles populate, the bar chart renders, the heatmap renders
- [ ] Click a heatmap cell → period drilldown drawer opens; click an epic in that drawer → epic history pushes on top with a back arrow
- [ ] The bottom **Release delivery** + **Priority & goals delivered** tiles populate

If any of those fail, check the browser console + Supabase logs for the specific RPC / table that's denied — re-running step 1 is safe.

---

## 5. Flip the feature flag for real users

Two options — pick one:

**a) Database-driven (recommended)** — Settings UI gives non-engineering admins a toggle:
- Sign in as a SUPERADMIN
- Settings → Other Settings → toggle "Roadmap Rewind" on
- This writes `app_settings.feature_flags.roadmap_rewind = true`. Users see the new sidebar links on next page load.
- To roll back: toggle it off. No deploy required.

**b) Build-time env var** — leaves it on for everyone all the time:
- Keep `NEXT_PUBLIC_FEATURE_FLAGS=roadmap_rewind` set in Netlify
- To roll back: remove the env var and redeploy

> The two paths OR together — if either is on, the feature is on for all users.

---

## 6. Confirm the weekly cron is healthy

After the next Monday 08:00 UTC run:

- [ ] GitHub Actions → **roadmap-snapshot.yml** → most-recent run is green
- [ ] In Supabase, `select max(snapshot_date) from public.roadmap_snapshot;` returns the just-completed Monday
- [ ] `/portfolio/snapshot` shows that date in the badge

---

## 7. Cleanup (only after the feature has been on for users for >= 1 week with no rollback)

- [ ] Tear down the standalone RRV n8n workflow (it's been replaced by the Aha! pivot snapshot job)
- [ ] Decommission the standalone RRV Supabase project + frontend (or freeze it for archival)
- [ ] Delete `scripts/rrv-import/local-import.mjs` and `.github/workflows/rrv-bulk-import.yml` if you're confident there's no future reason to re-run the bulk import

---

## Rollback playbook

If something goes badly wrong **after** flipping the feature flag:

1. Toggle the flag off (option **a** in step 5) — instant, no deploy
2. The new tables and RPCs stay in place but are no longer reachable from the UI
3. If you need to roll back the schema too, every migration in step 1 is additive (no destructive `DROP TABLE`s) — leaving them applied is harmless

The bulk-import workflow is **append-only with deduplication**, so re-running it after a partial failure is safe.
