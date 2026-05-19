import { endOfQuarter, format, parseISO, startOfMonth, startOfQuarter } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EpicMovementNoteForAnalysis,
  PeriodShiftAnalysis,
  PlanVsActualItem,
  PlanVsActualPeriodType,
  PlanVsActualQuarterContext,
  PlanVsActualReportPayload,
} from '@/types/roadmap';
import { isQuarterResultsWindowAvailable } from '@/lib/roadmap/planVsActualPeriodUi';
import { sanitizePivotCellString } from '@/lib/aha/pivotNormalizer';
import {
  allowedTrainMonthKeysForPlanVsActualReport,
  derivePlanVsActualStatus,
  includePlanVsActualItemForReport,
} from '@/lib/roadmap/planVsActualStatus';
import { clampPlanVsActualPeriodDate, getPeriodBounds } from '@/lib/roadmap/planVsActualPeriodUi';

export { getPeriodBounds } from '@/lib/roadmap/planVsActualPeriodUi';
import {
  isCleargoCandidateEpicRecord,
  supplementRpcRowsWithCleargoEpics,
  type CleargoEpicLiveRow,
} from '@/lib/roadmap/planVsActualLiveEpic';
import {
  generatePeriodShiftAnalysis,
  generateSingleItemNarrative,
  SHIFT_ANALYSIS_MODEL_ID,
} from '@/lib/roadmap/shiftAnalyzer';

export interface RpcPlanVsActualRow {
  aha_key: string;
  start_snapshot_date: string | null;
  end_snapshot_date: string | null;
  in_start: boolean;
  in_end: boolean;
  start_aha_name: string | null;
  end_aha_name: string | null;
  start_aha_primary_goal: string | null;
  end_aha_primary_goal: string | null;
  start_aha_pod: string | null;
  end_aha_pod: string | null;
  start_gtm_module: string | null;
  end_gtm_module: string | null;
  start_gtm_name: string | null;
  end_gtm_name: string | null;
  start_aha_release: string | null;
  end_aha_release: string | null;
  start_aha_status: string | null;
  end_aha_status: string | null;
  start_aha_end_date: string | null;
  end_aha_end_date: string | null;
  start_aha_progress: number | null;
  end_aha_progress: number | null;
  first_scan_aha_release: string | null;
}

export type ReleaseScheduleMaps = {
  orderIndex: Map<string, number>;
  /** Lowercased `release_name` → calendar launch date (for Plan vs Actual day-gap rules). */
  launchDateByKey: Map<string, Date>;
};

/** Train order + launch dates from `release_schedule` for Plan vs Actual status rules. */
export async function buildReleaseScheduleMaps(supabase: SupabaseClient): Promise<ReleaseScheduleMaps> {
  const { data, error } = await supabase
    .from('release_schedule')
    .select('release_name, launch_date')
    .eq('archived', false)
    .order('launch_date', { ascending: true });

  if (error) {
    console.warn('[planVsActual] release_schedule:', error.message);
    return { orderIndex: new Map(), launchDateByKey: new Map() };
  }

  const orderIndex = new Map<string, number>();
  const launchDateByKey = new Map<string, Date>();
  (data || []).forEach((r, i) => {
    const k = String(r.release_name ?? '')
      .trim()
      .toLowerCase();
    if (!k) return;
    orderIndex.set(k, i);
    const raw = r.launch_date;
    if (raw == null) return;
    const d = parseISO(String(raw).slice(0, 10));
    if (!Number.isNaN(d.getTime())) {
      launchDateByKey.set(k, d);
    }
  });
  return { orderIndex, launchDateByKey };
}

/** Latest non-archived launch in [periodStart, periodEnd] (inclusive). */
export async function getLastReleaseLaunchInPeriod(
  supabase: SupabaseClient,
  periodStartIso: string,
  periodEndIso: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('release_schedule')
    .select('launch_date')
    .eq('archived', false)
    .gte('launch_date', periodStartIso)
    .lte('launch_date', periodEndIso)
    .order('launch_date', { ascending: false })
    .limit(1);

  if (error || !data?.length) return null;
  const raw = data[0].launch_date;
  if (raw == null) return null;
  return format(parseISO(String(raw).slice(0, 10)), 'yyyy-MM-dd');
}

