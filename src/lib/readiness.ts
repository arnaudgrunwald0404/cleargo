import { createClient } from '@/lib/supabase/server';
import { Launch, LaunchStatus } from '@/types/launches';
import { sendSlackNotification } from '@/lib/slack/notifications';
import { SlackNotificationPayload } from '@/types/slack';
import { sendEmailNotification } from '@/lib/email/notifications';

export async function recomputeLaunchReadiness(launchId: string) {
    const supabase = createClient();

    // 1. Fetch launch data and criteria statuses
    const { data: launch, error: launchError } = await supabase
        .from('launch')
        .select('id, name, tier, target_launch_date, readiness_status, risk_level, console_url, owner_email')
        .eq('id', launchId)
        .single();

    // ... (rest of function)



    // 7. Trigger Aha! Write-back
    // ...

    if (launchError) throw launchError;

    const { data: statuses, error: statusError } = await supabase
        .from('launch_criterion_status')
        .select(`
            *,
            criterion:criterion_id (
                gate,
                tier_applicability,
                weight
            )
        `)
        .eq('launch_id', launchId);

    if (statusError) throw statusError;
    if (!statuses || statuses.length === 0) return;

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

    for (const s of statuses) {
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

    // 3. Compute Verdict (Readiness Status)
    // "any gate NO_GO → NO_GO; else unresolved pre-launch conditions on gates → CONDITIONAL; else tier thresholds..."
    let readinessStatus = 'NOT_EVALUATED';

    if (gateNoGoCount > 0) {
        readinessStatus = 'NO_GO';
    } else {
        // Check thresholds (mocked for now, should come from settings)
        // T1: 0.9, T2: 0.8, T3: 0.7
        // We need to know the launch tier.
        const tier = launch?.tier || 'TIER_3';

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
    if (launch?.target_launch_date) {
        const daysToLaunch = Math.ceil((new Date(launch.target_launch_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

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

    // 5. Update Launch
    await supabase
        .from('launch')
        .update({
            readiness_score: readinessScore,
            readiness_status: readinessStatus,
            risk_level: riskLevel,
            updated_at: new Date().toISOString()
        })
        .eq('id', launchId);

    // 6. Send Notifications if changed
    if (launch.readiness_status && launch.readiness_status !== readinessStatus) {
        const metadata = {
            launchName: launch.name,
            oldStatus: launch.readiness_status,
            newStatus: readinessStatus,
            launchUrl: launch.console_url || `http://localhost:3000/launches/${launch.id}`
        };

        await sendSlackNotification({
            type: 'launch_status_change',
            priority: 'high',
            launch_id: launch.id,
            metadata
        }).catch(console.error);

        if (launch.owner_email) {
            await sendEmailNotification({
                type: 'launch_status_change',
                recipientEmail: launch.owner_email,
                metadata
            });
        }
    }

    if (launch.risk_level && launch.risk_level !== riskLevel && (riskLevel === 'HIGH' || riskLevel === 'MEDIUM')) {
        const metadata = {
            launchName: launch.name,
            riskLevel: riskLevel,
            launchUrl: launch.console_url || `http://localhost:3000/launches/${launch.id}`,
            reason: "Readiness score dropped or launch date approaching with unresolved items."
        };

        await sendSlackNotification({
            type: 'launch_risk_alert',
            priority: 'high',
            launch_id: launch.id,
            metadata
        }).catch(console.error);

        if (launch.owner_email) {
            await sendEmailNotification({
                type: 'launch_risk_alert',
                recipientEmail: launch.owner_email,
                metadata
            });
        }
    }

    // 7. Trigger Aha! Write-back
    try {
        const { writeBackLaunchReadiness } = await import('@/lib/aha/write-back');
        await writeBackLaunchReadiness(launchId);
    } catch (error) {
        console.error('Failed to trigger Aha! write-back:', error);
    }
}
