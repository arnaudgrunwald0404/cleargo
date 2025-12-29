/**
 * High-risk epic identification algorithm
 * Identifies epics that are at high risk based on multiple factors
 * 
 * This module is server-only and should only be imported in API routes or server components
 */

import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings-db';

export interface RiskFactors {
    daysToLaunch: number | null;
    readinessScore: number | null;
    readinessStatus: string | null;
    tier: string;
    hasGateBlockers: boolean;
    overdueCriteriaCount: number;
    totalCriteriaCount: number;
    riskLevel: string | null;
}

export interface HighRiskEpic {
    id: string;
    name: string;
    tier: string;
    target_launch_date: string | null;
    readiness_score: number | null;
    readiness_status: string | null;
    risk_level: string | null;
    riskScore: number; // Calculated risk score (0-100)
    riskFactors: RiskFactors;
    riskReasons: string[]; // Human-readable reasons why it's high risk
}

/**
 * Calculate days until launch date
 */
function calculateDaysToLaunch(targetDate: string | null): number | null {
    if (!targetDate) return null;
    const launchDate = new Date(targetDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    launchDate.setHours(0, 0, 0, 0);
    const diffTime = launchDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

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
 * Assess risk factors for a single epic
 */
export async function assessEpicRisk(epic: any): Promise<RiskFactors & { riskScore: number; riskReasons: string[] }> {
    const daysToLaunch = calculateDaysToLaunch(epic.target_launch_date);
    const readinessScore = epic.readiness_score;
    const readinessStatus = epic.readiness_status;
    const tier = epic.tier || 'TIER_3';
    const riskLevel = epic.risk_level || 'LOW';

    // Fetch criteria statuses to check for gate blockers and overdue items
    const supabase = createClient();
    const { data: criteriaStatuses } = await supabase
        .from('epic_criterion_status')
        .select(`
            *,
            criterion:criterion_id (
                gate,
                rating_timing
            )
        `)
        .eq('epic_id', epic.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let hasGateBlockers = false;
    let overdueCriteriaCount = 0;
    let totalCriteriaCount = criteriaStatuses?.length || 0;

    // Check for gate blockers and overdue criteria
    if (criteriaStatuses) {
        for (const status of criteriaStatuses) {
            const criterion = status.criterion;
            
            // Check for gate blockers (gate criteria with NO_GO status)
            if (criterion?.gate && status.status === 'NO_GO') {
                hasGateBlockers = true;
            }

            // Check for overdue criteria
            if (status.condition_due_date) {
                const dueDate = new Date(status.condition_due_date);
                dueDate.setHours(0, 0, 0, 0);
                
                // Criteria is overdue if due date has passed and status is incomplete
                const isIncomplete = !status.status || 
                    status.status === 'NOT_SET' || 
                    status.status === 'CONDITIONAL';
                
                if (dueDate < today && isIncomplete) {
                    overdueCriteriaCount++;
                }
            }
        }
    }

    const threshold = await getTierThreshold(tier);

    // Calculate risk score (0-100, higher = more risky)
    let riskScore = 0;
    const riskReasons: string[] = [];

    // Factor 1: Days to launch (0-40 points)
    if (daysToLaunch !== null) {
        if (daysToLaunch < 0) {
            // Already past launch date
            riskScore += 40;
            riskReasons.push('Launch date has passed');
        } else if (daysToLaunch <= 7) {
            riskScore += 40;
            riskReasons.push(`Launching in ${daysToLaunch} day${daysToLaunch !== 1 ? 's' : ''}`);
        } else if (daysToLaunch <= 14) {
            riskScore += 30;
            riskReasons.push(`Launching in ${daysToLaunch} days`);
        } else if (daysToLaunch <= 30) {
            riskScore += 20;
            riskReasons.push(`Launching in ${daysToLaunch} days`);
        } else if (daysToLaunch <= 60) {
            riskScore += 10;
        }
    }

    // Factor 2: Readiness status (0-30 points)
    if (readinessStatus === 'NO_GO') {
        riskScore += 30;
        riskReasons.push('Readiness status is NO_GO');
    } else if (readinessStatus === 'CONDITIONAL_GO' || readinessStatus === 'CONDITIONAL') {
        riskScore += 20;
        riskReasons.push('Readiness status is CONDITIONAL');
    } else if (readinessStatus === 'NOT_EVALUATED') {
        riskScore += 15;
        riskReasons.push('Readiness not yet evaluated');
    }

    // Factor 3: Readiness score vs threshold (0-20 points)
    if (readinessScore !== null && readinessScore !== undefined) {
        if (readinessScore < threshold) {
            const gap = threshold - readinessScore;
            riskScore += Math.min(20, Math.round(gap * 40)); // Up to 20 points based on gap
            riskReasons.push(`Readiness score (${Math.round(readinessScore * 100)}%) below threshold (${Math.round(threshold * 100)}%)`);
        }
    } else if (daysToLaunch !== null && daysToLaunch <= 30) {
        // Missing readiness score when close to launch
        riskScore += 15;
        riskReasons.push('Readiness score not available');
    }

    // Factor 4: Gate blockers (0-30 points)
    if (hasGateBlockers) {
        riskScore += 30;
        riskReasons.push('Has gate criteria with NO_GO status');
    }

    // Factor 5: Overdue criteria (0-20 points, max 20)
    if (overdueCriteriaCount > 0) {
        const overdueScore = Math.min(20, overdueCriteriaCount * 5);
        riskScore += overdueScore;
        riskReasons.push(`${overdueCriteriaCount} overdue criteria`);
    }

    // Factor 6: Existing risk_level field (0-10 points)
    if (riskLevel === 'HIGH') {
        riskScore += 10;
    } else if (riskLevel === 'MEDIUM') {
        riskScore += 5;
    }

    // Cap risk score at 100
    riskScore = Math.min(100, riskScore);

    return {
        daysToLaunch,
        readinessScore,
        readinessStatus,
        tier,
        hasGateBlockers,
        overdueCriteriaCount,
        totalCriteriaCount,
        riskLevel,
        riskScore,
        riskReasons,
    };
}

/**
 * Identify high-risk epics from a list
 * Returns epics with risk score >= 50
 */
export async function identifyHighRiskEpics(epics: any[]): Promise<HighRiskEpic[]> {
    const riskAssessments = await Promise.all(
        epics.map(async (epic) => {
            const assessment = await assessEpicRisk(epic);
            return {
                ...epic,
                riskScore: assessment.riskScore,
                riskFactors: {
                    daysToLaunch: assessment.daysToLaunch,
                    readinessScore: assessment.readinessScore,
                    readinessStatus: assessment.readinessStatus,
                    tier: assessment.tier,
                    hasGateBlockers: assessment.hasGateBlockers,
                    overdueCriteriaCount: assessment.overdueCriteriaCount,
                    totalCriteriaCount: assessment.totalCriteriaCount,
                    riskLevel: assessment.riskLevel,
                },
                riskReasons: assessment.riskReasons,
            };
        })
    );

    // Filter to high-risk epics (risk score >= 50)
    return riskAssessments
        .filter((epic) => epic.riskScore >= 50)
        .sort((a, b) => b.riskScore - a.riskScore); // Sort by risk score descending
}