export async function buildQuarterContext(
  supabase: SupabaseClient,
  quarterStartIso: string,
): Promise<PlanVsActualQuarterContext> {
  const qs = startOfQuarter(parseISO(quarterStartIso));
  const qe = endOfQuarter(qs);
  const qStart = format(qs, 'yyyy-MM-dd');
  const qEnd = format(qe, 'yyyy-MM-dd');
  const lastQuarterReleaseLaunchDate = await getLastReleaseLaunchInPeriod(supabase, qStart, qEnd);
  return {
    quarterStart: qStart,
    lastQuarterReleaseLaunchDate,
    quarterResultsAvailable: isQuarterResultsWindowAvailable(
      qStart,
      new Date(),
      lastQuarterReleaseLaunchDate,
    ),
  };
}

function displayFeatureName(row: RpcPlanVsActualRow): string {
  const raw =
    row.end_gtm_name?.trim() ||
    row.end_aha_name?.trim() ||
    row.start_gtm_name?.trim() ||
    row.start_aha_name?.trim() ||
    '';
  const cleaned = raw ? sanitizePivotCellString(raw) : '';
  return cleaned || row.aha_key;
}

/** GTM module from snapshot only (not pod / dev backlog). */
function displayGtmModule(row: RpcPlanVsActualRow): string | null {
  const raw = row.end_gtm_module?.trim() || row.start_gtm_module?.trim() || '';
  const cleaned = raw ? sanitizePivotCellString(raw) : '';
  return cleaned || null;
}

function displayGoal(row: RpcPlanVsActualRow): string | null {
  const raw = row.end_aha_primary_goal?.trim() || row.start_aha_primary_goal?.trim() || '';
  const cleaned = raw ? sanitizePivotCellString(raw) : '';
  return cleaned || null;
}

export function mapRowToPlanVsActualItem(
  row: RpcPlanVsActualRow,
  releaseOrderIndex: Map<string, number>,
  pmNoteCause: string | null = null,
  launchDateByKey?: ReadonlyMap<string, Date>,
  periodEndIso?: string,
  periodType?: PlanVsActualPeriodType,
): PlanVsActualItem {
  const { category, label } = derivePlanVsActualStatus(
    {
      inStart: row.in_start,
      inEnd: row.in_end,
      startRelease: row.start_aha_release,
      endRelease: row.end_aha_release,
      startStatus: row.start_aha_status,
      endStatus: row.end_aha_status,
      endProgress: row.end_aha_progress ?? null,
      firstScanRelease: row.first_scan_aha_release ?? null,
      periodEndIso: periodEndIso ?? null,
      periodType,
    },
    releaseOrderIndex,
    launchDateByKey,
  );

  return {
    ahaKey: row.aha_key,
    goal: displayGoal(row),
    productArea: displayGtmModule(row),
    pmNoteCause,
    featureName: displayFeatureName(row),
    startSnapshotDate: row.start_snapshot_date,
    endSnapshotDate: row.end_snapshot_date,
    inStart: row.in_start,
    inEnd: row.in_end,
    startRelease: row.start_aha_release,
    endRelease: row.end_aha_release,
    startProgress: row.start_aha_progress ?? null,
    endProgress: row.end_aha_progress ?? null,
    startStatus: row.start_aha_status,
    endStatus: row.end_aha_status,
    firstScanRelease: row.first_scan_aha_release ?? null,
    statusCategory: category,
    statusLabel: label,
  };
}

