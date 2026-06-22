import { createClient } from '@/lib/supabase/server';
import { parseDateOnlyLocal } from '@/lib/date-utils';
import { Epic, EpicStatus } from '@/types/epics';
import { sendSlackNotification } from '@/lib/slack/notifications';
import { SlackNotificationPayload } from '@/types/slack';
import { sendEmailNotification } from '@/lib/email/notifications';
import {
    computeLaunchReadiness,
    isSignoffCriterion,
    normalizeStatus,
    type CriterionInput
} from '@/lib/readiness-scoring';
import { createGtmAccessPhaseResolver, type GtmPhaseEpic } from '@/lib/gtm-phase';

export async function recomputeEpicReadiness(epicId: string, excludeUserId?: string) {
    const supabase = createClient();

    // 1. Fetch epic data and criteria statuses
    const { data: epic, error: epicError } = await supabase
        .from('epic')
        .select('id, name, tier, target_launch_date, readiness_status, risk_level, console_url, owner_email, aha_fields, gtm_access_confirmed, actual_gtm_access_date')
        .eq('id', epicId)
        .single();

    // ... (rest of function)



    // 7. Trigger Aha! Write-back
    // ...

    if (epicError) throw epicError;

    const { data: statuses, error: statusError } = await supabase
        .from('epic_criterion_status')
        .select(`
            *,
            criterion:criterion_id (
                id,
                label,
                category,
                gate,
                tier_applicability
            )
        `)
        .eq('epic_id', epicId);

    if (statusError) throw statusError;
    if (!statuses || statuses.length === 0) {
        // No applicable criteria → mark as not evaluated to avoid misleading GO/100%
        const { error: noCriteriaError } = await supabase
            .from('epic')
            .update({
                readiness_score: null,
                readiness_status: 'NOT_EVALUATED',
                // Preserve risk_level if present; default to LOW
                risk_level: epic?.risk_level || 'LOW',
                updated_at: new Date().toISOString()
            })
            .eq('id', epicId);
        
        if (noCriteriaError) {
            console.error(`[recomputeEpicReadiness] Failed to update epic ${epicId} (no criteria):`, noCriteriaError);
            throw new Error(`Failed to update epic readiness: ${noCriteriaError.message}`);
        }
        return;
    }

    // Helper to determine applicability by tier
    const applies = (app: string, tier: 'TIER_1'|'TIER_2'|'TIER_3') =>
        app === 'ALL' ||
        (app === 'TIER_1_ONLY' && tier === 'TIER_1') ||
        (app === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2')) ||
        (app === 'TIER_2_ONLY' && tier === 'TIER_2') ||
        (app === 'TIER_3_ONLY' && tier === 'TIER_3');

    const tier = (epic?.tier as any) || 'TIER_3';

    // Convert statuses to CriterionInput format for new scoring algorithm
    const criteriaInputs: CriterionInput[] = [];
    
    for (const s of statuses) {
        // Skip non-applicable criteria entirely for scoring/verdict
        const applicability = s.criterion?.tier_applicability as any;
        if (applicability && !applies(applicability, tier)) {
            continue;
        }

        const criterion = s.criterion;
        if (!criterion) continue;

        const label = criterion.label as string | null | undefined;
        const category = criterion.category as string | null | undefined;
        const isGate = criterion.gate as boolean | null | undefined;

        criteriaInputs.push({
            id: s.id || criterion.id,
            categoryId: category || 'OTHER',
            isSignoff: isSignoffCriterion(label),
            status: normalizeStatus(s.status),
            isGating: isGate || false,
            weight: 1, // Default weight, can be customized later
        });
    }

    // From "GTM Access and Prep" onward, an unvoted gate is a hard no-go; before it,
    // an unvoted gate only forces an AT_RISK ceiling.
    const phaseResolver = await createGtmAccessPhaseResolver(supabase);
    const enforceUnvotedGatesAsNoGo = phaseResolver(epic as unknown as GtmPhaseEpic);

    // Use new scoring algorithm
    const scoringResult = computeLaunchReadiness(criteriaInputs, { enforceUnvotedGatesAsNoGo });

    const readinessScore = scoringResult.readiness;
    
    // Log calculation details for debugging
    console.log(`[recomputeEpicReadiness] Calculated readiness for epic ${epicId}:`, {
        score: readinessScore,
        scorePercent: Math.round(readinessScore * 100),
        verdict: scoringResult.verdict,
        categoryCount: scoringResult.categoryScores.length,
        criteriaCount: criteriaInputs.length
    });
    
    let readinessStatus: string;

    // Map verdict to database status format
    switch (scoringResult.verdict) {
        case 'GO':
            readinessStatus = 'GO';
            break;
        case 'CONDITIONAL_GO':
            readinessStatus = 'CONDITIONAL_GO';
            break;
        case 'NO_GO_BLOCKED_BY_GATING':
            readinessStatus = 'NO_GO';
            break;
        case 'AT_RISK':
            readinessStatus = 'NO_GO'; // Map AT_RISK to NO_GO (readiness < 70%)
            break;
        case 'NOT_EVALUATED':
        default:
            readinessStatus = 'NOT_EVALUATED';
            break;
    }

    // 4. Compute Risk
    // "HIGH if close to launch and below thresholds or gates not GO"
    let riskLevel = 'LOW';
    if (epic?.target_launch_date) {
        const { parseDateOnlyLocal } = await import('@/lib/date-utils');
        const launch = parseDateOnlyLocal(epic.target_launch_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysToLaunch = launch
            ? Math.ceil((launch.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

        if (daysToLaunch < 14) {
            if (readinessStatus === 'NO_GO' || readinessStatus === 'CONDITIONAL_GO') {
                riskLevel = 'HIGH';
            } else if (readinessScore < 0.95) { // Even if GO, if it's tight
                riskLevel = 'MEDIUM';
            }
        } else if (daysToLaunch < 30) {
            if (readinessStatus === 'NO_GO') riskLevel = 'MEDIUM';
        }
    }

    // 5. Update Epic with retry logic for transient failures
    const maxRetries = 3;
    let updatedEpic: any = null;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const { data, error: updateError } = await supabase
            .from('epic')
            .update({
                readiness_score: readinessScore,
                readiness_status: readinessStatus,
                risk_level: riskLevel,
                updated_at: new Date().toISOString()
            })
            .eq('id', epicId)
            .select('readiness_score, readiness_status, risk_level')
            .single();

        if (updateError) {
            lastError = updateError;
            console.error(`[recomputeEpicReadiness] Update attempt ${attempt}/${maxRetries} failed for epic ${epicId}:`, updateError);
            
            // Retry on transient errors (network issues, connection timeouts)
            if (attempt < maxRetries && (
                updateError.message?.includes('timeout') ||
                updateError.message?.includes('network') ||
                updateError.code === 'PGRST116' // PostgREST connection error
            )) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                continue;
            }
            
            // Non-retryable error or max retries reached
            throw new Error(`Failed to update epic readiness after ${attempt} attempt(s): ${updateError.message}`);
        }

        if (!data) {
            lastError = new Error('Update returned no data');
            console.error(`[recomputeEpicReadiness] Update attempt ${attempt}/${maxRetries} returned no data for epic ${epicId}`);
            
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                continue;
            }
            
            throw new Error(`Failed to update epic readiness: Update returned no data after ${attempt} attempt(s)`);
        }

        updatedEpic = data;
        break; // Success
    }

    if (!updatedEpic) {
        throw lastError || new Error(`Failed to update epic readiness: Unknown error`);
    }

    // Validate the stored score matches what we calculated (within rounding tolerance)
    const storedScore = updatedEpic.readiness_score;
    const scoreDiff = Math.abs((storedScore ?? 0) - readinessScore);
    if (scoreDiff > 0.001) {
        console.error(`[recomputeEpicReadiness] ⚠️ Score mismatch detected for epic ${epicId}:`, {
            calculated: readinessScore,
            calculatedPercent: Math.round(readinessScore * 100),
            stored: storedScore,
            storedPercent: storedScore !== null && storedScore !== undefined ? Math.round(storedScore * 100) : null,
            difference: scoreDiff,
            differencePercent: Math.round(scoreDiff * 100)
        });
        // Don't throw - the update succeeded, but log the discrepancy for investigation
        // This indicates a potential bug or race condition
    } else {
        console.log(`[recomputeEpicReadiness] ✅ Successfully updated epic ${epicId}:`, {
            score: readinessScore,
            scorePercent: Math.round(readinessScore * 100),
            status: readinessStatus,
            riskLevel: riskLevel
        });
    }

    // Helper function to get epic owner recipient (if not excluded)
    const getOwnerRecipient = async (ownerEmail: string | null | undefined) => {
        if (!ownerEmail) return undefined;
        
        const { syncUserSlackHandle } = await import('@/lib/slack/notifications');
        await syncUserSlackHandle(ownerEmail).catch(console.error);
        
        const { data: ownerUser } = await supabase
            .from('app_user')
            .select('id, email, slack_handle, first_name, last_name, name')
            .eq('email', ownerEmail)
            .single();

        if (!ownerUser || ownerUser.id === excludeUserId) {
            return undefined;
        }

        return {
            id: ownerUser.id,
            email: ownerUser.email,
            slack_handle: ownerUser.slack_handle || undefined,
            name: ownerUser.name || 
                (ownerUser.first_name && ownerUser.last_name ? `${ownerUser.first_name} ${ownerUser.last_name}` : 
                 ownerUser.first_name || ownerUser.last_name || ownerUser.email),
        };
    };

    // 6. Send Notifications if changed
    if (epic.readiness_status && epic.readiness_status !== readinessStatus) {
        const metadata = {
            epicName: epic.name,
            oldStatus: epic.readiness_status,
            newStatus: readinessStatus,
            epicUrl: epic.console_url || `http://localhost:3000/epics/${epic.id}`
        };

        const ownerRecipient = await getOwnerRecipient(epic.owner_email);

        // Send Slack notification to epic owner (if not the person who made the change)
        if (ownerRecipient) {
            await sendSlackNotification({
                type: 'launch_status_change',
                priority: 'high',
                recipient: ownerRecipient,
                launch_id: epic.id,
                metadata
            }).catch(console.error);
        }

        // Send email notification to epic owner (only if they're not the person who made the change)
        if (epic.owner_email && ownerRecipient) {
            await sendEmailNotification({
                type: 'launch_status_change',
                recipientEmail: epic.owner_email,
                metadata,
                userId: ownerRecipient.id,
                epicId: epic.id,
            });
        }
    }

    if (epic.risk_level && epic.risk_level !== riskLevel && (riskLevel === 'HIGH' || riskLevel === 'MEDIUM')) {
        const metadata = {
            epicName: epic.name,
            riskLevel: riskLevel,
            epicUrl: epic.console_url || `http://localhost:3000/epics/${epic.id}`,
            reason: "Readiness score dropped or launch date approaching with unresolved items."
        };

        const ownerRecipient = await getOwnerRecipient(epic.owner_email);

        // Send Slack notification to epic owner (if not the person who made the change)
        if (ownerRecipient) {
            await sendSlackNotification({
                type: 'launch_risk_alert',
                priority: 'high',
                recipient: ownerRecipient,
                launch_id: epic.id,
                metadata
            }).catch(console.error);
        }

        // Send email notification to epic owner (only if they're not the person who made the change)
        if (epic.owner_email && ownerRecipient) {
            await sendEmailNotification({
                type: 'launch_risk_alert',
                recipientEmail: epic.owner_email,
                metadata,
                userId: ownerRecipient.id,
                epicId: epic.id,
            });
        }
    }

    // 7. Trigger Aha! Write-back
    try {
        const { writeBackEpicReadiness } = await import('@/lib/aha/write-back');
        await writeBackEpicReadiness(epicId);
    } catch (error) {
        console.error('Failed to trigger Aha! write-back:', error);
    }
}
