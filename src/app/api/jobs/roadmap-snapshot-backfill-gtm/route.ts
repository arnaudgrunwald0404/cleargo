/**
 * Backfill `roadmap_snapshot.gtm_module` / `gtm_name` from the current Aha! roadmap pivot.
 * Uses the same mapping as `/api/jobs/roadmap-snapshot`. Labels reflect **today’s** pivot, not true
 * historical point-in-time values — acceptable when the goal is attribution for reporting.
 *
 * Auth: Authorization: Bearer CRON_SECRET
 *
 * Query:
 * - `force=true` — set GTM columns exactly from pivot (including NULL when pivot is empty).
 * - `dry_run=true` — no DB writes; returns pivot epic count and sample keys.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizePivotApiResponse } from '@/lib/aha/pivotNormalizer';
import { mapPivotRowToRoadmapSnapshot } from '@/lib/aha/pivotMapping';
import { fetchAhaPivotPage, nextPivotPageUrl } from '@/lib/aha/pivotFetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const RPC_CHUNK = 120;

function requireCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

type GtmRow = { aha_key: string; gtm_module: string | null; gtm_name: string | null };

export async function GET(request: NextRequest) {
  return runBackfill(request);
}

export async function POST(request: NextRequest) {
  return runBackfill(request);
}

async function runBackfill(request: NextRequest): Promise<NextResponse> {
  try {
    if (!requireCronAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pivotId = process.env.AHA_ROADMAP_PIVOT_ID;
    const domain = process.env.AHA_DOMAIN;
    if (!pivotId || !domain) {
      return NextResponse.json(
        { error: 'Missing AHA_ROADMAP_PIVOT_ID or AHA_DOMAIN' },
        { status: 500 }
      );
    }

    const force =
      request.nextUrl.searchParams.get('force') === '1' ||
      request.nextUrl.searchParams.get('force') === 'true';
    const dryRun =
      request.nextUrl.searchParams.get('dry_run') === '1' ||
      request.nextUrl.searchParams.get('dry_run') === 'true';

    const epicMap = new Map<string, string | null>();
    const updates: GtmRow[] = [];
    const seen = new Set<string>();

    let url: string | null =
      `https://${domain}/api/v1/bookmarks/custom_pivots/${pivotId}?view=list`;
    const dummyDate = '1970-01-01';

    while (url) {
      const page = await fetchAhaPivotPage(url);
      const normalized = normalizePivotApiResponse(page);

      for (const row of normalized) {
        const mapped = mapPivotRowToRoadmapSnapshot(row, dummyDate, epicMap);
        if (!mapped.aha_key || seen.has(mapped.aha_key)) continue;
        seen.add(mapped.aha_key);
        updates.push({
          aha_key: mapped.aha_key,
          gtm_module: mapped.gtm_module,
          gtm_name: mapped.gtm_name,
        });
      }

      url = nextPivotPageUrl(url, page);
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        epics_in_pivot: updates.length,
        mode: force ? 'force' : 'merge',
        sample_keys: updates.slice(0, 15).map((u) => u.aha_key),
      });
    }

    const supabase = createAdminClient();
    let rowsUpdated = 0;
    let chunks = 0;

    for (let i = 0; i < updates.length; i += RPC_CHUNK) {
      const slice = updates.slice(i, i + RPC_CHUNK);
      const payload = slice.map((u) => ({
        aha_key: u.aha_key,
        gtm_module: u.gtm_module,
        gtm_name: u.gtm_name,
      }));

      const { data, error } = await supabase.rpc('apply_roadmap_snapshot_gtm_from_pivot', {
        p_updates: payload,
        p_force: force,
      });

      if (error) {
        console.error('[roadmap-snapshot-backfill-gtm] rpc error', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      chunks += 1;
      rowsUpdated += typeof data === 'number' ? data : Number(data ?? 0);
    }

    return NextResponse.json({
      ok: true,
      dry_run: false,
      mode: force ? 'force' : 'merge',
      epics_in_pivot: updates.length,
      rpc_chunks: chunks,
      rows_updated: rowsUpdated,
      note:
        'Values come from the live pivot; historical snapshot rows receive current GTM labels (merge mode keeps existing cells when pivot sends empty).',
    });
  } catch (e) {
    console.error('[roadmap-snapshot-backfill-gtm]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Backfill failed' },
      { status: 500 }
    );
  }
}
