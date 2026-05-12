/**
 * Analytics Service
 * Provides analytics metrics for ClearGO Analytics v1 dashboard
 */

import { getClient } from '@/lib/db';
import { parseDateOnlyLocal } from '@/lib/date-utils';
import {
  computeStageEndDatesByStageId,
  parseUiLevelFromEpicAha,
  type ReleaseTimelineStage,
} from '@/lib/releaseTimeline';

export type Tier = 'TIER_1' | 'TIER_2' | 'TIER_3';

/**
 * Cross-functional acknowledgement categories
 * These are criteria categories that represent cross-functional acknowledgements
 */
const ACKNOWLEDGEMENT_CATEGORIES = [
  'Marketing',
  'Support',
  'Engineering',
  'Product Marketing',
  'Customer Success',
  'Sales',
];

export interface AnalyticsFilters {
  tier?: Tier | string;
  pod?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
}

export interface SuccessPlanCompletionRate {
  overall: number;
  byTier: Record<Tier, number>;
  byPod: Record<string, number>;
  total: number;
  completed: number;
}

export interface RetroCompletionRate {
  overall: number;
  byTier: Record<Tier, number>;
  byPod: Record<string, number>;
  total: number;
  completed: number;
}

export interface TimeSeriesDataPoint {
  month: string;
  value: number;
  total?: number;
  completed?: number;
}

export interface TimeSeriesData {
  dataPoints: TimeSeriesDataPoint[];
  metricName: string;
}

function generateMonthlyBuckets(monthsBack: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    result.push(`${y}-${m}`);
  }
  return result;
}

