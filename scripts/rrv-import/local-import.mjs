#!/usr/bin/env node
/**
 * Local RRV → ClearGo importer (REST / HTTPS via @supabase/supabase-js).
 *
 * Why REST instead of `pg`/`psql`/`pg_dump`?
 *   - Cross-platform with zero native deps
 *   - Bypasses the Supabase Postgres pooler entirely (no SCRAM, no IPv6 woes)
 *   - Service-role key bypasses RLS without GRANT plumbing
 *
 * Mirrors the bash pipeline (01..04) end-to-end:
 *   1. Sanity-check that destination tables exist
 *   2. Build cleargo lookup maps  (epic.aha_id → epic.id, app_user.email → app_user.id)
 *   3. Page through RRV source tables  (1000 rows per call) and stream rows in JS
 *   4. Print dry-run diagnostics  (coverage %, top unmatched aha_keys)
 *   5. (Gated by --do-insert) Idempotent upserts/inserts into the 6 cleargo tables
 *   6. Parity spot-check between RRV and cleargo
 *
 * Use the GH Actions workflow (.github/workflows/rrv-bulk-import.yml) for
 * production. This script is for local dev rehearsal only.
 *
 * Environment (auto-loads .env):
 *   RRV_SUPABASE_SERVICE_ROLE_KEY   required  service-role JWT for the RRV project
 *   RRV_SUPABASE_URL                optional  derived from the JWT's `ref` claim if missing
 *   CLEARGO_SUPABASE_SERVICE_ROLE_KEY  optional  falls back to SUPABASE_SERVICE_ROLE_KEY
 *   CLEARGO_SUPABASE_URL            optional  falls back to NEXT_PUBLIC_SUPABASE_URL
 *
 * Usage (PowerShell):
 *   $env:RRV_SUPABASE_SERVICE_ROLE_KEY = "eyJ…"
 *   node scripts/rrv-import/local-import.mjs                # dry-run only
 *   node scripts/rrv-import/local-import.mjs --do-insert    # insert into public.*
 *
 * Flags:
 *   --do-insert         Actually run the inserts after diagnostics. Default: dry-run only.
 *   --sample-size=N     Parity-check sample size (default 20).
 *   --page-size=N       PostgREST page size when reading RRV (default 1000, max 1000).
 *   --batch-size=N      Max rows per cleargo upsert/insert call (default 500).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Args & env
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
// PowerShell sometimes eats the `--` separator in `npm run x -- --flag`, so
// also honour DO_INSERT=true as an env-var fallback.
const DO_INSERT =
  args.includes('--do-insert') ||
  ['1', 'true', 'yes'].includes(String(process.env.DO_INSERT || '').toLowerCase());
const SAMPLE_SIZE = parseIntFlag('--sample-size', 20);
const PAGE_SIZE = Math.min(parseIntFlag('--page-size', 1000), 1000);
const BATCH_SIZE = parseIntFlag('--batch-size', 500);

function parseIntFlag(name, fallback) {
  const flag = args.find((a) => a.startsWith(`${name}=`));
  if (!flag) return fallback;
  const n = Number.parseInt(flag.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Pull a project ref out of a Supabase service-role JWT so we can derive the
// REST URL when the operator only sets the key. The JWT is just base64url JSON;
// no signature check is needed — we only care about the `ref` claim.
function refFromJwt(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;
  const segs = jwt.split('.');
  if (segs.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(segs[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    return typeof payload.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
}

const RRV_KEY = process.env.RRV_SUPABASE_SERVICE_ROLE_KEY;
const CG_KEY =
  process.env.CLEARGO_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const RRV_URL =
  process.env.RRV_SUPABASE_URL ||
  (refFromJwt(RRV_KEY) ? `https://${refFromJwt(RRV_KEY)}.supabase.co` : null);
const CG_URL =
  process.env.CLEARGO_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  (refFromJwt(CG_KEY) ? `https://${refFromJwt(CG_KEY)}.supabase.co` : null);

if (!RRV_KEY || !RRV_URL) {
  console.error('Missing RRV credentials.');
  console.error('  Set RRV_SUPABASE_SERVICE_ROLE_KEY (and optionally RRV_SUPABASE_URL).');
  console.error('  Get the service-role key from:');
  console.error('    https://supabase.com/dashboard/project/<rrv-ref>/settings/api');
  process.exit(1);
}
if (!CG_KEY || !CG_URL) {
  console.error('Missing ClearGo credentials.');
  console.error('  Need CLEARGO_SUPABASE_URL + CLEARGO_SUPABASE_SERVICE_ROLE_KEY,');
  console.error('  or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (already in .env).');
  process.exit(1);
}

console.log('================================================================');
console.log(' RRV → ClearGo local import  (REST / HTTPS)');
console.log(`   Source (RRV):     ${RRV_URL}`);
console.log(`   Target (ClearGo): ${CG_URL}`);
console.log(`   Mode:             ${DO_INSERT ? 'DRY-RUN + INSERT' : 'DRY-RUN ONLY'}`);
console.log(`   Page size (read): ${PAGE_SIZE}`);
console.log(`   Batch size (write): ${BATCH_SIZE}`);
console.log(`   Parity sample:    ${SAMPLE_SIZE}`);
console.log('================================================================\n');

const SUPA_OPTS = {
  auth: { persistSession: false, autoRefreshToken: false },
  // Service-role bypasses RLS; no need to relay anon headers.
  global: { headers: { 'X-Client-Info': 'rrv-import-local' } },
};

const rrv = createClient(RRV_URL, RRV_KEY, SUPA_OPTS);
const cg = createClient(CG_URL, CG_KEY, SUPA_OPTS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(stage, err) {
  console.error(`\n[FATAL] ${stage}: ${err?.message || err}`);
  if (err?.details) console.error(`        details: ${err.details}`);
  if (err?.hint) console.error(`        hint:    ${err.hint}`);
  if (err?.stack && !err.message) console.error(err.stack);
  process.exit(1);
}

function check(label, { error }) {
  if (error) fail(label, error);
}

// Read every row of a table from `client`, paging at PAGE_SIZE via
// PostgREST's Range header semantics. Optionally narrow the column list to
// reduce payload size.
async function readAll(client, table, { columns = '*', orderBy = 'id' } = {}) {
  const out = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, to);
    if (error) fail(`read ${table}`, error);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    process.stdout.write(`\r  read ${table}: ${out.length} rows…`);
  }
  if (out.length > 0) process.stdout.write('\n');
  return out;
}

// Insert/upsert in chunks so one giant payload doesn't time out on PostgREST.
// Returns the number of rows submitted (PostgREST in minimal-return mode does
// not tell us how many were actually new vs. ignored — that's what the final
// count summary at the end is for).
async function writeBatched(client, table, rows, { upsertOnConflict = null } = {}) {
  if (rows.length === 0) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const q = client.from(table);
    const op = upsertOnConflict
      ? q.upsert(batch, { onConflict: upsertOnConflict, ignoreDuplicates: true })
      : q.insert(batch);
    const { error } = await op;
    if (error) fail(`write ${table} (batch ${i}..${i + batch.length})`, error);
    written += batch.length;
    process.stdout.write(`\r  ${table}: ${written}/${rows.length}`);
  }
  process.stdout.write('\n');
  return written;
}

async function countRows(client, table, filter = null) {
  let q = client.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) fail(`count ${table}`, error);
  return count ?? 0;
}

// Convert RRV's snake_case datetime fields safely. PostgREST returns ISO
// strings already; this is just a defensive normalizer for date-only columns
// where Postgres is picky.
function isoDate(v) {
  if (!v) return null;
  try {
    return new Date(v).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function nonEmpty(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function sanityCheck() {
  // Quick HEAD count on every destination table — if any of them are missing
  // we'll get a "relation does not exist" error and bail with a clear message.
  const required = [
    'roadmap_snapshot',
    'confidence_rating',
    'confidence_adjustment_history',
    'pm_impact_override',
    'roadmap_hidden_item',
    'epic_comment',
  ];
  for (const t of required) {
    const { error } = await cg.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`\n[FATAL] ClearGo project is missing required table: ${t}`);
      console.error(`        ${error.message}`);
      console.error('        Apply the RRV migrations first:');
      console.error('          npx supabase link --project-ref <cg-ref>');
      console.error('          npx supabase db push');
      process.exit(1);
    }
  }
}

async function buildEpicMap() {
  console.log('\n[ClearGo] loading epic.aha_id → epic.id map…');
  const epics = await readAll(cg, 'epic', { columns: 'id,aha_id', orderBy: 'id' });
  const map = new Map();
  for (const e of epics) if (e.aha_id) map.set(e.aha_id, e.id);
  console.log(`  ${map.size} epics with aha_id`);
  return map;
}

async function buildUserMap() {
  console.log('\n[ClearGo] loading app_user.email → id map…');
  const users = await readAll(cg, 'app_user', { columns: 'id,email', orderBy: 'id' });
  const map = new Map();
  for (const u of users) if (u.email) map.set(u.email.toLowerCase(), u.id);
  console.log(`  ${map.size} users`);
  return map;
}

async function readRrvAll() {
  console.log('\n[RRV] reading source tables…');
  const roadmap = await readAll(rrv, 'roadmap', { orderBy: 'created_at' });
  const ratings = await readAll(rrv, 'confidence_ratings', { orderBy: 'created_at' });
  const adj = await readAll(rrv, 'confidence_adjustment_history', { orderBy: 'created_at' });
  const notes = await readAll(rrv, 'pm_notes', { orderBy: 'created_at' });
  const overrides = await readAll(rrv, 'pm_impact_overrides', { orderBy: 'created_at' });
  const hidden = await readAll(rrv, 'hidden_items', { orderBy: 'hidden_at' });
  console.log('\n[RRV] row counts:');
  console.table([
    {
      roadmap: roadmap.length,
      confidence_ratings: ratings.length,
      confidence_adjustment_history: adj.length,
      pm_notes: notes.length,
      pm_impact_overrides: overrides.length,
      hidden_items: hidden.length,
    },
  ]);
  return { roadmap, ratings, adj, notes, overrides, hidden };
}

function dryRunDiagnostics({ roadmap }, epicMap) {
  console.log('\n=== Coverage check (RRV roadmap.aha_key → ClearGo epic.aha_id) ===');
  const distinctKeys = new Set();
  const matched = new Set();
  for (const r of roadmap) {
    if (!r.aha_key) continue;
    distinctKeys.add(r.aha_key);
    if (epicMap.has(r.aha_key)) matched.add(r.aha_key);
  }
  const total = distinctKeys.size;
  const matchedN = matched.size;
  const unmatchedN = total - matchedN;
  const pct = total === 0 ? 0 : Math.round((1000 * matchedN) / total) / 10;
  console.table([
    {
      rrv_distinct_keys: total,
      matched_in_cleargo: matchedN,
      unmatched_keys: unmatchedN,
      match_pct: pct,
    },
  ]);

  if (unmatchedN > 0) {
    console.log('\n=== Top unmatched aha_keys (up to 25) ===');
    const byKey = new Map();
    for (const r of roadmap) {
      if (!r.aha_key || epicMap.has(r.aha_key)) continue;
      const e = byKey.get(r.aha_key) || {
        aha_key: r.aha_key,
        aha_name: r.aha_name,
        last_seen: r.created_at,
        rrv_rows: 0,
      };
      e.rrv_rows += 1;
      if (r.created_at && r.created_at > e.last_seen) e.last_seen = r.created_at;
      byKey.set(r.aha_key, e);
    }
    const top = [...byKey.values()]
      .sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)))
      .slice(0, 25);
    console.table(top);
  }
}

// ---------------------------------------------------------------------------
// Inserts
// ---------------------------------------------------------------------------

async function insertRoadmapSnapshot(roadmap, epicMap) {
  console.log('\n=== public.roadmap_snapshot ===');
  const rows = roadmap.map((r) => ({
    epic_id: epicMap.get(r.aha_key) ?? null,
    snapshot_date: isoDate(r.created_at),
    aha_key: r.aha_key,
    aha_name: r.aha_name,
    aha_description: r.aha_description,
    aha_start_date: r.aha_start_date,
    aha_end_date: r.aha_end_date,
    aha_status: r.aha_status,
    aha_t_shirt_est: r.aha_t_shirt_est,
    aha_primary_goal: r.aha_primary_goal,
    aha_calculated_devs: r.aha_calculated_devs,
    aha_owner: r.aha_owner,
    aha_initial_est: r.aha_initial_est,
    aha_release: r.aha_release,
    aha_pod: r.aha_pod,
    jira_key: r.jira_key,
    aha_release_date: r.aha_release_date,
    aha_csm_priority: r.aha_csm_priority,
    aha_progress: r.aha_progress,
    created_at: r.created_at,
  }));
  // Enforce the (snapshot_date, aha_key) unique constraint via upsert.
  await writeBatched(cg, 'roadmap_snapshot', rows, {
    upsertOnConflict: 'snapshot_date,aha_key',
  });
}

async function insertConfidenceRating(ratings, epicMap) {
  console.log('\n=== public.confidence_rating ===');
  const rows = ratings.map((c) => ({
    epic_id: epicMap.get(c.aha_key) ?? null,
    aha_key: c.aha_key,
    snapshot_date: c.snapshot_date,
    calculated_confidence: c.calculated_confidence,
    calculated_percentage: c.calculated_percentage,
    pm_adjustment: c.pm_adjustment ?? 0,
    final_confidence: c.final_confidence,
    final_percentage: c.final_percentage,
    last_calculated_at: c.last_calculated_at,
    author_email: c.author_email,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));
  await writeBatched(cg, 'confidence_rating', rows, {
    upsertOnConflict: 'aha_key,snapshot_date',
  });
}

async function insertConfidenceAdjustmentHistory(adj) {
  console.log('\n=== public.confidence_adjustment_history (no unique constraint, JS-deduped) ===');
  // Cleargo table has no unique constraint, so we can't upsert. Build a
  // fingerprint of existing rows and skip those, making the script safely re-runnable.
  const existing = await readAll(cg, 'confidence_adjustment_history', {
    columns: 'aha_key,snapshot_date,created_at,new_adjustment',
    orderBy: 'created_at',
  });
  const seen = new Set(
    existing.map((e) => `${e.aha_key}|${e.snapshot_date}|${e.created_at}|${e.new_adjustment}`),
  );
  const rows = [];
  let dupes = 0;
  for (const h of adj) {
    const fp = `${h.aha_key}|${h.snapshot_date}|${h.created_at}|${h.new_adjustment}`;
    if (seen.has(fp)) {
      dupes += 1;
      continue;
    }
    seen.add(fp);
    rows.push({
      aha_key: h.aha_key,
      snapshot_date: h.snapshot_date,
      previous_adjustment: h.previous_adjustment,
      new_adjustment: h.new_adjustment,
      adjustment_delta: h.adjustment_delta,
      previous_final_percentage: h.previous_final_percentage,
      new_final_percentage: h.new_final_percentage,
      adjustment_note: h.adjustment_note,
      author_email: h.author_email || 'rrv-import@unknown',
      created_at: h.created_at,
    });
  }
  if (dupes > 0) console.log(`  skipping ${dupes} rows already present`);
  await writeBatched(cg, 'confidence_adjustment_history', rows);
}

async function insertPmImpactOverride(overrides, epicMap) {
  console.log('\n=== public.pm_impact_override ===');
  const rows = overrides.map((p) => ({
    epic_id: epicMap.get(p.aha_key) ?? null,
    aha_key: p.aha_key,
    week_start: p.week_start,
    original_impact: p.original_impact,
    override_impact: p.override_impact,
    override_note: p.override_note,
    author_email: p.author_email,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
  await writeBatched(cg, 'pm_impact_override', rows, {
    upsertOnConflict: 'aha_key,week_start',
  });
}

async function insertRoadmapHiddenItem(hidden, userMap) {
  console.log('\n=== public.roadmap_hidden_item (resolved by author_email) ===');
  let skipped = 0;
  const rows = [];
  for (const h of hidden) {
    const uid = userMap.get((h.author_email || '').toLowerCase());
    if (!uid) {
      skipped += 1;
      continue;
    }
    rows.push({ app_user_id: uid, aha_key: h.aha_key, hidden_at: h.hidden_at });
  }
  if (skipped > 0) console.log(`  skipping ${skipped} rows with no matching app_user`);
  await writeBatched(cg, 'roadmap_hidden_item', rows, {
    upsertOnConflict: 'app_user_id,aha_key',
  });
}

async function insertEpicCommentMovement(notes, epicMap, userMap) {
  console.log('\n=== pm_notes → public.epic_comment (category=movement, JS-deduped) ===');
  // No unique constraint on epic_comment; dedupe by a stable fingerprint.
  const existing = await readAll(cg, 'epic_comment', {
    columns: 'epic_id,related_snapshot_date,comment_text,created_at,category',
    orderBy: 'created_at',
  });
  const seen = new Set(
    existing
      .filter((e) => e.category === 'movement')
      .map((e) => `${e.epic_id}|${e.related_snapshot_date}|${e.created_at}|${e.comment_text}`),
  );

  let skippedNoEpic = 0;
  let skippedEmpty = 0;
  let dupes = 0;
  const rows = [];
  for (const p of notes) {
    const epicId = epicMap.get(p.aha_key);
    if (!epicId) {
      skippedNoEpic += 1;
      continue;
    }
    const text = nonEmpty(p.note_text);
    if (!text) {
      skippedEmpty += 1;
      continue;
    }
    const snapDate = isoDate(p.snapshot_date);
    const fp = `${epicId}|${snapDate}|${p.created_at}|${text}`;
    if (seen.has(fp)) {
      dupes += 1;
      continue;
    }
    seen.add(fp);
    rows.push({
      epic_id: epicId,
      comment_text: text,
      created_by: userMap.get((p.author_email || '').toLowerCase()) || null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      category: 'movement',
      movement_cause: p.movement_cause,
      movement_date: p.movement_date,
      from_release: p.from_release,
      to_release: p.to_release,
      related_snapshot_date: snapDate,
    });
  }
  if (skippedNoEpic > 0) console.log(`  skipping ${skippedNoEpic} pm_notes with no matching epic`);
  if (skippedEmpty > 0) console.log(`  skipping ${skippedEmpty} pm_notes with empty note_text`);
  if (dupes > 0) console.log(`  skipping ${dupes} pm_notes already present`);
  await writeBatched(cg, 'epic_comment', rows);
}

async function printFinalCounts() {
  console.log('\n=== Final destination row counts ===');
  const counts = {
    roadmap_snapshot: await countRows(cg, 'roadmap_snapshot'),
    confidence_rating: await countRows(cg, 'confidence_rating'),
    confidence_adjustment_history: await countRows(cg, 'confidence_adjustment_history'),
    pm_impact_override: await countRows(cg, 'pm_impact_override'),
    roadmap_hidden_item: await countRows(cg, 'roadmap_hidden_item'),
    epic_comment_movement: await countRows(cg, 'epic_comment', (q) => q.eq('category', 'movement')),
  };
  console.table([counts]);
}

async function parityCheck(roadmap) {
  console.log(`\n=== Parity spot-check (sampling ${SAMPLE_SIZE} random aha_keys) ===`);
  const distinct = [...new Set(roadmap.map((r) => r.aha_key).filter(Boolean))];
  if (distinct.length === 0) {
    console.log('No aha_keys in source — skipping.');
    return 0;
  }
  // Fisher-Yates shuffle then take first N
  for (let i = distinct.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distinct[i], distinct[j]] = [distinct[j], distinct[i]];
  }
  const keys = distinct.slice(0, SAMPLE_SIZE);

  // Tally RRV from the in-memory data (already loaded once above).
  // IMPORTANT: count DISTINCT (date, aha_key) tuples, not raw rows. ClearGo's
  // roadmap_snapshot has UNIQUE (snapshot_date, aha_key), so the import
  // collapses any same-day duplicates that exist in RRV's source data — and
  // that's the intended behaviour. Comparing raw rrv_count vs cg_count would
  // surface those collapses as false-positive mismatches.
  const rrvByKey = new Map();
  const sampleKeys = new Set(keys);
  for (const r of roadmap) {
    if (!sampleKeys.has(r.aha_key)) continue;
    const d = isoDate(r.created_at);
    if (!d) continue;
    let e = rrvByKey.get(r.aha_key);
    if (!e) {
      e = { dates: new Set(), latest: '' };
      rrvByKey.set(r.aha_key, e);
    }
    e.dates.add(d);
    if (d > e.latest) e.latest = d;
  }

  // Tally ClearGo via REST in() filter (one round trip)
  const { data: cgRows, error } = await cg
    .from('roadmap_snapshot')
    .select('aha_key,snapshot_date')
    .in('aha_key', keys);
  if (error) fail('parity check (cg.roadmap_snapshot)', error);
  const cgByKey = new Map();
  for (const r of cgRows) {
    const e = cgByKey.get(r.aha_key) || { n: 0, latest: '' };
    e.n += 1;
    const d = r.snapshot_date;
    if (d && d > e.latest) e.latest = d;
    cgByKey.set(r.aha_key, e);
  }

  const fmt = (s, n) => String(s ?? '').padEnd(n);
  console.log(
    `${fmt('aha_key', 32)} | ${fmt('rrv_dates', 9)} | ${fmt('cg_n', 5)} | ${fmt('rrv_latest', 11)} | ${fmt('cg_latest', 11)} | OK`,
  );
  console.log('-'.repeat(89));
  let mismatches = 0;
  for (const k of keys) {
    const r = rrvByKey.get(k) || { dates: new Set(), latest: '' };
    const c = cgByKey.get(k) || { n: 0, latest: '' };
    const rN = r.dates.size;
    const ok = rN === c.n && r.latest === c.latest;
    if (!ok) mismatches += 1;
    console.log(
      `${fmt(k, 32)} | ${fmt(rN, 9)} | ${fmt(c.n, 5)} | ${fmt(r.latest, 11)} | ${fmt(c.latest, 11)} | ${ok ? 'YES' : 'NO'}`,
    );
  }
  console.log('-'.repeat(89));
  console.log(`Sampled: ${keys.length}, mismatches: ${mismatches}`);
  if (mismatches > 0) {
    console.log(
      'Note: rrv_dates counts DISTINCT (created_at::date, aha_key) tuples in RRV. ' +
        'cg_n counts roadmap_snapshot rows for the same aha_key. They should match exactly.',
    );
  }
  return mismatches;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

(async function main() {
  await sanityCheck();
  const epicMap = await buildEpicMap();
  const userMap = await buildUserMap();
  const src = await readRrvAll();

  console.log('\n--- Stage 1: dry-run diagnostics ---');
  dryRunDiagnostics(src, epicMap);

  if (!DO_INSERT) {
    console.log('\nDRY RUN COMPLETE. Re-run with --do-insert to perform the inserts:');
    console.log('  npm run rrv-import:local -- --do-insert');
    return;
  }

  console.log('\n--- Stage 2: INSERT into public.* ---');
  await insertRoadmapSnapshot(src.roadmap, epicMap);
  await insertConfidenceRating(src.ratings, epicMap);
  await insertConfidenceAdjustmentHistory(src.adj);
  await insertPmImpactOverride(src.overrides, epicMap);
  await insertRoadmapHiddenItem(src.hidden, userMap);
  await insertEpicCommentMovement(src.notes, epicMap, userMap);

  await printFinalCounts();

  console.log('\n--- Stage 3: parity spot-check ---');
  const mismatches = await parityCheck(src.roadmap);
  if (mismatches > 0) {
    console.error(`\n[WARN] ${mismatches} parity mismatch(es). Investigate before declaring success.`);
  } else {
    console.log('\nAll parity samples match. Done.');
  }
})().catch((err) => fail('main', err));
