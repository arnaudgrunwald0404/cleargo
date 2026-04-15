/**
 * Success Dashboard Service
 * Provides aggregate metrics and analytics for success measurement
 */

import { getClient } from '@/lib/db';
import { parseDateOnlyLocal } from '@/lib/date-utils';
import type { ScorecardStatus } from '@/lib/success/types';

export interface SuccessMetricsSummary {
  totalEpicsTracked: number;
  epicsByStatus: {
    onTrack: number;
    atRisk: number;
    missed: number;
  };
  retroCompletionRates: {
    t30: { completed: number; total: number; rate: number };
    t60: { completed: number; total: number; rate: number };
    t90: { completed: number; total: number; rate: number };
  };
  averageMetricPerformance: Array<{
    category: string;
    averageScore: number;
    metricCount: number;
  }>;
}

export interface EpicSuccessSummary {
  epicId: string;
  epicName: string;
  target_launch_date: string | null;
  off_schedule_release_date: string | null;
  tier: string;
  latestScorecardStatus: ScorecardStatus | null;
  latestScorecardDate: string | null;
  retroCompletion: {
    t30: boolean;
    t60: boolean;
    t90: boolean;
  };
}

export interface DashboardFilters {
  tier?: string;
  status?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
}

/**
 * Get success metrics summary with optional filters
 */