function getMonthStartEnd(monthStr: string): { start: string; end: string } {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * Get GA date for an epic (scheduled_ga_dev_date or target_launch_date fallback)
 */
function getGADate(epic: { scheduled_ga_dev_date?: string | null; target_launch_date?: string | null }): string | null {
  return epic.scheduled_ga_dev_date || epic.target_launch_date || null;
}

/**
 * % Launches with Success Plan Completed On Time
 * 
 * Success plan is considered complete when:
 * - epic_success_configs.locked = true
 * - locked_at <= GA date (scheduled_ga_dev_date or target_launch_date)
 * - At least 1 metric exists in epic_success_metrics
 */
export async function getSuccessPlanCompletionRate(
  filters?: AnalyticsFilters
): Promise<SuccessPlanCompletionRate> {
  const supabase = getClient();

  // Build base query for epics with success configs
  let epicQuery = supabase
    .from('epic')
    .select(`
      id,
      tier,
      pod,
      scheduled_ga_dev_date,
      target_launch_date,
      epic_success_configs!inner(
        locked,
        locked_at
      )
    `);

  // Apply filters
  if (filters?.tier) {
    epicQuery = epicQuery.eq('tier', filters.tier);
  }
  if (filters?.pod) {
    epicQuery = epicQuery.eq('pod', filters.pod);
  }
  if (filters?.dateRangeStart) {
    epicQuery = epicQuery.gte('target_launch_date', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    epicQuery = epicQuery.lte('target_launch_date', filters.dateRangeEnd);
  }

  const { data: epics, error } = await epicQuery;

  if (error) {
    console.error('Error fetching epics for success plan completion:', error);
    throw new Error(`Failed to fetch epics: ${error.message}`);
  }

  if (!epics || epics.length === 0) {
    return {
      overall: 0,
      byTier: { TIER_1: 0, TIER_2: 0, TIER_3: 0 },
      byPod: {},
      total: 0,
      completed: 0,
    };
  }

  const epicIds = epics.map(e => e.id);

  // Get metrics count per epic to verify at least 1 metric exists
  const { data: metrics } = await supabase
    .from('epic_success_metrics')
    .select('epic_id')
    .in('epic_id', epicIds);

  const metricsCountByEpic = new Map<string, number>();
  if (metrics) {
    for (const metric of metrics) {
      metricsCountByEpic.set(metric.epic_id, (metricsCountByEpic.get(metric.epic_id) || 0) + 1);
    }
  }

  // Calculate completion
  let total = 0;
  let completed = 0;
  const byTier: Record<Tier, { total: number; completed: number }> = {
    TIER_1: { total: 0, completed: 0 },
    TIER_2: { total: 0, completed: 0 },
    TIER_3: { total: 0, completed: 0 },
  };
  const byPod: Record<string, { total: number; completed: number }> = {};

  for (const epic of epics) {
    const config = Array.isArray(epic.epic_success_configs) 
      ? epic.epic_success_configs[0] 
      : epic.epic_success_configs;

    if (!config || !config.locked || !config.locked_at) {
      continue; // Skip epics without locked configs
    }

    // Check if at least 1 metric exists
    const metricCount = metricsCountByEpic.get(epic.id) || 0;
    if (metricCount === 0) {
      continue; // Skip epics without metrics
    }

    const gaDate = getGADate(epic);
    if (!gaDate) {
      continue; // Skip epics without GA date
    }

    const lockedAt = new Date(config.locked_at);
    const dueDate = new Date(gaDate);

    total++;
    const isOnTime = lockedAt <= dueDate;
    if (isOnTime) {
      completed++;
    }

    // Count by tier
    const tier = epic.tier as Tier;
    if (tier && (tier === 'TIER_1' || tier === 'TIER_2' || tier === 'TIER_3')) {
      byTier[tier].total++;
      if (isOnTime) {
        byTier[tier].completed++;
      }
    }

    // Count by pod
    const pod = epic.pod || 'Unknown';
    if (!byPod[pod]) {
      byPod[pod] = { total: 0, completed: 0 };
    }
    byPod[pod].total++;
    if (isOnTime) {
      byPod[pod].completed++;
    }
  }

  // Calculate percentages
  const overall = total > 0 ? (completed / total) * 100 : 0;
  const byTierRates: Record<Tier, number> = {
    TIER_1: byTier.TIER_1.total > 0 ? (byTier.TIER_1.completed / byTier.TIER_1.total) * 100 : 0,
    TIER_2: byTier.TIER_2.total > 0 ? (byTier.TIER_2.completed / byTier.TIER_2.total) * 100 : 0,
    TIER_3: byTier.TIER_3.total > 0 ? (byTier.TIER_3.completed / byTier.TIER_3.total) * 100 : 0,
  };
  const byPodRates: Record<string, number> = {};
  for (const [pod, stats] of Object.entries(byPod)) {
    byPodRates[pod] = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
  }

  return {
    overall,
    byTier: byTierRates,
    byPod: byPodRates,
    total,
    completed,
  };
}

type ReleaseStageRow = {
  id: number;
  name: string;
  sort_order: number;
  duration_days: number | null;
  scope?: string | null;
  level_durations?: Record<string, { min_days: number; max_days: number }> | null;
};

/**
 * Compute criterion due date from launch stages (sync, no DB).
 * Uses the same segment-end rule as the Release Timeline chart and epic matrix.
 */
function computeDueDateFromStages(
  epicTargetLaunchDate: string | null,
  ratingTimingId: number | null | undefined,
  releaseStages: ReleaseStageRow[],
  epicAhaFields?: unknown
): Date | null {
  if (!epicTargetLaunchDate || ratingTimingId == null || !releaseStages.length) {
    return null;
  }
  const targetStage = releaseStages.find((s) => s.id === ratingTimingId);
  if (!targetStage) return null;
  const scope = targetStage.scope ?? 'release_schedule';
  const scoped = releaseStages.filter(
    (s) => (s.scope ?? 'release_schedule') === scope
  );
  const uiLevel = parseUiLevelFromEpicAha(epicAhaFields);
  const endMap = computeStageEndDatesByStageId(scoped as ReleaseTimelineStage[], epicTargetLaunchDate, {
    useBusinessDayTimeline: scope === 'ui_rollout',
    uiLevel: scope === 'ui_rollout' ? uiLevel ?? null : null,
    cohort2Date: null,
  });
  const ymd = endMap.get(ratingTimingId);
  if (!ymd) return null;
  return parseDateOnlyLocal(ymd) ?? new Date(ymd);
}

/**
 * Fetch release_stages once (small table). Reuse across many criterion due-date calculations.
 */
async function fetchReleaseStages(): Promise<ReleaseStageRow[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('release_stages')
    .select('id, name, sort_order, duration_days, scope, level_durations')
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return data as ReleaseStageRow[];
}

export interface CriteriaOnTimeStats {
  topLateCriteria: Array<{
    criterionName: string;
    criterionId: string;
    totalInstances: number;
    completedOnTime: number;
    completedLate: number;
    onTimePercentage: number;
    medianDaysLate: number;
  }>;
}

/**
 * Criteria On-Time Rate (Top Late Criteria)
 * 
 * For each criterion name, calculate:
 * - Total instances
 * - Completed on time (completion_date <= due_date)
 * - Completed late (completion_date > due_date)
 * - On-time percentage
 * - Median days late for late criteria
 */
export async function getCriteriaOnTimeRate(
  filters?: AnalyticsFilters
): Promise<CriteriaOnTimeStats> {
  const supabase = getClient();

  // Build query for epics
  let epicQuery = supabase
    .from('epic')
    .select('id, target_launch_date, aha_fields');

  if (filters?.tier) {
    epicQuery = epicQuery.eq('tier', filters.tier);
  }
  if (filters?.pod) {
    epicQuery = epicQuery.eq('pod', filters.pod);
  }
  if (filters?.dateRangeStart) {
    epicQuery = epicQuery.gte('target_launch_date', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    epicQuery = epicQuery.lte('target_launch_date', filters.dateRangeEnd);
  }

  const { data: epics, error: epicsError } = await epicQuery;
  if (epicsError || !epics) {
    return { topLateCriteria: [] };
  }

  const epicIds = epics.map(e => e.id);
  const epicMap = new Map(epics.map(e => [e.id, e]));

  const [statusesResult, releaseStages] = await Promise.all([
    supabase
      .from('epic_criterion_status')
      .select(`
        *,
        criterion:criterion_id (
          id,
          label,
          rating_timing
        )
      `)
      .in('epic_id', epicIds),
    fetchReleaseStages(),
  ]);

  const { data: statuses, error: statusesError } = statusesResult;
  if (statusesError || !statuses) {
    return { topLateCriteria: [] };
  }

  // Group by criterion name and calculate stats
  const criterionStats = new Map<string, {
    criterionId: string;
    criterionName: string;
    instances: Array<{
      completed: boolean;
      completedDate: Date | null;
      dueDate: Date | null;
      daysLate: number | null;
    }>;
  }>();

  for (const status of statuses) {
    const epic = epicMap.get(status.epic_id);
    if (!epic) continue;

    const criterion = status.criterion;
    if (!criterion) continue;

    const criterionName = (criterion.label as string) || 'Unknown';
    const criterionId = criterion.id as string;

    const isCompleted = status.status && status.status !== 'NOT_SET';
    const completedDate = status.last_updated_at ? new Date(status.last_updated_at) : null;

    const dueDate = status.condition_due_date
      ? new Date(status.condition_due_date)
      : computeDueDateFromStages(
          epic.target_launch_date,
          criterion.rating_timing as number | null | undefined,
          releaseStages,
          (epic as { aha_fields?: unknown }).aha_fields
        );

    // Calculate days late if completed and due date exists
    let daysLate: number | null = null;
    if (isCompleted && completedDate && dueDate) {
      const diffMs = completedDate.getTime() - dueDate.getTime();
      daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    if (!criterionStats.has(criterionName)) {
      criterionStats.set(criterionName, {
        criterionId,
        criterionName,
        instances: [],
      });
    }

    const stats = criterionStats.get(criterionName)!;
    stats.instances.push({
      completed: isCompleted,
      completedDate,
      dueDate,
      daysLate,
    });
  }

  // Calculate statistics for each criterion
  const criteriaResults: Array<{
    criterionName: string;
    criterionId: string;
    totalInstances: number;
    completedOnTime: number;
    completedLate: number;
    onTimePercentage: number;
    medianDaysLate: number;
  }> = [];

  for (const [criterionName, stats] of criterionStats.entries()) {
    const totalInstances = stats.instances.length;
    const completedInstances = stats.instances.filter(i => i.completed && i.dueDate);
    
    let completedOnTime = 0;
    let completedLate = 0;
    const lateDays: number[] = [];

    for (const instance of completedInstances) {
      if (instance.completedDate && instance.dueDate) {
        if (instance.completedDate <= instance.dueDate) {
          completedOnTime++;
        } else {
          completedLate++;
          if (instance.daysLate !== null && instance.daysLate > 0) {
            lateDays.push(instance.daysLate);
          }
        }
      }
    }

    const onTimePercentage = totalInstances > 0 
      ? (completedOnTime / totalInstances) * 100 
      : 0;

    // Calculate median days late
    let medianDaysLate = 0;
    if (lateDays.length > 0) {
      const sorted = [...lateDays].sort((a, b) => a - b);
      medianDaysLate = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    }

    criteriaResults.push({
      criterionName,
      criterionId: stats.criterionId,
      totalInstances,
      completedOnTime,
      completedLate,
      onTimePercentage,
      medianDaysLate,
    });
  }

  // Sort by on-time percentage ascending (worst first) and take top 10
  const topLateCriteria = criteriaResults
    .sort((a, b) => a.onTimePercentage - b.onTimePercentage)
    .slice(0, 10);

  return { topLateCriteria };
}

/**
 * Calculate tier-specific retro due date offset
 */
function getRetroDueDateOffset(tier: Tier): number {
  switch (tier) {
    case 'TIER_1':
      return 14; // GA + 14 days
    case 'TIER_2':
      return 30; // GA + 30 days
    case 'TIER_3':
      return 45; // GA + 45 days
    default:
      return 30; // Default to Tier 2
  }
}

/**
 * % Launches with Retro Completed On Time
 * 
 * Retro is considered complete on time when:
 * - epic_retros.status = 'SUBMITTED'
 * - submitted_at <= tier-specific due date (GA + tier offset)
 * - Only count retros that are past their due date (eligible epics)
 */
type EpicRetroRow = {
  status: string;
  submitted_at: string | null;
  day_marker: number;
};

type EpicWithRetros = {
  id: string;
  tier: string | null;
  pod: string | null;
  scheduled_ga_dev_date: string | null;
  target_launch_date: string | null;
  epic_retros: EpicRetroRow[];
};

export async function getRetroCompletionRate(
  filters?: AnalyticsFilters
): Promise<RetroCompletionRate> {
  const supabase = getClient();

  // Fetch epics and retros separately: PostgREST may not expose an embed path from
  // `epic` → `epic_retros` (PGRST200) even when `epic_retros.epic_id` references `epic.id`.
  let epicQuery = supabase
    .from('epic')
    .select(
      `
      id,
      tier,
      pod,
      scheduled_ga_dev_date,
      target_launch_date
    `,
    );

  if (filters?.tier) {
    epicQuery = epicQuery.eq('tier', filters.tier);
  }
  if (filters?.pod) {
    epicQuery = epicQuery.eq('pod', filters.pod);
  }
  if (filters?.dateRangeStart) {
    epicQuery = epicQuery.gte('target_launch_date', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    epicQuery = epicQuery.lte('target_launch_date', filters.dateRangeEnd);
  }

  const { data: allEpics, error: epicError } = await epicQuery;

  if (epicError) {
    console.error('Error fetching epics for retro completion:', epicError);
    throw new Error(`Failed to fetch epics: ${epicError.message}`);
  }

  if (!allEpics || allEpics.length === 0) {
    return {
      overall: 0,
      byTier: { TIER_1: 0, TIER_2: 0, TIER_3: 0 },
      byPod: {},
      total: 0,
      completed: 0,
    };
  }

  const epicIds = allEpics.map((e) => e.id);
  const retrosByEpicId = new Map<string, EpicRetroRow[]>();
  const chunkSize = 500;
  for (let i = 0; i < epicIds.length; i += chunkSize) {
    const chunk = epicIds.slice(i, i + chunkSize);
    const { data: retroRows, error: retroError } = await supabase
      .from('epic_retros')
      .select('epic_id, status, submitted_at, day_marker')
      .in('epic_id', chunk);

    if (retroError) {
      console.error('Error fetching epic_retros for retro completion:', retroError);
      throw new Error(`Failed to fetch retros: ${retroError.message}`);
    }

    for (const row of retroRows ?? []) {
      const epicId = row.epic_id as string;
      const list = retrosByEpicId.get(epicId) ?? [];
      list.push({
        status: row.status as string,
        submitted_at: (row.submitted_at as string | null) ?? null,
        day_marker: row.day_marker as number,
      });
      retrosByEpicId.set(epicId, list);
    }
  }

  const epics: EpicWithRetros[] = allEpics
    .filter((e) => retrosByEpicId.has(e.id))
    .map((e) => ({
      id: e.id,
      tier: e.tier,
      pod: e.pod,
      scheduled_ga_dev_date: e.scheduled_ga_dev_date,
      target_launch_date: e.target_launch_date,
      epic_retros: retrosByEpicId.get(e.id)!,
    }));

  if (epics.length === 0) {
    return {
      overall: 0,
      byTier: { TIER_1: 0, TIER_2: 0, TIER_3: 0 },
      byPod: {},
      total: 0,
      completed: 0,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate completion
  let total = 0;
  let completed = 0;
  const byTier: Record<Tier, { total: number; completed: number }> = {
    TIER_1: { total: 0, completed: 0 },
    TIER_2: { total: 0, completed: 0 },
    TIER_3: { total: 0, completed: 0 },
  };
  const byPod: Record<string, { total: number; completed: number }> = {};

  for (const epic of epics) {
    const tier = epic.tier as Tier;
    if (!tier || (tier !== 'TIER_1' && tier !== 'TIER_2' && tier !== 'TIER_3')) {
      continue;
    }

    const gaDate = getGADate(epic);
    if (!gaDate) {
      continue; // Skip epics without GA date
    }

    const gaDateObj = new Date(gaDate);
    gaDateObj.setHours(0, 0, 0, 0);

    const dueDateOffset = getRetroDueDateOffset(tier);
    const dueDate = new Date(gaDateObj);
    dueDate.setDate(dueDate.getDate() + dueDateOffset);

    // Only count epics that are past their due date (eligible)
    if (today < dueDate) {
      continue;
    }

    const retros = epic.epic_retros;
    
    // Check if retro is submitted on time
    let hasOnTimeRetro = false;
    for (const retro of retros) {
      if (retro.status === 'SUBMITTED' && retro.submitted_at) {
        const submittedAt = new Date(retro.submitted_at);
        submittedAt.setHours(0, 0, 0, 0);
        
        if (submittedAt <= dueDate) {
          hasOnTimeRetro = true;
          break;
        }
      }
    }

    total++;
    if (hasOnTimeRetro) {
      completed++;
    }

    // Count by tier
    byTier[tier].total++;
    if (hasOnTimeRetro) {
      byTier[tier].completed++;
    }

    // Count by pod
    const pod = epic.pod || 'Unknown';
    if (!byPod[pod]) {
      byPod[pod] = { total: 0, completed: 0 };
    }
    byPod[pod].total++;
    if (hasOnTimeRetro) {
      byPod[pod].completed++;
    }
  }

  // Calculate percentages
  const overall = total > 0 ? (completed / total) * 100 : 0;
  const byTierRates: Record<Tier, number> = {
    TIER_1: byTier.TIER_1.total > 0 ? (byTier.TIER_1.completed / byTier.TIER_1.total) * 100 : 0,
    TIER_2: byTier.TIER_2.total > 0 ? (byTier.TIER_2.completed / byTier.TIER_2.total) * 100 : 0,
    TIER_3: byTier.TIER_3.total > 0 ? (byTier.TIER_3.completed / byTier.TIER_3.total) * 100 : 0,
  };
  const byPodRates: Record<string, number> = {};
  for (const [pod, stats] of Object.entries(byPod)) {
    byPodRates[pod] = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
  }

  return {
    overall,
    byTier: byTierRates,
    byPod: byPodRates,
    total,
    completed,
  };
}

/**
 * Success Plan Completion rate per month (time series)
 */
export async function getSuccessPlanCompletionRateTrends(
  filters?: AnalyticsFilters,
  monthsBack: number = 6
): Promise<TimeSeriesData> {
  const months = generateMonthlyBuckets(monthsBack);
  const dataPoints: TimeSeriesDataPoint[] = [];

  for (const month of months) {
    const { start, end } = getMonthStartEnd(month);
    const monthFilters: AnalyticsFilters = {
      ...filters,
      dateRangeStart: start,
      dateRangeEnd: end,
    };
    const result = await getSuccessPlanCompletionRate(monthFilters);
    dataPoints.push({
      month,
      value: result.overall,
      total: result.total,
      completed: result.completed,
    });
  }

  return { dataPoints, metricName: 'Success Plan Completion %' };
}

/**
 * Retro Completion rate per month (time series)
 */
export async function getRetroCompletionRateTrends(
  filters?: AnalyticsFilters,
  monthsBack: number = 6
): Promise<TimeSeriesData> {
  const months = generateMonthlyBuckets(monthsBack);
  const dataPoints: TimeSeriesDataPoint[] = [];

  for (const month of months) {
    const { start, end } = getMonthStartEnd(month);
    const monthFilters: AnalyticsFilters = {
      ...filters,
      dateRangeStart: start,
      dateRangeEnd: end,
    };
    const result = await getRetroCompletionRate(monthFilters);
    dataPoints.push({
      month,
      value: result.overall,
      total: result.total,
      completed: result.completed,
    });
  }

  return { dataPoints, metricName: 'Retro Completion %' };
}

/**
 * Launch Hygiene Score (0-100)
 * 
 * Formula:
 * - Criteria completeness: 50% weight
 * - Required signoffs status: 30% weight
 * - Cross-functional acknowledgements coverage: 20% weight
 */
type HygieneStatusRow = {
  status?: string | null;
  criterion?: { label?: string | null; category?: string | null; gate?: boolean } | null;
};

function computeHygieneScoreFromStatuses(statuses: HygieneStatusRow[]): number {
  if (!statuses.length) return 0;
  const totalCriteria = statuses.length;
  const completedCriteria = statuses.filter(s => s.status && s.status !== 'NOT_SET').length;
  const completeness = totalCriteria > 0 ? completedCriteria / totalCriteria : 0;

  const signoffCriteria = statuses.filter(s => {
    const label = s.criterion?.label as string | null | undefined;
    if (!label) return false;
    return label.toLowerCase().includes('signoff') && (s.criterion?.gate ?? true);
  });
  let signoffScore = 1.0;
  if (signoffCriteria.length > 0) {
    const signoffStatuses = signoffCriteria.map(s => s.status);
    if (signoffStatuses.some(s => s === 'NO_GO')) signoffScore = 0;
    else if (signoffStatuses.some(s => s === 'CONDITIONAL' || s === 'CONDITIONAL_GO')) signoffScore = 0.2;
    else if (signoffStatuses.every(s => s === 'GO')) signoffScore = 1.0;
    else signoffScore = 0.5;
  }

  const acknowledgementCriteria = statuses.filter(s => {
    const category = s.criterion?.category as string | null | undefined;
    return category && ACKNOWLEDGEMENT_CATEGORIES.includes(category);
  });
  let acknowledgementCoverage = 1.0;
  if (acknowledgementCriteria.length > 0) {
    const acknowledged = acknowledgementCriteria.filter(s => s.status && s.status !== 'NOT_SET').length;
    acknowledgementCoverage = acknowledged / acknowledgementCriteria.length;
  }

  const hygieneScore = (completeness * 0.5 + signoffScore * 0.3 + acknowledgementCoverage * 0.2) * 100;
  return Math.round(hygieneScore * 100) / 100;
}

export async function calculateLaunchHygieneScore(epicId: string): Promise<number> {
  const supabase = getClient();
  const { data: statuses, error } = await supabase
    .from('epic_criterion_status')
    .select(`
      *,
      criterion:criterion_id (
        id,
        label,
        category,
        gate
      )
    `)
    .eq('epic_id', epicId);

  if (error) {
    console.error('Error fetching criteria for hygiene score:', error);
    throw new Error(`Failed to fetch criteria: ${error.message}`);
  }
  return computeHygieneScoreFromStatuses(statuses ?? []);
}

export interface LaunchHygieneDistribution {
  average: number;
  median: number;
  byTier: Record<Tier, { average: number; median: number; count: number }>;
  byPod: Record<string, { average: number; median: number; count: number }>;
  scores: Array<{ epicId: string; epicName: string; score: number; tier: Tier; pod: string }>;
}

/**
 * Get launch hygiene distribution across all eligible epics
 */
export async function getLaunchHygieneDistribution(
  filters?: AnalyticsFilters
): Promise<LaunchHygieneDistribution> {
  const supabase = getClient();

  // Build query for epics
  let epicQuery = supabase
    .from('epic')
    .select('id, name, tier, pod');

  // Apply filters
  if (filters?.tier) {
    epicQuery = epicQuery.eq('tier', filters.tier);
  }
  if (filters?.pod) {
    epicQuery = epicQuery.eq('pod', filters.pod);
  }
  if (filters?.dateRangeStart) {
    epicQuery = epicQuery.gte('target_launch_date', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    epicQuery = epicQuery.lte('target_launch_date', filters.dateRangeEnd);
  }

  const { data: epics, error } = await epicQuery;

  if (error) {
    console.error('Error fetching epics for hygiene distribution:', error);
    throw new Error(`Failed to fetch epics: ${error.message}`);
  }

  if (!epics || epics.length === 0) {
    return {
      average: 0,
      median: 0,
      byTier: {
        TIER_1: { average: 0, median: 0, count: 0 },
        TIER_2: { average: 0, median: 0, count: 0 },
        TIER_3: { average: 0, median: 0, count: 0 },
      },
      byPod: {},
      scores: [],
    };
  }

  const epicIds = epics.map(e => e.id);
  const { data: allStatuses, error: statusesError } = await supabase
    .from('epic_criterion_status')
    .select(`
      epic_id,
      status,
      criterion:criterion_id (
        id,
        label,
        category,
        gate
      )
    `)
    .in('epic_id', epicIds);

  const statusesByEpic = new Map<string, HygieneStatusRow[]>();
  if (!statusesError && allStatuses?.length) {
    for (const row of allStatuses) {
      const eid = (row as { epic_id: string }).epic_id;
      if (!statusesByEpic.has(eid)) statusesByEpic.set(eid, []);
      statusesByEpic.get(eid)!.push(row as HygieneStatusRow);
    }
  }

  const scores: Array<{ epicId: string; epicName: string; score: number; tier: Tier; pod: string }> = [];
  for (const epic of epics) {
    const statuses = statusesByEpic.get(epic.id) ?? [];
    const score = computeHygieneScoreFromStatuses(statuses);
    const tier = (epic.tier as Tier) || 'TIER_3';
    const pod = epic.pod || 'Unknown';
    scores.push({
      epicId: epic.id,
      epicName: epic.name || 'Unknown',
      score,
      tier,
      pod,
    });
  }

  if (scores.length === 0) {
    return {
      average: 0,
      median: 0,
      byTier: {
        TIER_1: { average: 0, median: 0, count: 0 },
        TIER_2: { average: 0, median: 0, count: 0 },
        TIER_3: { average: 0, median: 0, count: 0 },
      },
      byPod: {},
      scores: [],
    };
  }

  // Calculate overall stats
  const sortedScores = [...scores].sort((a, b) => a.score - b.score);
  const average = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  const median = sortedScores.length % 2 === 0
    ? (sortedScores[sortedScores.length / 2 - 1].score + sortedScores[sortedScores.length / 2].score) / 2
    : sortedScores[Math.floor(sortedScores.length / 2)].score;

  // Calculate by tier
  const byTier: Record<Tier, { scores: number[] }> = {
    TIER_1: { scores: [] },
    TIER_2: { scores: [] },
    TIER_3: { scores: [] },
  };

  for (const score of scores) {
    if (score.tier === 'TIER_1' || score.tier === 'TIER_2' || score.tier === 'TIER_3') {
      byTier[score.tier].scores.push(score.score);
    }
  }

  const byTierStats: Record<Tier, { average: number; median: number; count: number }> = {
    TIER_1: { average: 0, median: 0, count: 0 },
    TIER_2: { average: 0, median: 0, count: 0 },
    TIER_3: { average: 0, median: 0, count: 0 },
  };

  for (const tier of ['TIER_1', 'TIER_2', 'TIER_3'] as Tier[]) {
    const tierScores = byTier[tier].scores;
    if (tierScores.length > 0) {
      const sorted = [...tierScores].sort((a, b) => a - b);
      byTierStats[tier] = {
        average: tierScores.reduce((sum, s) => sum + s, 0) / tierScores.length,
        median: sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)],
        count: tierScores.length,
      };
    }
  }

  // Calculate by pod
  const byPod: Record<string, number[]> = {};
  for (const score of scores) {
    if (!byPod[score.pod]) {
      byPod[score.pod] = [];
    }
    byPod[score.pod].push(score.score);
  }

  const byPodStats: Record<string, { average: number; median: number; count: number }> = {};
  for (const [pod, podScores] of Object.entries(byPod)) {
    const sorted = [...podScores].sort((a, b) => a - b);
    byPodStats[pod] = {
      average: podScores.reduce((sum, s) => sum + s, 0) / podScores.length,
      median: sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)],
      count: podScores.length,
    };
  }

  return {
    average,
    median,
    byTier: byTierStats,
    byPod: byPodStats,
    scores,
  };
}

/**
 * Launch Hygiene Score average per month (time series)
 */
export async function getLaunchHygieneScoreTrends(
  filters?: AnalyticsFilters,
  monthsBack: number = 6
): Promise<TimeSeriesData> {
  const months = generateMonthlyBuckets(monthsBack);
  const dataPoints: TimeSeriesDataPoint[] = [];

  for (const month of months) {
    const { start, end } = getMonthStartEnd(month);
    const monthFilters: AnalyticsFilters = {
      ...filters,
      dateRangeStart: start,
      dateRangeEnd: end,
    };
    const result = await getLaunchHygieneDistribution(monthFilters);
    const total = result.scores.length;
    dataPoints.push({
      month,
      value: result.average,
      total,
    });
  }

  return { dataPoints, metricName: 'Launch Hygiene Score (avg)' };
}


export interface PMOwnedItem {
  epicId: string;
  itemType: 'criterion' | 'success_plan' | 'retro';
  itemId: string;
  itemName: string;
  dueDate: Date | null;
  completedDate: Date | null;
  isCompleted: boolean;
  daysFromDue: number | null;
}

export interface PMTimelinessStats {
  pmEmail: string;
  pmName: string;
  pod: string;
  index: number;
  early: number;
  onTime: number;
  late: number;
  missing: number;
  total: number;
}

async function getPMOwnedItems(epicId: string, releaseStages?: ReleaseStageRow[] | null): Promise<PMOwnedItem[]> {
  const supabase = getClient();
  const items: PMOwnedItem[] = [];
  const stages = releaseStages ?? await fetchReleaseStages();

  const { data: epic } = await supabase
    .from('epic')
    .select('id, tier, scheduled_ga_dev_date, target_launch_date, owner_id, owner_email, aha_fields')
    .eq('id', epicId)
    .single();

  if (!epic) {
    return [];
  }

  const { resolveProductManagerUserId } = await import('./successMeasurementService');
  const pmUserId = await resolveProductManagerUserId(epicId);
  if (!pmUserId) {
    return [];
  }

  const { data: pmUser } = await supabase
    .from('app_user')
    .select('id, email, roles')
    .eq('id', pmUserId)
    .single();

  if (!pmUser) {
    return [];
  }

  const isPM = (pmUser.roles as string[] || []).includes('PM');

  const { data: criteria } = await supabase
    .from('epic_criterion_status')
    .select(`
      *,
      criterion:criterion_id (
        id,
        label,
        decision_owner_role,
        rating_timing
      )
    `)
    .eq('epic_id', epicId)
    .or(`decision_owner_id.eq.${pmUserId},criterion.decision_owner_role.eq.PM`);

  if (criteria) {
    for (const status of criteria) {
      const criterion = Array.isArray(status.criterion) ? status.criterion[0] : status.criterion;
      if (!criterion) continue;

      const decisionOwnerRole = criterion.decision_owner_role as string;
      const isPMOwned = decisionOwnerRole === 'PM' || status.decision_owner_id === pmUserId;
      
      if (!isPMOwned && !isPM) continue;

      const dueDate = status.condition_due_date
        ? new Date(status.condition_due_date)
        : computeDueDateFromStages(
            epic.target_launch_date,
            criterion.rating_timing as number | null | undefined,
            stages,
            (epic as { aha_fields?: unknown }).aha_fields
          );

      const isCompleted = status.status && status.status !== 'NOT_SET';
      const completedDate = status.last_updated_at ? new Date(status.last_updated_at) : null;

      let daysFromDue: number | null = null;
      if (completedDate && dueDate) {
        const diffMs = completedDate.getTime() - dueDate.getTime();
        daysFromDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      } else if (dueDate && !isCompleted) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - due.getTime();
        daysFromDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }

      items.push({
        epicId,
        itemType: 'criterion',
        itemId: status.id,
        itemName: (criterion.label as string) || 'Unknown',
        dueDate: dueDate ? new Date(dueDate) : null,
        completedDate,
        isCompleted,
        daysFromDue,
      });
    }
  }

  const { data: successConfig } = await supabase
    .from('epic_success_configs')
    .select('locked, locked_at, post_launch_owner')
    .eq('epic_id', epicId)
    .single();

  if (successConfig && (successConfig.post_launch_owner === pmUserId || isPM)) {
    const gaDate = getGADate(epic);
    const dueDate = gaDate ? new Date(gaDate) : null;
    const isCompleted = successConfig.locked;
    const completedDate = successConfig.locked_at ? new Date(successConfig.locked_at) : null;

    let daysFromDue: number | null = null;
    if (completedDate && dueDate) {
      const diffMs = completedDate.getTime() - dueDate.getTime();
      daysFromDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    } else if (dueDate && !isCompleted) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - due.getTime();
      daysFromDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    items.push({
      epicId,
      itemType: 'success_plan',
      itemId: epicId,
      itemName: 'Success Plan',
      dueDate,
      completedDate,
      isCompleted,
      daysFromDue,
    });
  }

  const { data: retros } = await supabase
    .from('epic_retros')
    .select('id, day_marker, status, submitted_at')
    .eq('epic_id', epicId);

  if (retros && (isPM || successConfig?.post_launch_owner === pmUserId)) {
    const tier = (epic.tier as Tier) || 'TIER_3';
    const gaDate = getGADate(epic);
    
    if (gaDate) {
      const gaDateObj = new Date(gaDate);
      gaDateObj.setHours(0, 0, 0, 0);
      const dueDateOffset = getRetroDueDateOffset(tier);
      const dueDate = new Date(gaDateObj);
      dueDate.setDate(dueDate.getDate() + dueDateOffset);

      for (const retro of retros) {
        const isCompleted = retro.status === 'SUBMITTED';
        const completedDate = retro.submitted_at ? new Date(retro.submitted_at) : null;

        let daysFromDue: number | null = null;
        if (completedDate) {
          const diffMs = completedDate.getTime() - dueDate.getTime();
          daysFromDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const due = new Date(dueDate);
          due.setHours(0, 0, 0, 0);
          const diffMs = today.getTime() - due.getTime();
          daysFromDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }

        items.push({
          epicId,
          itemType: 'retro',
          itemId: retro.id,
          itemName: `Retro T+${retro.day_marker}`,
          dueDate,
          completedDate,
          isCompleted,
          daysFromDue,
        });
      }
    }
  }

  return items;
}

function categorizeTimeliness(daysFromDue: number | null, isCompleted: boolean): 'early' | 'on_time' | 'late' | 'missing' {
  if (!isCompleted) {
    return 'missing';
  }

  if (daysFromDue === null) {
    return 'missing';
  }

  if (daysFromDue < -7) {
    return 'early';
  } else if (daysFromDue <= 0) {
    return 'on_time';
  } else {
    return 'late';
  }
}

export async function calculatePMTimelinessIndex(
  pmEmail: string,
  filters?: AnalyticsFilters
): Promise<number> {
  const supabase = getClient();

  const { data: pmUser } = await supabase
    .from('app_user')
    .select('id, email, name')
    .eq('email', pmEmail.toLowerCase())
    .single();

  if (!pmUser) {
    return 0;
  }

  let epicQuery = supabase
    .from('epic')
    .select('id');

  if (filters?.tier) {
    epicQuery = epicQuery.eq('tier', filters.tier);
  }
  if (filters?.pod) {
    epicQuery = epicQuery.eq('pod', filters.pod);
  }
  if (filters?.dateRangeStart) {
    epicQuery = epicQuery.gte('target_launch_date', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    epicQuery = epicQuery.lte('target_launch_date', filters.dateRangeEnd);
  }

  const { data: epics } = await epicQuery;
  if (!epics) {
    return 0;
  }

  const releaseStages = await fetchReleaseStages();
  const allItems: PMOwnedItem[] = [];
  for (const epic of epics) {
    const items = await getPMOwnedItems(epic.id, releaseStages);
    allItems.push(...items);
  }

  if (allItems.length === 0) {
    return 0;
  }

  let early = 0;
  let onTime = 0;
  let late = 0;
  let missing = 0;

  for (const item of allItems) {
    const category = categorizeTimeliness(item.daysFromDue, item.isCompleted);
    switch (category) {
      case 'early':
        early++;
        break;
      case 'on_time':
        onTime++;
        break;
      case 'late':
        late++;
        break;
      case 'missing':
        missing++;
        break;
    }
  }

  const total = allItems.length;
  const index = ((1.0 * early + 0.8 * onTime + 0.3 * late + 0.0 * missing) / total) * 100;

  return Math.round(index * 100) / 100;
}

export async function getPMTimelinessByPM(
  filters?: AnalyticsFilters
): Promise<PMTimelinessStats[]> {
  const supabase = getClient();

  const { data: pmUsers } = await supabase
    .from('app_user')
    .select('id, email, name, roles')
    .contains('roles', ['PM']);

  if (!pmUsers || pmUsers.length === 0) {
    return [];
  }

  let epicQuery = supabase
    .from('epic')
    .select('id, pod');

  if (filters?.tier) {
    epicQuery = epicQuery.eq('tier', filters.tier);
  }
  if (filters?.pod) {
    epicQuery = epicQuery.eq('pod', filters.pod);
  }
  if (filters?.dateRangeStart) {
    epicQuery = epicQuery.gte('target_launch_date', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    epicQuery = epicQuery.lte('target_launch_date', filters.dateRangeEnd);
  }

  const { data: epics } = await epicQuery;
  if (!epics) {
    return [];
  }

  const epicMap = new Map(epics.map(e => [e.id, e]));
  const releaseStages = await fetchReleaseStages();
  const results: PMTimelinessStats[] = [];

  for (const pmUser of pmUsers) {
    const pmEmail = pmUser.email;
    const pmName = pmUser.name || pmEmail;

    const allItems: PMOwnedItem[] = [];
    const podSet = new Set<string>();

    for (const epic of epics) {
      const { resolveProductManagerUserId } = await import('./successMeasurementService');
      const epicPMUserId = await resolveProductManagerUserId(epic.id);
      
      if (epicPMUserId === pmUser.id) {
        const items = await getPMOwnedItems(epic.id, releaseStages);
        allItems.push(...items);
        const pod = epicMap.get(epic.id)?.pod || 'Unknown';
        podSet.add(pod);
      }
    }

    if (allItems.length === 0) {
      continue;
    }

    let early = 0;
    let onTime = 0;
    let late = 0;
    let missing = 0;

    for (const item of allItems) {
      const category = categorizeTimeliness(item.daysFromDue, item.isCompleted);
      switch (category) {
        case 'early':
          early++;
          break;
        case 'on_time':
          onTime++;
          break;
        case 'late':
          late++;
          break;
        case 'missing':
          missing++;
          break;
      }
    }

    const total = allItems.length;
    const index = ((1.0 * early + 0.8 * onTime + 0.3 * late + 0.0 * missing) / total) * 100;

    const pod = Array.from(podSet)[0] || 'Unknown';

    results.push({
      pmEmail,
      pmName,
      pod,
      index: Math.round(index * 100) / 100,
      early,
      onTime,
      late,
      missing,
      total,
    });
  }

  return results.sort((a, b) => b.index - a.index);
}