/** Live ClearGO epics (cleargo candidate) for net-new rows not yet on a weekly snapshot. */
async function fetchCleargoCandidateEpicsForSupplement(
  supabase: SupabaseClient,
): Promise<CleargoEpicLiveRow[]> {
  const { data, error } = await supabase
    .from('epic')
    .select('aha_id, name, aha_fields')
    .not('aha_id', 'is', null)
    .eq('archived', false);

  if (error || !data?.length) return [];
  return data.filter(
    (e) => e.aha_id && isCleargoCandidateEpicRecord(e),
  ) as CleargoEpicLiveRow[];
}

export async function fetchMovementNotesForAhaKeys(
  supabase: SupabaseClient,
  ahaKeys: string[],
): Promise<EpicMovementNoteForAnalysis[]> {
  if (ahaKeys.length === 0) return [];

  const { data: epics, error: e1 } = await supabase
    .from('epic')
    .select('id, aha_id')
    .in('aha_id', ahaKeys);

  if (e1 || !epics?.length) return [];

  const epicIds = epics.map((e) => e.id);
  const epicToAha = new Map(epics.map((e) => [e.id, e.aha_id as string]));

  const { data: comments, error: e2 } = await supabase
    .from('epic_comment')
    .select(
      'id, epic_id, comment_text, category, movement_cause, from_release, to_release, related_snapshot_date, created_at',
    )
    .in('epic_id', epicIds)
    .order('created_at', { ascending: false });

  if (e2 || !comments) return [];

  return comments.map((c) => ({
    id: c.id as string,
    ahaKey: epicToAha.get(c.epic_id as string) ?? '',
    commentText: c.comment_text as string,
    category: (c.category as string) ?? null,
    movementCause: (c.movement_cause as string) ?? null,
    fromRelease: (c.from_release as string) ?? null,
    toRelease: (c.to_release as string) ?? null,
    relatedSnapshotDate: c.related_snapshot_date
      ? format(parseISO(String(c.related_snapshot_date)), 'yyyy-MM-dd')
      : null,
    createdAt: c.created_at as string,
  }));
}

/** Latest `movement_cause` per aha key (most recent comment that has a cause). */
export async function fetchLatestPmNoteCauseByAhaKeys(
  supabase: SupabaseClient,
  ahaKeys: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ahaKeys.length === 0) return out;

  const { data: epics, error: e1 } = await supabase
    .from('epic')
    .select('id, aha_id')
    .in('aha_id', ahaKeys);

  if (e1 || !epics?.length) return out;

  const epicIds = epics.map((e) => e.id);
  const epicToAha = new Map(epics.map((e) => [e.id, e.aha_id as string]));

  const { data: comments, error: e2 } = await supabase
    .from('epic_comment')
    .select('epic_id, movement_cause, created_at')
    .in('epic_id', epicIds)
    .not('movement_cause', 'is', null)
    .order('created_at', { ascending: false });

  if (e2 || !comments) return out;

  for (const c of comments) {
    const aha = epicToAha.get(c.epic_id as string);
    const cause = (c.movement_cause as string)?.trim();
    if (aha && cause && !out.has(aha)) {
      out.set(aha, cause);
    }
  }
  return out;
}

export async function loadCachedPeriodAnalysis(
  supabase: SupabaseClient,
  periodType: PlanVsActualPeriodType,
  periodStart: string,
): Promise<{ analysis: PeriodShiftAnalysis | null; generatedAt: string | null }> {
  const { data, error } = await supabase
    .from('roadmap_period_analysis')
    .select('ai_analysis, generated_at')
    .eq('period_type', periodType)
    .eq('period_start', periodStart)
    .maybeSingle();

  if (error || !data?.ai_analysis) {
    return { analysis: null, generatedAt: null };
  }

  return {
    analysis: data.ai_analysis as PeriodShiftAnalysis,
    generatedAt: data.generated_at ?? null,
  };
}

