#!/usr/bin/env npx tsx
/**
 * One-time migration: import the 11 existing product forecasts from the Chrysalis
 * product-requirements repo's forecasts/<product>/forecast.md + assumptions.md into
 * ClearGo's forecast_runs / forecast_assumptions / forecast_periods / forecast_narrative tables.
 *
 * The raw markdown is always archived verbatim into forecast_runs regardless of how well
 * the LLM extraction goes — this is a structuring pass for the new interactive tab, not a
 * lossy migration. See docs on Phase 1 of the forecast-engine migration plan.
 *
 * Environment (auto-loads .env / .env.local via dotenv, same as other scripts/*.ts):
 *   NEXT_PUBLIC_SUPABASE_URL       required
 *   SUPABASE_SERVICE_ROLE_KEY      required
 *   GEMINI_API_KEY                 required (extraction model)
 *
 * Usage:
 *   npx tsx scripts/migrate-chrysalis-forecasts.ts --chrysalis-repo=/path/to/chrysalis-product-requirements
 *       [--product=succession-planning]   # single product; omit for all 11
 *       [--do-insert]                     # without this flag, prints the extraction and does NOT write to Supabase
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractForecastFromMarkdown } from '../src/lib/forecast/migrateFromMarkdown';

const PRODUCTS = [
  'ai-agents',
  'ai-course-builder-v2',
  'ai-notetaker',
  'ai-screening',
  'ai-sourcing',
  'career-sites',
  'crm-agentic',
  'employee-lifecycle-events',
  'succession-planning',
  'talent-profile',
  'workforce-learning-enablement',
] as const;

// From forecasts/CONSOLIDATED.md's Revenue Upside Summary table (base scenario, 3-year total),
// 2026-07-14 — used only as a sanity check on the extraction, not written anywhere.
const CONSOLIDATED_3YR_BASE_USD: Partial<Record<(typeof PRODUCTS)[number], number>> = {
  'ai-notetaker': 503_000,
  'ai-agents': 1_223_000,
  'ai-screening': 1_674_000, // flagged in CONSOLIDATED.md as not yet recomputed / likely overstated
  'employee-lifecycle-events': 1_414_000,
  'crm-agentic': 1_016_000,
  'succession-planning': 268_000,
  'talent-profile': 1_052_000,
  'career-sites': 71_000,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const prefix = `--${name}=`;
    const hit = args.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
  };
  return {
    chrysalisRepo: get('chrysalis-repo'),
    product: get('product') as (typeof PRODUCTS)[number] | undefined,
    doInsert: args.includes('--do-insert'),
  };
}

function readProductDocs(chrysalisRepo: string, product: string) {
  const dir = path.join(chrysalisRepo, 'forecasts', product);
  const forecastPath = path.join(dir, 'forecast.md');
  const assumptionsPath = path.join(dir, 'assumptions.md');
  if (!fs.existsSync(forecastPath)) {
    throw new Error(`Missing forecast.md for "${product}" at ${dir}`);
  }
  const hasAssumptions = fs.existsSync(assumptionsPath);
  if (!hasAssumptions) {
    console.warn(`  ⚠️  No assumptions.md for "${product}" — extracting from forecast.md alone.`);
  }
  return {
    forecastMd: fs.readFileSync(forecastPath, 'utf8'),
    assumptionsMd: hasAssumptions ? fs.readFileSync(assumptionsPath, 'utf8') : '(no assumptions.md exists for this product)',
  };
}

/** Pulls the primary (first) epic ref out of the forecast.md front matter's `epics:` list. */
function extractPrimaryEpicRef(forecastMd: string): string | null {
  const frontMatter = forecastMd.split('---')[1] ?? '';
  const match = frontMatter.match(/epics:\s*\n\s*-\s*ref:\s*(\S+)/);
  return match ? match[1] : null;
}

