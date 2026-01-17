import { createClient } from '@/lib/supabase/server';
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

export async function recomputeEpicReadiness(epicId: string, excludeUserId?: string) {
    const supabase = createClient();

    // 1. Fetch epic data and criteria statuses
    const { data: epic, error: epicError } = await supabase
        .from('epic')
        .select('id, name, tier, target_launch_date, readiness_status, risk_level, console_url, owner_email')
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
        await supabase
            .from('epic')
            .update({
                readiness_score: null,
                readiness_status: 'NOT_EVALUATED',
                // Preserve risk_level if present; default to LOW
                risk_level: epic?.risk_level || 'LOW',
                updated_at: new Date().toISOString()
            })
            .eq('id', epicId);
        return;
    }

    // Helper to determine applicability by tier
    const applies = (app: 'ALL'|'TIER_1_ONLY'|'TIER_1_AND_2', tier: 'TIER_1'|'TIER_2'|'TIER_3') =>
        app === 'ALL' ||
        (app === 'TIER_1_ONLY' && tier === 'TIER_1') ||
        (app === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2'));

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

    // Use new scoring algorithm
    const scoringResult = computeLaunchReadiness(criteriaInputs);

    const readinessScore = scoringResult.readiness;
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
        const daysToLaunch = Math.ceil((new Date(epic.target_launch_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

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

    // 5. Update Epic
    await supabase
        .from('epic')
        .update({
            readiness_score: readinessScore,
            readiness_status: readinessStatus,
            risk_level: riskLevel,
            updated_at: new Date().toISOString()
        })
        .eq('id', epicId);

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
                metadata
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
                metadata
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
