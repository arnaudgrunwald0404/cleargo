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
}

export interface ForecastEpicSummary {
  epic_aha_id: string;
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

  // Fetch epic metadata (name, aha_fields) and gtm_module for all referenced epics
  const ahaIds = [...new Set((rows ?? []).map(r => r.epic_aha_id as string))];
  const epicMeta = new Map<string, { name: string | null; launch_tier: string | null; gtm_module: string | null }>();

  if (ahaIds.length > 0) {
    const [{ data: epics }, { data: snapshots }] = await Promise.all([
      adminSupabase
        .from('epic')
        .select('aha_id, name, aha_fields')
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
        name: (e.name as string | null) ?? nameByKey.get(e.aha_id as string) ?? null,
        launch_tier: typeof launchTier === 'string' ? launchTier : null,
        gtm_module: gtmByKey.get(e.aha_id as string) ?? null,
      });
    }
    // Fallback: epics in forecast_link but not in epic table — use snapshot data
    for (const id of ahaIds) {
      if (!epicMeta.has(id)) {
        epicMeta.set(id, {
          name: nameByKey.get(id) ?? null,
          launch_tier: null,
          gtm_module: gtmByKey.get(id) ?? null,
        });
      }
    }
  }

  // Group by epic_aha_id
  const byEpic = new Map<string, ForecastEpicSummary>();

  for (const row of rows ?? []) {
    const key = row.epic_aha_id as string;
    const meta = epicMeta.get(key);

    if (!byEpic.has(key)) {
      byEpic.set(key, {
        epic_aha_id: key,
        epic_name: meta?.name ?? null,
        launch_tier: meta?.launch_tier ?? null,
        gtm_module: meta?.gtm_module ?? null,
        links: [],
      });
    }

    byEpic.get(key)!.links.push({
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
    });
  }

  const epics = Array.from(byEpic.values()).sort((a, b) =>
    a.epic_aha_id.localeCompare(b.epic_aha_id)
  );

  return NextResponse.json({ epics });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