async function migrateProduct(
  supabase: SupabaseClient,
  chrysalisRepo: string,
  product: (typeof PRODUCTS)[number],
  doInsert: boolean
) {
  console.log(`\n=== ${product} ===`);
  const { forecastMd, assumptionsMd } = readProductDocs(chrysalisRepo, product);

  const epicAhaId = extractPrimaryEpicRef(forecastMd);
  if (!epicAhaId) {
    console.error(`  ⚠️  Could not find a primary epic ref in front matter — skipping.`);
    return;
  }

  const extracted = await extractForecastFromMarkdown({ productSlug: product, forecastMd, assumptionsMd });

  const expected = CONSOLIDATED_3YR_BASE_USD[product];
  const actual = extracted.headlineCheck.threeYearBaseTotalUsd;
  const deltaPct = expected ? Math.abs(actual - expected) / expected : null;
  console.log(`  Primary epic: ${epicAhaId}`);
  console.log(`  3yr base total — extracted: $${actual.toLocaleString()}` + (expected ? `, CONSOLIDATED.md: $${expected.toLocaleString()}` : ' (not in CONSOLIDATED.md — verify against forecast.md directly)'));
  if (deltaPct !== null && deltaPct > 0.05) {
    console.error(`  ⚠️  Mismatch >5% (${(deltaPct * 100).toFixed(1)}%) — do not trust this run without review.`);
  }
  console.log(`  Assumptions: ${extracted.assumptions.length}, Periods: ${extracted.periods.length}, Narrative sections: ${extracted.narrative.length}`);

  if (!doInsert) {
    console.log('  (dry run — pass --do-insert to write to Supabase)');
    return;
  }

  const { data: epicRow } = await supabase.from('epic').select('id').eq('aha_id', epicAhaId).maybeSingle();

  const { data: run, error: runError } = await supabase
    .from('forecast_runs')
    .insert({
      epic_id: (epicRow as { id: string } | null)?.id ?? null,
      epic_aha_id: epicAhaId,
      source: 'migrated_from_chrysalis',
      status: 'complete',
      is_current: true,
      raw_markdown_forecast: forecastMd,
      raw_markdown_assumptions: assumptionsMd,
      created_by: 'migrate-chrysalis-forecasts script',
    })
    .select('id')
    .single();

  if (runError || !run) {
    console.error(`  ❌ Failed to insert forecast_runs row:`, runError);
    return;
  }
  const runId = (run as { id: string }).id;

  const assumptionRows = extracted.assumptions.map((a, i) => ({
    run_id: runId,
    key: a.key,
    label: a.label,
    value_bear: a.valueBear,
    value_base: a.valueBase,
    value_bull: a.valueBull,
    confidence: a.confidence,
    source_note: a.sourceNote,
    sort_order: i,
  }));
  const periodRows = extracted.periods.map((p, i) => ({
    run_id: runId,
    scenario: p.scenario,
    period_type: p.periodType,
    period_label: p.periodLabel,
    cross_sell_arr_usd: p.crossSellArrUsd,
    net_new_arr_usd: p.netNewArrUsd,
    churn_reduction_arr_usd: p.churnReductionArrUsd,
    total_arr_usd: p.totalArrUsd,
    sort_order: i,
  }));
  const narrativeRows = extracted.narrative.map((n, i) => ({
    run_id: runId,
    section: n.section,
    content: n.content,
    sort_order: i,
  }));

  const [aRes, pRes, nRes] = await Promise.all([
    assumptionRows.length ? supabase.from('forecast_assumptions').insert(assumptionRows) : Promise.resolve({ error: null }),
    periodRows.length ? supabase.from('forecast_periods').insert(periodRows) : Promise.resolve({ error: null }),
    narrativeRows.length ? supabase.from('forecast_narrative').insert(narrativeRows) : Promise.resolve({ error: null }),
  ]);
  for (const [label, res] of [['assumptions', aRes], ['periods', pRes], ['narrative', nRes]] as const) {
    if (res.error) console.error(`  ❌ Failed to insert ${label}:`, res.error);
  }
  console.log(`  ✅ Migrated as forecast_runs.id = ${runId}`);
}

async function main() {
  const { chrysalisRepo, product, doInsert } = parseArgs();
  if (!chrysalisRepo) {
    console.error('Usage: --chrysalis-repo=/path/to/chrysalis-product-requirements [--product=slug] [--do-insert]');
    process.exit(1);
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }
  const supabase: SupabaseClient = createSupabaseJsClient(supabaseUrl, serviceRoleKey);

  const products = product ? [product] : PRODUCTS;
  for (const p of products) {
    try {
      await migrateProduct(supabase, chrysalisRepo, p, doInsert);
    } catch (err) {
      console.error(`  ❌ ${p} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

main();
