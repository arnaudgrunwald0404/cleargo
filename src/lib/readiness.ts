import { createClient } from '@/lib/supabase/server';
import { Epic, EpicStatus } from '@/types/epics';
import { sendSlackNotification } from '@/lib/slack/notifications';
import { SlackNotificationPayload } from '@/types/slack';
import { sendEmailNotification } from '@/lib/email/notifications';

export async function recomputeEpicReadiness(epicId: string) {
    const supabase = createClient();

    // 1. Fetch epic data and criteria statuses
    // TODO: After migration 0018 is applied, change back to 'epic' table
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
                gate,
                tier_applicability
            )
        `)
        .eq('epic_id', epicId);

    if (statusError) throw statusError;
    if (!statuses || statuses.length === 0) {
        // No applicable criteria → mark as not evaluated to avoid misleading GO/100%
        // TODO: After migration 0018 is applied, change back to 'epic' table
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

    // 2. Compute Score
    // Score = (Sum of GO + CONDITIONAL) / Total Applicable Criteria (excluding Gates?)
    // Plan says: "Exclude gate criteria from score denominator."
    // Scoring: GO=2, CONDITIONAL=1, NO_GO=0.
    // Wait, usually score is % of completed items.
    // Plan says: "Scoring: GO=2, CONDITIONAL=1, NO_GO=0, NOT_SET=null. Exclude NOT_SET. Exclude gate criteria from score denominator."
    // Let's stick to the plan.
    // Actually, if we exclude NOT_SET, the score might be misleading early on.
    // But let's follow the plan.

    let totalScore = 0;
    let maxPossibleScore = 0;
    let gateNoGoCount = 0;
    let unresolvedConditionsCount = 0;

    // Helper to determine applicability by tier
    const applies = (app: 'ALL'|'TIER_1_ONLY'|'TIER_1_AND_2', tier: 'TIER_1'|'TIER_2'|'TIER_3') =>
        app === 'ALL' ||
        (app === 'TIER_1_ONLY' && tier === 'TIER_1') ||
        (app === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2'));

    for (const s of statuses) {
        // Skip non-applicable criteria entirely for scoring/verdict
        const tier = (epic?.tier as any) || 'TIER_3';
        const applicability = s.criterion?.tier_applicability as any;
        if (applicability && !applies(applicability, tier)) {
            continue;
        }

        const isGate = s.criterion?.gate;

        // Verdict checks
        if (isGate && s.status === 'NO_GO') {
            gateNoGoCount++;
        }
        if (isGate && s.status === 'CONDITIONAL' && !s.condition_due_date) {
            // "unresolved pre-launch conditions on gates" -> maybe check if condition is met?
            // For now, let's count conditionals.
            unresolvedConditionsCount++;
        }

        // Scoring (exclude gates)
        if (!isGate) {
            if (s.status === 'GO') {
                totalScore += 2;
                maxPossibleScore += 2;
            } else if (s.status === 'CONDITIONAL') {
                totalScore += 1;
                maxPossibleScore += 2;
            } else if (s.status === 'NO_GO') {
                totalScore += 0;
                maxPossibleScore += 2;
            }
            // NOT_SET is excluded from denominator
        }
    }

    const readinessScore = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;

    // If no applicable criteria contributed to the score and no gate violations/conditions, mark as NOT_EVALUATED
    if (maxPossibleScore === 0 && gateNoGoCount === 0 && unresolvedConditionsCount === 0) {
        await supabase
            .from('epic')
            .update({
                readiness_score: null,
                readiness_status: 'NOT_EVALUATED',
                risk_level: epic?.risk_level || 'LOW',
                updated_at: new Date().toISOString()
            })
            .eq('id', epicId);
        return;
    }

    // 3. Compute Verdict (Readiness Status)
    // "any gate NO_GO → NO_GO; else unresolved pre-launch conditions on gates → CONDITIONAL; else tier thresholds..."
    let readinessStatus = 'NOT_EVALUATED';

    if (gateNoGoCount > 0) {
        readinessStatus = 'NO_GO';
    } else {
        // Check thresholds (mocked for now, should come from settings)
        // T1: 0.9, T2: 0.8, T3: 0.7
        // We need to know the epic tier.
        const tier = epic?.tier || 'TIER_3';

        // TODO: Fetch from app_settings
        const thresholds: Record<string, number> = { 'TIER_1': 0.9, 'TIER_2': 0.8, 'TIER_3': 0.7 };
        const threshold = thresholds[tier] || 0.7;

        if (readinessScore >= threshold) {
            readinessStatus = 'GO';
        } else if (readinessScore > 0.5) { // Arbitrary "close enough" for Conditional?
            readinessStatus = 'CONDITIONAL_GO';
        } else {
            readinessStatus = 'NO_GO';
        }
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
    // TODO: After migration 0018 is applied, change back to 'epic' table
    await supabase
        .from('epic')
        .update({
            readiness_score: readinessScore,
            readiness_status: readinessStatus,
            risk_level: riskLevel,
            updated_at: new Date().toISOString()
        })
        .eq('id', epicId);

    // 6. Send Notifications if changed
    if (epic.readiness_status && epic.readiness_status !== readinessStatus) {
        const metadata = {
            epicName: epic.name,
            oldStatus: epic.readiness_status,
            newStatus: readinessStatus,
            epicUrl: epic.console_url || `http://localhost:3000/epics/${epic.id}`
        };

        await sendSlackNotification({
            type: 'launch_status_change',
            priority: 'high',
            launch_id: epic.id,
            metadata
        }).catch(console.error);

        if (epic.owner_email) {
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

        await sendSlackNotification({
            type: 'launch_risk_alert',
            priority: 'high',
            launch_id: epic.id,
            metadata
        }).catch(console.error);

        if (epic.owner_email) {
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
