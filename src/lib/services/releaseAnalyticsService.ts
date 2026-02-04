/**
 * Release Analytics Service
 * Provides analytics for releases in the weekly leadership digest
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Epic } from '@/types/epics';
import { getSettings } from '@/lib/settings-db';

/**
 * Get tier-specific readiness threshold
 */
async function getTierThreshold(tier: string): Promise<number> {
    try {
        const settings = await getSettings();
        const thresholds: Record<string, number> = {
            'TIER_1': settings.threshold_tier1 || 0.9,
            'TIER_2': settings.threshold_tier2 || 0.8,
            'TIER_3': settings.threshold_tier3 || 0.7,
        };
        return thresholds[tier] || 0.7;
    } catch {
        // Fallback to defaults
        const thresholds: Record<string, number> = {
            'TIER_1': 0.9,
            'TIER_2': 0.8,
            'TIER_3': 0.7,
        };
        return thresholds[tier] || 0.7;
    }
}

/**
 * Extract release name from epic's aha_fields
 */
export function getReleaseNameFromEpic(epic: Epic): string | null {
    if (!epic.aha_fields || typeof epic.aha_fields !== 'object') return null;
    const fields = epic.aha_fields as any;

    // Check standard fields
    if (fields.standard_fields && typeof fields.standard_fields === 'object') {
        const standardFields = fields.standard_fields;
        const releaseName = standardFields?.aha_release_name ||
            standardFields?.release?.name || null;
        if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
            return releaseName.trim();
        }
    }

    // Check custom fields
    if (fields.custom_fields && typeof fields.custom_fields === 'object') {
        const customFields = fields.custom_fields;
        const releaseName = customFields?.release_target_after_pod_planning;
        if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
            return releaseName.trim();
        }
    }

    return null;
}

/**
 * Get epics for a specific release name
 */
export async function getEpicsForRelease(
    releaseName: string,
    supabase: SupabaseClient
): Promise<Epic[]> {
    // Fetch all epics and filter in memory
    // JSONB queries are complex and this approach is more reliable
    const { data: allEpics, error } = await supabase
        .from('epic')
        .select('*')
        .eq('archived', false); // Only get non-archived epics
    
    if (error) {
        console.error(`Error fetching epics for release ${releaseName}:`, error);
        return [];
    }
    
    if (!allEpics) return [];
    
    return allEpics.filter(epic => {
        const epicReleaseName = getReleaseNameFromEpic(epic as Epic);
        return epicReleaseName === releaseName;
    });
}

/**
 * Get last N releases (past releases)
 */
export async function getLastNReleases(
    n: number,
    supabase: SupabaseClient
): Promise<Array<{ release_name: string; launch_date: string | null }>> {
    const today = new Date().toISOString().split('T')[0];

    const { data: releases, error } = await supabase
        .from('release_schedule')
        .select('release_name, launch_date')
        .lt('launch_date', today)
        .eq('archived', false)
        .order('launch_date', { ascending: false })
        .limit(n);

    if (error) {
        console.error('Error fetching last releases:', error);
        return [];
    }

    return releases || [];
}

/**
 * Get next N releases (upcoming releases)
 */
export async function getNextNReleases(
    n: number,
    supabase: SupabaseClient
): Promise<Array<{ release_name: string; launch_date: string | null }>> {
    const today = new Date().toISOString().split('T')[0];

    const { data: releases, error } = await supabase
        .from('release_schedule')
        .select('release_name, launch_date')
        .gte('launch_date', today)
        .eq('archived', false)
        .order('launch_date', { ascending: true })
        .limit(n);

    if (error) {
        console.error('Error fetching next releases:', error);
        return [];
    }

    return releases || [];
}

export interface HighRiskEpicSummary {
    name: string;
    id: string;
    tier: string | null;
    risk_level: string | null;
    readiness: number;
    target_launch_date?: string | null;
}

export interface LastReleaseAnalytics {
    release_name: string;
    launch_date: string | null;
    average_readiness: number;
    metrics_count: number;
    red_flags: {
        no_metrics: boolean;
        no_progression: boolean;
    };
    high_risk_epics: HighRiskEpicSummary[];
    best_epics: Array<{
        name: string;
        id: string;
        scorecard_status: 'ON_TRACK' | 'AT_RISK' | 'MISSED' | null;
        scorecard_date?: string;
    }>;
    worst_epics: Array<{
        name: string;
        id: string;
        scorecard_status: 'ON_TRACK' | 'AT_RISK' | 'MISSED' | null;
        scorecard_date?: string;
    }>;
    /** Epics with metrics above target; percent_of_goal is e.g. 137 for "137% of goal" */
    above_target_epics?: Array<{
        name: string;
        id: string;
        percent_of_goal: number;
    }>;
    /** Epics in this release with no success metrics configured */
    no_metrics_epics?: Array<{ name: string; id: string }>;
    /** Epics in this release that have metrics but no scorecard (no progression) */
    no_progression_epics?: Array<{ name: string; id: string }>;
}

