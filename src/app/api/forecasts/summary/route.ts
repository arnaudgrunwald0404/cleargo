import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface ForecastLink {
  id: string;
  scenario: string;
  arr_incremental_2027_usd: number | null;
  arr_incremental_2028_usd: number | null;
  arr_churn_reduction_2027_usd: number | null;
  arr_churn_reduction_2028_usd: number | null;
  url: string;
  generation_date: string | null;
  created_at: string;
  created_by: string | null;
  /** 'forecast_run' for the new in-app model (Phase 1+); 'epic_forecast_link' for the legacy write-back record. */
  source?: 'forecast_run' | 'epic_forecast_link';
}

export interface ForecastEpicSummary {
  epic_aha_id: string;
  epic_id: string | null; // internal UUID, used for /epics/[id] links
  epic_name: string | null;
  launch_tier: string | null;
  gtm_module: string | null;
  links: ForecastLink[];
}

// GET /api/forecasts/summary
// Returns all epics that have at least one forecast link, with all their link data.
// Queries Supabase directly — no Aha! API call.
async function getHandler(_req: NextRequest) {
  const userEmail = await getAuthenticatedUserEmail();
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  const { data: rows, error } = await adminSupabase
    .from('epic_forecast_link')
    .select('id, epic_aha_id, url, generation_date, scenario, arr_incremental_2027_usd, arr_incremental_2028_usd, arr_churn_reduction_2027_usd, arr_churn_reduction_2028_usd, created_at, created_by')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching forecast summary:', error);
    return NextResponse.json({ error: 'Failed to fetch forecasts', details: error.message, code: error.code }, { status: 500 });
  }

  // forecast_runs is the canonical model as of the in-app Forecast tab (see PRD §12) — build a
  // synthetic ForecastLink per epic's current run so the portfolio rollup reflects it even
  // though these runs never write an epic_forecast_link row. Base scenario only (that's what
  // this page has always shown one number for per epic).
  const { data: currentRuns } = await adminSupabase
    .from('forecast_runs')
    .select('id, epic_id, epic_aha_id, created_at, created_by')
    .eq('is_current', true);

  const runRows: Array<{ epic_aha_id: string; link: ForecastLink; epic_id: string | null }> = [];
  if (currentRuns && currentRuns.length > 0) {
    const runIds = currentRuns.map((r) => r.id as string);
    const { data: yearPeriods } = await adminSupabase
      .from('forecast_periods')
      .select('run_id, period_label, cross_sell_arr_usd, net_new_arr_usd, churn_reduction_arr_usd')
      .in('run_id', runIds)
      .eq('period_type', 'year')
      .eq('scenario', 'base');

    const periodsByRun = new Map<string, typeof yearPeriods>();
    for (const p of yearPeriods ?? []) {
      const list = periodsByRun.get(p.run_id as string) ?? [];
      list.push(p);
      periodsByRun.set(p.run_id as string, list);
    }

    for (const run of currentRuns) {
      const periods = periodsByRun.get(run.id as string) ?? [];
      const find2027 = periods.find((p) => p!.period_label === '2027');
      const find2028 = periods.find((p) => p!.period_label === '2028');
      const bookings = (p: typeof find2027) => (p ? (p.cross_sell_arr_usd as number) + (p.net_new_arr_usd as number) : null);
      const epicId = run.epic_id as string | null;
      runRows.push({
        epic_aha_id: run.epic_aha_id as string,
        epic_id: epicId,
        link: {
          id: `forecast_run:${run.id}`,
          scenario: 'base',
          arr_incremental_2027_usd: bookings(find2027),
          arr_incremental_2028_usd: bookings(find2028),
          arr_churn_reduction_2027_usd: find2027 ? (find2027.churn_reduction_arr_usd as number) : null,
          arr_churn_reduction_2028_usd: find2028 ? (find2028.churn_reduction_arr_usd as number) : null,
          url: epicId ? `/epics/${epicId}?tab=forecast` : '',
          generation_date: (run.created_at as string)?.slice(0, 10) ?? null,
          created_at: run.created_at as string,
          created_by: run.created_by as string | null,
          source: 'forecast_run',
        },
      });
    }
  }

  // Fetch epic metadata (name, aha_fields) and gtm_module for all referenced epics
  const ahaIds = [...new Set([...(rows ?? []).map(r => r.epic_aha_id as string), ...runRows.map(r => r.epic_aha_id)])];
  const epicMeta = new Map<string, { id: string | null; name: string | null; launch_tier: string | null; gtm_module: string | null }>();

  if (ahaIds.length > 0) {
    const [{ data: epics }, { data: snapshots }] = await Promise.all([
      adminSupabase
        .from('epic')
        .select('id, aha_id, name, aha_fields')
        .in('aha_id', ahaIds),
      // Latest gtm_module per epic — grab recent rows and dedupe in JS
      adminSupabase
        .from('roadmap_snapshot')
        .select('aha_key, aha_name, gtm_module, snapshot_date')
        .in('aha_key', ahaIds)
        .order('snapshot_date', { ascending: false })
        .limit(ahaIds.length * 10),
    ]);

    // Most-recent gtm_module and aha_name per aha_key
    const gtmByKey = new Map<string, string | null>();
    const nameByKey = new Map<string, string | null>();
    for (const s of snapshots ?? []) {
      const key = s.aha_key as string;
      if (!gtmByKey.has(key)) {
        gtmByKey.set(key, (s.gtm_module as string | null) ?? null);
        nameByKey.set(key, (s.aha_name as string | null) ?? null);
      }
    }

    // Populate from epic table rows
    for (const e of epics ?? []) {
      const ahaFields = e.aha_fields as any;
      const launchTier =
        ahaFields?.custom_fields?.launch_tier ??
        ahaFields?.launch_tier ??
        null;
      epicMeta.set(e.aha_id as string, {
        id: e.id as string,
        name: (e.name as string | null) ?? nameByKey.get(e.aha_id as string) ?? null,
        launch_tier: typeof launchTier === 'string' ? launchTier : null,
        gtm_module: gtmByKey.get(e.aha_id as string) ?? null,
      });
    }
    // Fallback: epics in forecast_link but not in epic table — use snapshot data
    for (const id of ahaIds) {
      if (!epicMeta.has(id)) {
        epicMeta.set(id, {
          id: null,
          name: nameByKey.get(id) ?? null,
          launch_tier: null,
          gtm_module: gtmByKey.get(id) ?? null,
        });
      }
    }
  }

  // Group by epic_aha_id. forecast_runs entries go first (they're the canonical model — see
  // PRD §12) so they're the default shown; epic_forecast_link entries (legacy write-backs,
  // or a still-useful shareable HTML link even for a migrated epic) follow.
  const byEpic = new Map<string, ForecastEpicSummary>();

  function ensureEpic(key: string): ForecastEpicSummary {
    if (!byEpic.has(key)) {
      const meta = epicMeta.get(key);
      byEpic.set(key, {
        epic_aha_id: key,
        epic_id: meta?.id ?? null,
        epic_name: meta?.name ?? null,
        launch_tier: meta?.launch_tier ?? null,
        gtm_module: meta?.gtm_module ?? null,
        links: [],
      });
    }
    return byEpic.get(key)!;
  }

  for (const r of runRows) {
    ensureEpic(r.epic_aha_id).links.push(r.link);
  }

  for (const row of rows ?? []) {
    ensureEpic(row.epic_aha_id as string).links.push({
      id: row.id as string,
      scenario: row.scenario as string,
      arr_incremental_2027_usd: row.arr_incremental_2027_usd as number | null,
      arr_incremental_2028_usd: row.arr_incremental_2028_usd as number | null,
      arr_churn_reduction_2027_usd: row.arr_churn_reduction_2027_usd as number | null,
      arr_churn_reduction_2028_usd: row.arr_churn_reduction_2028_usd as number | null,
      url: row.url as string,
      generation_date: row.generation_date as string | null,
      created_at: row.created_at as string,
      created_by: row.created_by as string | null,
      source: 'epic_forecast_link',
    });
  }

  const epics = Array.from(byEpic.values()).sort((a, b) =>
    a.epic_aha_id.localeCompare(b.epic_aha_id)
  );

  return NextResponse.json({ epics });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