/** Merge edits into cached AI JSON without regenerating; preserves `generated_at`. */
export async function patchRoadmapPeriodAnalysis(
  supabase: SupabaseClient,
  periodType: PlanVsActualPeriodType,
  periodDateIso: string,
  patch: {
    overview?: string;
    themes?: string[];
    itemInsight?: {
      ahaKey: string;
      summary: string;
      likelyReasons: string;
      /** When omitted, existing cached `arrImpact` for this row is preserved. */
      arrImpact?: string;
    };
  },
  opts?: { recordUserEditMarker?: boolean },
): Promise<{ analysis: PeriodShiftAnalysis; generatedAt: string | null }> {
  const hasPatch =
    patch.overview !== undefined ||
    patch.themes !== undefined ||
    patch.itemInsight !== undefined;
  if (!hasPatch) {
    throw new Error('No updates provided');
  }

  const periodDateClamped = clampPlanVsActualPeriodDate(periodType, periodDateIso);
  const { periodStart } = getPeriodBounds(periodType, periodDateClamped);
  const cached = await loadCachedPeriodAnalysis(supabase, periodType, periodStart);
  if (!cached.analysis) {
    throw new Error('No saved analysis for this period. Generate analysis first.');
  }

  const analysis: PeriodShiftAnalysis = {
    ...cached.analysis,
    themes: [...(cached.analysis.themes ?? [])],
    itemInsights: [...(cached.analysis.itemInsights ?? [])],
  };

  if (patch.overview !== undefined) {
    analysis.overview = patch.overview.trim();
  }
  if (patch.themes !== undefined) {
    analysis.themes = patch.themes.map((t) => t.trim()).filter(Boolean);
  }
  if (patch.itemInsight) {
    const { ahaKey, summary, likelyReasons, arrImpact } = patch.itemInsight;
    const ix = analysis.itemInsights.findIndex((i) => i.ahaKey === ahaKey);
    const prev = ix >= 0 ? analysis.itemInsights[ix] : undefined;
    const nextArr =
      arrImpact !== undefined ? arrImpact.trim() || undefined : prev?.arrImpact;
    const row = {
      ahaKey,
      summary: summary.trim(),
      likelyReasons: likelyReasons.trim(),
      ...(nextArr !== undefined ? { arrImpact: nextArr } : {}),
    };
    if (ix >= 0) {
      analysis.itemInsights[ix] = row;
    } else {
      analysis.itemInsights.push(row);
    }
  }

  const recordUserEdit = opts?.recordUserEditMarker !== false;
  if (recordUserEdit) {
    const mv = analysis.modelVersion ?? '';
    if (!mv.includes('user_edited')) {
      analysis.modelVersion = mv ? `${mv};user_edited` : 'user_edited';
    }
  }

  const { error } = await supabase
    .from('roadmap_period_analysis')
    .update({
      ai_analysis: analysis as unknown as Record<string, unknown>,
      ai_model_version: analysis.modelVersion ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('period_type', periodType)
    .eq('period_start', periodStart);

  if (error) {
    throw new Error(error.message);
  }

  return { analysis, generatedAt: cached.generatedAt };
}

/** Persist ARR/accounts for one row without requiring a full AI analysis run. */
export async function upsertPlanVsActualItemArr(
  supabase: SupabaseClient,
  periodType: PlanVsActualPeriodType,
  periodDateIso: string,
  ahaKey: string,
  arrImpact: string,
): Promise<{ analysis: PeriodShiftAnalysis; generatedAt: string | null }> {
  const periodDateClamped = clampPlanVsActualPeriodDate(periodType, periodDateIso);
  const { periodStart, periodEnd } = getPeriodBounds(periodType, periodDateClamped);
  const report = await getPlanVsActualReport(supabase, periodType, periodDateIso);
  const item = report.items.find((i) => i.ahaKey === ahaKey);
  if (!item) {
    throw new Error('This epic is not in the current Plan vs Actual period.');
  }

  const cached = await loadCachedPeriodAnalysis(supabase, periodType, periodStart);
  const base: PeriodShiftAnalysis = cached.analysis ?? {
    overview: '',
    themes: [],
    itemInsights: [],
    modelVersion: 'arr_only',
  };

  const itemInsights = [...(base.itemInsights ?? [])];
  const ix = itemInsights.findIndex((i) => i.ahaKey === ahaKey);
  const prev = ix >= 0 ? itemInsights[ix] : undefined;
  const trimmed = arrImpact.trim();
  const row = {
    ahaKey,
    summary: prev?.summary ?? '',
    likelyReasons: prev?.likelyReasons ?? '',
    ...(trimmed ? { arrImpact: trimmed } : {}),
  };
  if (ix >= 0) itemInsights[ix] = row;
  else itemInsights.push(row);

  const analysis: PeriodShiftAnalysis = { ...base, itemInsights };
  const generatedAt = cached.generatedAt ?? new Date().toISOString();

  await upsertRoadmapPeriodAnalysis(supabase, {
    periodType,
    periodStart,
    periodEnd,
    startSnapshotDate: report.startSnapshotDate,
    endSnapshotDate: report.endSnapshotDate,
    items: report.items,
    analysis,
    aiModelVersion: analysis.modelVersion ?? 'arr_only',
  });

  return { analysis, generatedAt };
}

export async function getPlanVsActualReport(
  supabase: SupabaseClient,
  periodType: PlanVsActualPeriodType,
  periodDateIso: string,
): Promise<PlanVsActualReportPayload> {
  const periodDateClamped = clampPlanVsActualPeriodDate(periodType, periodDateIso);
  const { periodStart, periodEnd } = getPeriodBounds(periodType, periodDateClamped);

  const { data: rpcRows, error: rpcErr } = await supabase.rpc('get_period_plan_vs_actual', {
    p_period_type: periodType,
    p_period_date: periodType === 'quarter_progress' ? periodDateClamped : periodStart,
  });

  if (rpcErr) {
    throw new Error(rpcErr.message);
  }

  let rows = (rpcRows || []) as RpcPlanVsActualRow[];
  const { orderIndex: releaseOrderIndex, launchDateByKey } = await buildReleaseScheduleMaps(supabase);

  const allowedTrainMonthKeys = allowedTrainMonthKeysForPlanVsActualReport(
    periodType,
    periodStart,
    periodEnd,
  );
  const reportingScope = { allowedTrainMonthKeys };

  let startSnapshotDate: string | null = null;
  let endSnapshotDate: string | null = null;
  if (rows.length > 0) {
    startSnapshotDate = rows[0].start_snapshot_date;
    endSnapshotDate = rows[0].end_snapshot_date;
  }

  if (periodType !== 'quarter_baseline') {
    const liveEpics = await fetchCleargoCandidateEpicsForSupplement(supabase);
    rows = supplementRpcRowsWithCleargoEpics(
      rows,
      liveEpics,
      periodType,
      reportingScope,
      endSnapshotDate,
    );
  }
  const ahaKeys = rows.map((r) => r.aha_key);
  const pmCauses = await fetchLatestPmNoteCauseByAhaKeys(supabase, ahaKeys);

  const items = rows
    .map((r) =>
      mapRowToPlanVsActualItem(
        r,
        releaseOrderIndex,
        pmCauses.get(r.aha_key) ?? null,
        launchDateByKey,
        periodEnd,
        periodType,
      ),
    )
    .filter((item) => includePlanVsActualItemForReport(item, reportingScope));

  const cached = await loadCachedPeriodAnalysis(supabase, periodType, periodStart);

  const quarterAnchor = format(startOfQuarter(parseISO(periodStart)), 'yyyy-MM-dd');
  const quarterContext = await buildQuarterContext(supabase, quarterAnchor);

  return {
    periodType,
    periodStart,
    periodEnd,
    startSnapshotDate,
    endSnapshotDate,
    items,
    cachedAnalysis: cached.analysis,
    analysisGeneratedAt: cached.generatedAt,
    quarterContext,
  };
}

export async function upsertRoadmapPeriodAnalysis(
  supabase: SupabaseClient,
  payload: {
    periodType: PlanVsActualPeriodType;
    periodStart: string;
    periodEnd: string;
    startSnapshotDate: string | null;
    endSnapshotDate: string | null;
    items: PlanVsActualItem[];
    analysis: PeriodShiftAnalysis;
    aiModelVersion: string;
  },
): Promise<void> {
  const { error } = await supabase.from('roadmap_period_analysis').upsert(
    {
      period_type: payload.periodType,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      start_snapshot_date: payload.startSnapshotDate ?? payload.periodStart,
      end_snapshot_date: payload.endSnapshotDate ?? payload.periodEnd,
      items_snapshot: payload.items,
      ai_analysis: payload.analysis,
      ai_model_version: payload.aiModelVersion,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period_type,period_start' },
  );

  if (error) throw new Error(error.message);
}

/**
 * Runs Claude analysis and persists to `roadmap_period_analysis`.
 */
export async function generateAndPersistPeriodAnalysis(
  supabase: SupabaseClient,
  periodType: PlanVsActualPeriodType,
  periodDateIso: string,
  opts?: { force?: boolean },
): Promise<{ analysis: PeriodShiftAnalysis; generatedAt: string; fromCache: boolean }> {
  const report = await getPlanVsActualReport(supabase, periodType, periodDateIso);

  if (!opts?.force && report.cachedAnalysis) {
    return {
      analysis: report.cachedAnalysis,
      generatedAt: report.analysisGeneratedAt ?? new Date().toISOString(),
      fromCache: true,
    };
  }

  const keys = report.items.map((i) => i.ahaKey);
  const notes = await fetchMovementNotesForAhaKeys(supabase, keys);
  let analysis = await generatePeriodShiftAnalysis(
    {
      periodType: report.periodType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      startSnapshotDate: report.startSnapshotDate,
      endSnapshotDate: report.endSnapshotDate,
      items: report.items,
    },
    notes,
  );

  /** Preserve manually entered ARR text across full-period regeneration. */
  if (opts?.force && report.cachedAnalysis?.itemInsights?.length) {
    const prevByKey = new Map(report.cachedAnalysis.itemInsights.map((i) => [i.ahaKey, i]));
    analysis = {
      ...analysis,
      itemInsights: analysis.itemInsights.map((row) => {
        const p = prevByKey.get(row.ahaKey);
        const saved = p?.arrImpact?.trim();
        return saved ? { ...row, arrImpact: saved } : row;
      }),
    };
  }

  const modelVersion = analysis.modelVersion ?? SHIFT_ANALYSIS_MODEL_ID;

  await upsertRoadmapPeriodAnalysis(supabase, {
    periodType: report.periodType,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    startSnapshotDate: report.startSnapshotDate,
    endSnapshotDate: report.endSnapshotDate,
    items: report.items,
    analysis,
    aiModelVersion: modelVersion,
  });

  return {
    analysis,
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };
}

/** Regenerate AI narrative for one row; merges into cached period analysis without `user_edited`. */
export async function regeneratePlanVsActualItemNarrative(
  supabase: SupabaseClient,
  periodType: PlanVsActualPeriodType,
  periodDateIso: string,
  ahaKey: string,
): Promise<{ analysis: PeriodShiftAnalysis; generatedAt: string | null }> {
  const report = await getPlanVsActualReport(supabase, periodType, periodDateIso);
  if (!report.cachedAnalysis) {
    throw new Error('No saved analysis for this period. Generate analysis first.');
  }

  const item = report.items.find((i) => i.ahaKey === ahaKey);
  if (!item) {
    throw new Error('This epic is not in the current Plan vs Actual period.');
  }

  const notes = await fetchMovementNotesForAhaKeys(supabase, [ahaKey]);
  const insight = await generateSingleItemNarrative(
    {
      periodType: report.periodType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      startSnapshotDate: report.startSnapshotDate,
      endSnapshotDate: report.endSnapshotDate,
      item,
    },
    notes,
  );

  return patchRoadmapPeriodAnalysis(
    supabase,
    periodType,
    periodDateIso,
    {
      itemInsight: {
        ahaKey,
        summary: insight.summary,
        likelyReasons: insight.likelyReasons,
      },
    },
    { recordUserEditMarker: false },
  );
}