/**
 * Get analytics for a past release
 */
export async function getLastReleaseAnalytics(
    releaseName: string,
    launchDate: string | null,
    supabase: SupabaseClient
): Promise<LastReleaseAnalytics> {
    const epics = await getEpicsForRelease(releaseName, supabase);

    if (epics.length === 0) {
        return {
            release_name: releaseName,
            launch_date: launchDate,
            average_readiness: 0,
            metrics_count: 0,
            red_flags: { no_metrics: true, no_progression: true },
            high_risk_epics: [],
            best_epics: [],
            worst_epics: [],
            above_target_epics: [],
        };
    }

    const high_risk_epics: HighRiskEpicSummary[] = epics
        .filter((e: any) => e.risk_level === 'HIGH' || e.risk_level === 'MEDIUM')
        .map((e: any) => ({
            name: e.name,
            id: e.id,
            tier: e.tier ?? null,
            risk_level: e.risk_level ?? null,
            readiness: e.readiness_score != null ? Math.round(Number(e.readiness_score) * 100) : 0,
        }));

    const epicIds = epics.map(e => e.id);

    // Metrics per epic (for no_metrics_epics) and total count
    const { data: metricsRows } = await supabase
        .from('epic_success_metrics')
        .select('epic_id')
        .in('epic_id', epicIds);
    const metricsCountByEpic = new Map<string, number>();
    for (const eid of epicIds) metricsCountByEpic.set(eid, 0);
    if (metricsRows) {
        for (const row of metricsRows) {
            metricsCountByEpic.set(row.epic_id, (metricsCountByEpic.get(row.epic_id) ?? 0) + 1);
        }
    }
    const metrics_count = Array.from(metricsCountByEpic.values()).reduce((a, b) => a + b, 0);

    // Scorecards: used for progression, best/worst, and above-target (percent of goal)
    const { data: scorecards } = await supabase
        .from('epic_scorecards')
        .select('epic_id, overall_status, snapshot_date, metric_results')
        .in('epic_id', epicIds)
        .order('snapshot_date', { ascending: false });
    const hasAnyScorecards = (scorecards?.length ?? 0) > 0;
    const red_flags = {
        no_metrics: metrics_count === 0,
        no_progression: !hasAnyScorecards,
    };

    // Calculate average readiness score
    const readinessScores = epics
        .map(e => e.readiness_score)
        .filter((score): score is number => score !== null && score !== undefined);
    const averageReadiness = readinessScores.length > 0
        ? Math.round((readinessScores.reduce((sum, score) => sum + score, 0) / readinessScores.length) * 100)
        : 0;

    // Get latest scorecard per epic (scorecards already fetched above)
    const latestScorecards = new Map<string, {
        status: 'ON_TRACK' | 'AT_RISK' | 'MISSED' | null;
        date: string;
        metric_results?: Array<{ actual?: number | boolean | null; expected?: number | null }>;
    }>();
    if (scorecards) {
        for (const sc of scorecards) {
            if (!latestScorecards.has(sc.epic_id)) {
                const results = (sc as { metric_results?: unknown }).metric_results;
                const arr = Array.isArray(results) ? results : [];
                latestScorecards.set(sc.epic_id, {
                    status: sc.overall_status as 'ON_TRACK' | 'AT_RISK' | 'MISSED' | null,
                    date: sc.snapshot_date,
                    metric_results: arr as Array<{ actual?: number | boolean | null; expected?: number | null }>,
                });
            }
        }
    }

    // Above-target epics: percent of goal > 100% from latest scorecard metric_results
    const aboveTargetEpics: Array<{ name: string; id: string; percent_of_goal: number }> = [];
    for (const epic of epics) {
        const sc = latestScorecards.get(epic.id);
        const results = sc?.metric_results;
        if (!results?.length) continue;
        let maxPercent = 0;
        for (const r of results) {
            const actual = r.actual;
            const expected = r.expected;
            if (typeof actual === 'number' && typeof expected === 'number' && expected > 0) {
                const pct = Math.round((actual / expected) * 100);
                if (pct > maxPercent) maxPercent = pct;
            }
        }
        if (maxPercent > 100) {
            aboveTargetEpics.push({
                name: epic.name,
                id: epic.id,
                percent_of_goal: maxPercent,
            });
        }
    }

    const noMetricsEpics = epics
        .filter((e) => (metricsCountByEpic.get(e.id) ?? 0) === 0)
        .map((e) => ({ name: e.name, id: e.id }));
    const noProgressionEpics = epics
        .filter((e) => (metricsCountByEpic.get(e.id) ?? 0) > 0 && !latestScorecards.has(e.id))
        .map((e) => ({ name: e.name, id: e.id }));

    // Rank epics by scorecard status
    const epicScores = epics.map(epic => {
        const scorecard = latestScorecards.get(epic.id);
        const status = scorecard?.status || null;
        
        // Ranking: ON_TRACK = 3, AT_RISK = 2, MISSED = 1, null = 0
        let rank = 0;
        if (status === 'ON_TRACK') rank = 3;
        else if (status === 'AT_RISK') rank = 2;
        else if (status === 'MISSED') rank = 1;

        return {
            epic,
            status,
            rank,
            scorecardDate: scorecard?.date,
        };
    });

    // Sort by rank (descending for best, ascending for worst)
    const sortedByBest = [...epicScores].sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;
        // If same rank, use most recent scorecard date
        if (a.scorecardDate && b.scorecardDate) {
            return new Date(b.scorecardDate).getTime() - new Date(a.scorecardDate).getTime();
        }
        return 0;
    });

    const sortedByWorst = [...epicScores].sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        // If same rank, use most recent scorecard date
        if (a.scorecardDate && b.scorecardDate) {
            return new Date(b.scorecardDate).getTime() - new Date(a.scorecardDate).getTime();
        }
        return 0;
    });

    const bestEpics = sortedByBest
        .filter(e => e.status !== null) // Only include epics with scorecards
        .slice(0, 2)
        .map(e => ({
            name: e.epic.name,
            id: e.epic.id,
            scorecard_status: e.status,
            scorecard_date: e.scorecardDate,
        }));

    const worstEpics = sortedByWorst
        .filter(e => e.status !== null) // Only include epics with scorecards
        .slice(0, 2)
        .map(e => ({
            name: e.epic.name,
            id: e.epic.id,
            scorecard_status: e.status,
            scorecard_date: e.scorecardDate,
        }));

    return {
        release_name: releaseName,
        launch_date: launchDate,
        average_readiness: averageReadiness,
        metrics_count,
        red_flags,
        high_risk_epics,
        best_epics: bestEpics,
        worst_epics: worstEpics,
        above_target_epics: aboveTargetEpics,
        no_metrics_epics: noMetricsEpics,
        no_progression_epics: noProgressionEpics,
    };
}