export async function getSuccessMetricsSummary(
  filters?: DashboardFilters
): Promise<SuccessMetricsSummary> {
  const supabase = getClient();

  // Build query for epics with success config
  let epicQuery = supabase
    .from('epic')
    .select(`
      id,
      epic_success_configs!inner(epic_id)
    `);

  if (filters?.tier) {
    epicQuery = epicQuery.eq('tier', filters.tier);
  }
  if (filters?.status) {
    epicQuery = epicQuery.eq('status', filters.status);
  }
  if (filters?.dateRangeStart) {
    epicQuery = epicQuery.gte('target_launch_date', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    epicQuery = epicQuery.lte('target_launch_date', filters.dateRangeEnd);
  }

  const { data: epics, error } = await epicQuery;

  if (error) {
    console.error('Error fetching epics for dashboard:', error);
    throw new Error(`Failed to fetch epics: ${error.message}`);
  }

  const epicIds = (epics || []).map(e => e.id);
  const totalEpicsTracked = epicIds.length;

  if (totalEpicsTracked === 0) {
    return {
      totalEpicsTracked: 0,
      epicsByStatus: { onTrack: 0, atRisk: 0, missed: 0 },
      retroCompletionRates: {
        t30: { completed: 0, total: 0, rate: 0 },
        t60: { completed: 0, total: 0, rate: 0 },
        t90: { completed: 0, total: 0, rate: 0 },
      },
      averageMetricPerformance: [],
    };
  }

  // Get latest scorecards for each epic
  const { data: scorecards } = await supabase
    .from('epic_scorecards')
    .select('epic_id, overall_status, snapshot_date')
    .in('epic_id', epicIds)
    .order('snapshot_date', { ascending: false });

  // Get latest scorecard per epic
  const latestScorecards = new Map<string, { status: ScorecardStatus; date: string }>();
  if (scorecards) {
    for (const sc of scorecards) {
      if (!latestScorecards.has(sc.epic_id)) {
        latestScorecards.set(sc.epic_id, {
          status: sc.overall_status as ScorecardStatus,
          date: sc.snapshot_date,
        });
      }
    }
  }

  // Count by status
  const epicsByStatus = {
    onTrack: 0,
    atRisk: 0,
    missed: 0,
  };

  for (const [epicId, scorecard] of latestScorecards) {
    switch (scorecard.status) {
      case 'ON_TRACK':
        epicsByStatus.onTrack++;
        break;
      case 'AT_RISK':
        epicsByStatus.atRisk++;
        break;
      case 'MISSED':
        epicsByStatus.missed++;
        break;
    }
  }

  // Calculate retro completion rates
  const { data: retros } = await supabase
    .from('epic_retros')
    .select('epic_id, day_marker, status')
    .in('epic_id', epicIds);

  const retroStats = {
    t30: { completed: 0, total: 0 },
    t60: { completed: 0, total: 0 },
    t90: { completed: 0, total: 0 },
  };

  // Count retros by day marker
  const epicRetroMap = new Map<string, Set<number>>();
  if (retros) {
    for (const retro of retros) {
      if (!epicRetroMap.has(retro.epic_id)) {
        epicRetroMap.set(retro.epic_id, new Set());
      }
      epicRetroMap.get(retro.epic_id)!.add(retro.day_marker);

      if (retro.status === 'SUBMITTED') {
        if (retro.day_marker === 30) retroStats.t30.completed++;
        if (retro.day_marker === 60) retroStats.t60.completed++;
        if (retro.day_marker === 90) retroStats.t90.completed++;
      }
    }
  }

  // Count total eligible epics for each retro (epics that are past the day marker)
  const today = new Date();
  for (const epic of epics || []) {
    const epicData = await supabase
      .from('epic')
      .select('target_launch_date')
      .eq('id', epic.id)
      .single();

    if (epicData.data?.target_launch_date) {
      const { parseDateOnlyLocal } = await import('@/lib/date-utils');
      const launchDate = parseDateOnlyLocal(epicData.data.target_launch_date);
      const launchMidnight = launchDate ? new Date(launchDate.getFullYear(), launchDate.getMonth(), launchDate.getDate()) : null;
      const daysSinceLaunch = launchMidnight
        ? Math.floor((today.getTime() - launchMidnight.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      if (daysSinceLaunch >= 30) retroStats.t30.total++;
      if (daysSinceLaunch >= 60) retroStats.t60.total++;
      if (daysSinceLaunch >= 90) retroStats.t90.total++;
    }
  }

  const retroCompletionRates = {
    t30: {
      ...retroStats.t30,
      rate: retroStats.t30.total > 0 ? retroStats.t30.completed / retroStats.t30.total : 0,
    },
    t60: {
      ...retroStats.t60,
      rate: retroStats.t60.total > 0 ? retroStats.t60.completed / retroStats.t60.total : 0,
    },
    t90: {
      ...retroStats.t90,
      rate: retroStats.t90.total > 0 ? retroStats.t90.completed / retroStats.t90.total : 0,
    },
  };

  // Calculate average metric performance by category
  // This is a simplified version - in production, you'd aggregate actual metric values
  const averageMetricPerformance: Array<{ category: string; averageScore: number; metricCount: number }> = [];

  return {
    totalEpicsTracked,
    epicsByStatus,
    retroCompletionRates,
    averageMetricPerformance,
  };
}

/**
 * Get list of epics with success data
 */
export async function getEpicsWithSuccessData(
  filters?: DashboardFilters,
  limit?: number
): Promise<EpicSuccessSummary[]> {
  const supabase = getClient();

  // Get all epics with success config first
  const { data: configs } = await supabase
    .from('epic_success_configs')
    .select('epic_id');

  const configuredEpicIds = (configs || []).map(c => c.epic_id);
  
  if (configuredEpicIds.length === 0) {
    return [];
  }

  // Build query with filters
  let epicQuery = supabase
    .from('epic')
    .select('id, name, target_launch_date, off_schedule_release_date, tier')
    .in('id', configuredEpicIds)
    .order('target_launch_date', { ascending: false });

  if (filters?.tier) {
    epicQuery = epicQuery.eq('tier', filters.tier);
  }
  if (filters?.status) {
    epicQuery = epicQuery.eq('status', filters.status);
  }
  if (filters?.dateRangeStart) {
    epicQuery = epicQuery.gte('target_launch_date', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    epicQuery = epicQuery.lte('target_launch_date', filters.dateRangeEnd);
  }
  if (limit) {
    epicQuery = epicQuery.limit(limit);
  }

  const { data: epics, error } = await epicQuery;

  if (error) {
    console.error('Error fetching epics:', error);
    throw new Error(`Failed to fetch epics: ${error.message}`);
  }

  if (!epics || epics.length === 0) {
    return [];
  }

  const epicIds = epics.map(e => e.id);

  // Get latest scorecards
  const { data: scorecards } = await supabase
    .from('epic_scorecards')
    .select('epic_id, overall_status, snapshot_date')
    .in('epic_id', epicIds)
    .order('snapshot_date', { ascending: false });

  // Get retros
  const { data: retros } = await supabase
    .from('epic_retros')
    .select('epic_id, day_marker, status')
    .in('epic_id', epicIds);

  // Build summary
  const latestScorecardsMap = new Map<string, { status: ScorecardStatus; date: string }>();
  if (scorecards) {
    for (const sc of scorecards) {
      if (!latestScorecardsMap.has(sc.epic_id)) {
        latestScorecardsMap.set(sc.epic_id, {
          status: sc.overall_status as ScorecardStatus,
          date: sc.snapshot_date,
        });
      }
    }
  }

  const retrosMap = new Map<string, Set<number>>();
  if (retros) {
    for (const retro of retros) {
      if (retro.status === 'SUBMITTED') {
        if (!retrosMap.has(retro.epic_id)) {
          retrosMap.set(retro.epic_id, new Set());
        }
        retrosMap.get(retro.epic_id)!.add(retro.day_marker);
      }
    }
  }

  return epics.map(epic => {
    const scorecard = latestScorecardsMap.get(epic.id);
    const epicRetros = retrosMap.get(epic.id) || new Set();

    return {
      epicId: epic.id,
      epicName: epic.name,
      target_launch_date: epic.target_launch_date,
      off_schedule_release_date: epic.off_schedule_release_date ?? null,
      tier: epic.tier,
      latestScorecardStatus: scorecard?.status || null,
      latestScorecardDate: scorecard?.date || null,
      retroCompletion: {
        t30: epicRetros.has(30),
        t60: epicRetros.has(60),
        t90: epicRetros.has(90),
      },
    };
  });
}

/**
 * Get epics needing attention (AT_RISK or MISSED)
 */
export async function getEpicsNeedingAttention(): Promise<EpicSuccessSummary[]> {
  return getEpicsWithSuccessData().then(epics =>
    epics.filter(e => e.latestScorecardStatus === 'AT_RISK' || e.latestScorecardStatus === 'MISSED')
  );
}

/**
 * Get top performing epics
 */
export async function getTopPerformingEpics(limit: number = 10): Promise<EpicSuccessSummary[]> {
  return getEpicsWithSuccessData(undefined, limit).then(epics =>
    epics.filter(e => e.latestScorecardStatus === 'ON_TRACK').slice(0, limit)
  );
}

