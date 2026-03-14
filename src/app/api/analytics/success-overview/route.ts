import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import type { HeartCategoryId, HeartMetricStatus } from '@/lib/heart/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SparklinePoint {
  date: string;
  value: number | null;
}

interface HeartCategoryData {
  latestValue: number | null;
  latestStatus: string | null;
  sparklineData: SparklinePoint[];
  metricName: string;
}

interface LegacyMetricData {
  name: string;
  actual: number | null;
  target: number | null;
  status: string;
}

export interface SuccessOverviewEpic {
  epicId: string;
  epicName: string;
  productName: string | null;
  ownerName: string | null;
  launchDate: string | null;
  status: string;
  tier: string;
  measurementSystem: 'heart' | 'legacy';
  overallHealth: HeartMetricStatus | null;
  heartCategories?: Partial<Record<HeartCategoryId, HeartCategoryData>>;
  legacyMetrics?: LegacyMetricData[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeOverallHealth(statuses: (string | null)[]): HeartMetricStatus | null {
  const valid = statuses.filter(Boolean) as string[];
  if (valid.length === 0) return null;
  if (valid.includes('MISSED')) return 'MISSED';
  if (valid.includes('AT_RISK')) return 'AT_RISK';
  if (valid.every(s => s === 'ON_TRACK')) return 'ON_TRACK';
  return 'PENDING';
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((appUser?.roles as string[]) || [], 'analytics.read', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const tierFilter = searchParams.get('tier') || undefined;
    const podFilter = searchParams.get('pod') || undefined;

    // ------------------------------------------------------------------
    // Query 1: HEART epics — configs + metrics (no deep nesting)
    // ------------------------------------------------------------------
    let heartQuery = supabase
      .from('epic')
      .select(`
        id,
        name,
        target_launch_date,
        status,
        tier,
        product:product_id ( name ),
        owner:owner_id ( name, email ),
        epic_heart_configs!inner (
          id,
          status,
          epic_heart_metrics (
            id,
            heart_category,
            name,
            target_value
          )
        )
      `)
      .in('epic_heart_configs.status', ['active', 'archived'])
      .eq('archived', false)
      .order('target_launch_date', { ascending: false, nullsFirst: false });

    if (tierFilter) heartQuery = heartQuery.eq('tier', tierFilter);
    if (podFilter) heartQuery = heartQuery.eq('pod', podFilter);

    const { data: heartEpics, error: heartError } = await heartQuery;

    if (heartError) {
      console.error('Error fetching HEART epics:', heartError);
    }

    // Collect all metric IDs to batch-fetch snapshots
    const allMetricIds: string[] = [];
    for (const epic of heartEpics || []) {
      const config = (epic as any).epic_heart_configs?.[0];
      if (!config) continue;
      for (const metric of config.epic_heart_metrics || []) {
        allMetricIds.push(metric.id);
      }
    }

    // Batch-fetch recent snapshots for all metrics at once
    const snapshotsByMetric = new Map<string, Array<{ snapshot_date: string; value: number | null; status: string | null }>>();
    if (allMetricIds.length > 0) {
      const { data: snapshots } = await supabase
        .from('epic_heart_snapshots')
        .select('epic_heart_metric_id, snapshot_date, value, status')
        .in('epic_heart_metric_id', allMetricIds)
        .order('snapshot_date', { ascending: true });

      for (const snap of snapshots || []) {
        const metricId = (snap as any).epic_heart_metric_id;
        if (!snapshotsByMetric.has(metricId)) {
          snapshotsByMetric.set(metricId, []);
        }
        snapshotsByMetric.get(metricId)!.push({
          snapshot_date: snap.snapshot_date,
          value: snap.value,
          status: snap.status,
        });
      }

      // Keep only last 30 per metric
      for (const [key, arr] of snapshotsByMetric) {
        if (arr.length > 30) {
          snapshotsByMetric.set(key, arr.slice(-30));
        }
      }
    }

    // Build HEART results
    const heartEpicIds = new Set<string>();
    const results: SuccessOverviewEpic[] = [];

    for (const epic of heartEpics || []) {
      heartEpicIds.add(epic.id);
      const config = (epic as any).epic_heart_configs?.[0];
      if (!config) continue;

      const categories: Partial<Record<HeartCategoryId, HeartCategoryData>> = {};
      const allStatuses: (string | null)[] = [];

      for (const metric of config.epic_heart_metrics || []) {
        const snapshots = snapshotsByMetric.get(metric.id) || [];
        const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
        allStatuses.push(latest?.status || null);

        categories[metric.heart_category as HeartCategoryId] = {
          latestValue: latest?.value ?? null,
          latestStatus: latest?.status ?? null,
          sparklineData: snapshots.map(s => ({ date: s.snapshot_date, value: s.value })),
          metricName: metric.name || metric.heart_category,
        };
      }

      const product = (epic as any).product;
      const owner = (epic as any).owner;

      results.push({
        epicId: epic.id,
        epicName: epic.name,
        productName: product?.name ?? null,
        ownerName: owner?.name ?? owner?.email ?? null,
        launchDate: epic.target_launch_date,
        status: epic.status || 'Pre_Release',
        tier: epic.tier || 'TIER_1',
        measurementSystem: 'heart',
        overallHealth: computeOverallHealth(allStatuses),
        heartCategories: categories,
      });
    }

    // ------------------------------------------------------------------
    // Query 2: Legacy success epics (not already in HEART set)
    // ------------------------------------------------------------------
    let legacyQuery = supabase
      .from('epic')
      .select(`
        id,
        name,
        target_launch_date,
        status,
        tier,
        product:product_id ( name ),
        owner:owner_id ( name, email ),
        epic_success_configs!inner ( epic_id )
      `)
      .eq('archived', false)
      .order('target_launch_date', { ascending: false, nullsFirst: false });

    if (tierFilter) legacyQuery = legacyQuery.eq('tier', tierFilter);
    if (podFilter) legacyQuery = legacyQuery.eq('pod', podFilter);

    const { data: legacyEpics, error: legacyError } = await legacyQuery;

    if (legacyError) {
      console.error('Error fetching legacy success epics:', legacyError);
    }

    // Batch-fetch latest scorecard per legacy epic
    const legacyEpicIdsToFetch = (legacyEpics || [])
      .filter(e => !heartEpicIds.has(e.id))
      .map(e => e.id);

    const scorecardMap = new Map<string, any>();
    if (legacyEpicIdsToFetch.length > 0) {
      const { data: allScorecards } = await supabase
        .from('epic_scorecards')
        .select('epic_id, metric_results, overall_status, snapshot_date')
        .in('epic_id', legacyEpicIdsToFetch)
        .order('snapshot_date', { ascending: false });

      // Keep only the latest scorecard per epic
      for (const sc of allScorecards || []) {
        if (!scorecardMap.has(sc.epic_id)) {
          scorecardMap.set(sc.epic_id, sc);
        }
      }
    }

    for (const epic of legacyEpics || []) {
      if (heartEpicIds.has(epic.id)) continue;

      const latestScorecard = scorecardMap.get(epic.id);
      const product = (epic as any).product;
      const owner = (epic as any).owner;

      const legacyMetrics: LegacyMetricData[] = [];
      if (latestScorecard?.metric_results) {
        for (const mr of latestScorecard.metric_results as any[]) {
          legacyMetrics.push({
            name: mr.metricName || 'Metric',
            actual: typeof mr.actual === 'number' ? mr.actual : null,
            target: mr.expected ?? null,
            status: mr.status || 'ON_TRACK',
          });
        }
      }

      results.push({
        epicId: epic.id,
        epicName: epic.name,
        productName: product?.name ?? null,
        ownerName: owner?.name ?? owner?.email ?? null,
        launchDate: epic.target_launch_date,
        status: epic.status || 'Pre_Release',
        tier: epic.tier || 'TIER_1',
        measurementSystem: 'legacy',
        overallHealth: (latestScorecard?.overall_status as HeartMetricStatus) ?? null,
        legacyMetrics,
      });
    }

    return NextResponse.json({ epics: results });
  } catch (error: any) {
    console.error('Error fetching success overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch success overview', details: error.message },
      { status: 500 }
    );
  }
}