export type ReleaseReadinessStatus = 'Go' | 'Conditional Go' | 'No-Go' | 'Not Evaluated';

export interface NextReleaseAnalytics {
    release_name: string;
    launch_date: string | null;
    readiness_status: ReleaseReadinessStatus;
    readiness_breakdown: {
        go: number;
        conditional_go: number;
        no_go: number;
        not_evaluated: number;
    };
    total_criteria_overdue: number;
    gate_red_count: number;
    gate_yellow_count: number;
    high_risk_epics: HighRiskEpicSummary[];
    red_flags: Array<{
        epic_name: string;
        epic_id: string;
        gate_blockers: number;
        overdue_criteria: number;
        readiness_score: number;
        risk_level: string | null;
    }>;
}

/**
 * Get analytics for an upcoming release
 */
export async function getNextReleaseAnalytics(
    releaseName: string,
    launchDate: string | null,
    supabase: SupabaseClient
): Promise<NextReleaseAnalytics> {
    const epics = await getEpicsForRelease(releaseName, supabase);

    if (epics.length === 0) {
        return {
            release_name: releaseName,
            launch_date: launchDate,
            readiness_status: 'Not Evaluated',
            readiness_breakdown: {
                go: 0,
                conditional_go: 0,
                no_go: 0,
                not_evaluated: 0,
            },
            total_criteria_overdue: 0,
            gate_red_count: 0,
            gate_yellow_count: 0,
            high_risk_epics: [],
            red_flags: [],
        };
    }

    const high_risk_epics: HighRiskEpicSummary[] = epics
        .filter((e: any) => e.risk_level === 'HIGH' || e.risk_level === 'MEDIUM')
        .map((e: any) => ({
            name: e.name,
            id: e.id,
            tier: e.tier ?? null,
            risk_level: e.risk_level ?? null,
            readiness: e.readiness_score != null ? Math.round(Number(e.readiness_score) * 100) : 0,
            target_launch_date: e.target_launch_date ?? null,
        }));

    // Count readiness statuses
    const readinessBreakdown = {
        go: 0,
        conditional_go: 0,
        no_go: 0,
        not_evaluated: 0,
    };

    epics.forEach(epic => {
        const status = epic.readiness_status;
        if (status === 'GO') readinessBreakdown.go++;
        else if (status === 'CONDITIONAL_GO') readinessBreakdown.conditional_go++;
        else if (status === 'NO_GO') readinessBreakdown.no_go++;
        else readinessBreakdown.not_evaluated++;
    });

    const total = epics.length;
    const { go, conditional_go, no_go, not_evaluated } = readinessBreakdown;
    let readiness_status: ReleaseReadinessStatus = 'Not Evaluated';
    if (not_evaluated === total) {
        readiness_status = 'Not Evaluated';
    } else if (no_go > 0) {
        readiness_status = 'No-Go';
    } else if (conditional_go > 0) {
        readiness_status = 'Conditional Go';
    } else {
        readiness_status = 'Go';
    }

    // Get red flags for each epic
    const epicIds = epics.map(e => e.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch criteria statuses for all epics
    const { data: criteriaStatuses } = await supabase
        .from('epic_criterion_status')
        .select(`
            epic_id,
            status,
            condition_due_date,
            criterion:criterion_id (
                gate
            )
        `)
        .in('epic_id', epicIds);

    // Group criteria by epic
    const criteriaByEpic = new Map<string, Array<{
        status: string;
        condition_due_date: string | null;
        gate: boolean;
    }>>();

    if (criteriaStatuses) {
        for (const cs of criteriaStatuses) {
            const criterion = Array.isArray(cs.criterion) ? cs.criterion[0] : cs.criterion;
            if (!criteriaByEpic.has(cs.epic_id)) {
                criteriaByEpic.set(cs.epic_id, []);
            }
            criteriaByEpic.get(cs.epic_id)!.push({
                status: cs.status,
                condition_due_date: cs.condition_due_date,
                gate: criterion?.gate || false,
            });
        }
    }

    // Release-level: gate red/yellow counts and total criteria overdue
    let gate_red_count = 0;
    let gate_yellow_count = 0;
    let total_criteria_overdue = 0;
    for (const criteria of criteriaByEpic.values()) {
        for (const c of criteria) {
            if (c.gate) {
                if (c.status === 'NO_GO') gate_red_count++;
                else if (c.status === 'CONDITIONAL' || c.status === 'CONDITIONAL_GO') gate_yellow_count++;
            }
            if (c.condition_due_date) {
                const dueDate = new Date(c.condition_due_date);
                dueDate.setHours(0, 0, 0, 0);
                const isIncomplete = !c.status || c.status === 'NOT_SET' || c.status === 'CONDITIONAL' || c.status === 'CONDITIONAL_GO';
                if (dueDate < today && isIncomplete) total_criteria_overdue++;
            }
        }
    }

    // Calculate red flags for each epic
    const redFlagsData = await Promise.all(epics.map(async (epic) => {
        const criteria = criteriaByEpic.get(epic.id) || [];
        
        let gateBlockers = 0;
        let overdueCriteria = 0;

        for (const criterion of criteria) {
            if (criterion.gate && criterion.status === 'NO_GO') {
                gateBlockers++;
            }
            if (criterion.condition_due_date) {
                const dueDate = new Date(criterion.condition_due_date);
                dueDate.setHours(0, 0, 0, 0);
                const isIncomplete = !criterion.status || 
                    criterion.status === 'NOT_SET' || 
                    criterion.status === 'CONDITIONAL' ||
                    criterion.status === 'CONDITIONAL_GO';
                if (dueDate < today && isIncomplete) {
                    overdueCriteria++;
                }
            }
        }

        // Calculate readiness score percentage
        const readinessScore = epic.readiness_score !== null && epic.readiness_score !== undefined
            ? Math.round(epic.readiness_score * 100)
            : 0;

        // Calculate red flag score (higher = more red flags)
        // Gate blockers weighted highest (10 points each), overdue (1 point each), low readiness (if below threshold)
        let redFlagScore = gateBlockers * 10 + overdueCriteria;
        
        // Check if readiness score is below tier threshold
        if (epic.tier) {
            try {
                const threshold = await getTierThreshold(epic.tier as any);
                if (readinessScore < threshold) {
                    redFlagScore += 5; // Add penalty for low readiness
                }
            } catch (error) {
                // Ignore threshold errors
            }
        }

        return {
            epic,
            gateBlockers,
            overdueCriteria,
            readinessScore,
            redFlagScore,
        };
    }));

    // Sort by red flag score (highest first) and take top 5
    const topRedFlags = redFlagsData
        .filter(rf => rf.redFlagScore > 0) // Only include epics with red flags
        .sort((a, b) => b.redFlagScore - a.redFlagScore)
        .slice(0, 5)
        .map(rf => ({
            epic_name: rf.epic.name,
            epic_id: rf.epic.id,
            gate_blockers: rf.gateBlockers,
            overdue_criteria: rf.overdueCriteria,
            readiness_score: rf.readinessScore,
            risk_level: rf.epic.risk_level || null,
        }));

    return {
        release_name: releaseName,
        launch_date: launchDate,
        readiness_status,
        readiness_breakdown: readinessBreakdown,
        total_criteria_overdue,
        gate_red_count,
        gate_yellow_count,
        high_risk_epics,
        red_flags: topRedFlags,
    };
}
