/**
 * The review half of the loop: ask, approve, send back.
 *
 * Approving is the consequential action — it promotes to v1.0, marks the
 * readiness criterion DONE, records a sign-off on gate criteria, and releases
 * the next artifact. Requesting changes is cheap and reversible, which is why
 * the two carry different capabilities.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getSlackClient } from '@/lib/slack/client';
import type { SlackBlock } from '@/types/slack';
import { getArtifactDefinition } from './registry';
import { buildArtifactReviewMessage, type ArtifactReviewTarget } from '@/lib/slack/templates/artifact-review';
import { ARTIFACT_LABEL, type ArtifactStatus, type ArtifactType, type LaunchArtifact } from '@/types/artifacts';

type Supabase = ReturnType<typeof createAdminClient>;

function appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://launch-console.clearcompany.com';
}

/**
 * DM the owner that a draft is waiting.
 *
 * Person-triggered rather than scheduled, so deliberately NOT gated by the
 * business calendar — the same rule the notification layer already applies to
 * assignments and comments.
 */
export async function requestArtifactReview(
    artifactId: string,
    supabase: Supabase = createAdminClient()
): Promise<{ sent: boolean; reason?: string }> {
    const { data, error } = await supabase
        .from('launch_artifact')
        .select('*, launch:launch(id, name)')
        .eq('id', artifactId)
        .single();

    if (error || !data) return { sent: false, reason: 'Artifact not found' };

    const artifact = data as unknown as LaunchArtifact & { launch?: { id: string; name: string } | null };
    const def = getArtifactDefinition(artifact.artifact_type);

    if (!artifact.owner_email) {
        return { sent: false, reason: `${def.label} has no owner to ask` };
    }

    // The questions are the point of the review, so load them first.
    const { data: flagRows } = await supabase
        .from('launch_artifact_flag')
        .select('question, claim')
        .eq('launch_artifact_id', artifactId)
        .in('status', ['open', 'asked'])
        .order('created_at', { ascending: true });

    const flags = (flagRows ?? []) as Array<{ question: string | null; claim: string }>;

    const target: ArtifactReviewTarget = {
        artifactId: artifact.id,
        launchId: artifact.launch_id,
        launchName: artifact.launch?.name ?? 'Launch',
        artifactType: artifact.artifact_type,
        docUrl: artifact.doc_url,
        appUrl: appUrl(),
    };

    const confidence = (artifact.ai_draft as Record<string, unknown> | null)?.overall_confidence;

    const { text, blocks } = buildArtifactReviewMessage(target, {
        openQuestions: flags.length,
        topFlags: flags.map((f) => f.question || f.claim),
        confidence: typeof confidence === 'string' ? confidence : null,
        reviewAsk: def.reviewAsk,
        warnings: artifact.doc_url ? [] : ['No document yet — review the draft in ClearGO.'],
    });

    try {
        const client = getSlackClient();
        // users.lookupByEmail wraps the person in a `user` object.
        const lookup = await client.getUserByEmail(artifact.owner_email);
        const slackUserId = lookup?.user?.id;
        if (!slackUserId) {
            return { sent: false, reason: `No Slack user for ${artifact.owner_email}` };
        }
        const channel = await client.openConversation(slackUserId);
        if (!channel) return { sent: false, reason: 'Could not open a DM' };

        await client.postMessage({ channel, text, blocks: blocks as SlackBlock[] });
        return { sent: true };
    } catch (err) {
        // A failed DM must not undo a good draft — the artifact is still
        // PENDING_REVIEW and visible in the app.
        return { sent: false, reason: err instanceof Error ? err.message : String(err) };
    }
}

export interface ApproveResult {
    artifact: LaunchArtifact;
    criterionMarkedDone: boolean;
    signoffRecorded: boolean;
    unblocked: ArtifactType | null;
    warnings: string[];
}

/**
 * Approve a draft: v1.0, criterion done, sign-off recorded, next artifact freed.
 */
export async function approveArtifact(
    artifactId: string,
    actor: { email: string; name?: string | null },
    supabase: Supabase = createAdminClient()
): Promise<ApproveResult> {
    const warnings: string[] = [];
    const now = new Date().toISOString();

    const { data: existing, error } = await supabase
        .from('launch_artifact')
        .select('*')
        .eq('id', artifactId)
        .single();

    if (error || !existing) throw new Error('Artifact not found');
    const artifact = existing as LaunchArtifact;

    const { data: updated, error: updateError } = await supabase
        .from('launch_artifact')
        .update({
            status: 'APPROVED' satisfies ArtifactStatus,
            version: 'v1.0',
            approved_by: actor.email,
            approved_at: now,
            change_request_note: null,
            updated_at: now,
        })
        .eq('id', artifactId)
        .select('*')
        .single();

    if (updateError) throw new Error(`Could not approve: ${updateError.message}`);

    // The readiness criterion. This is what makes approval move the launch
    // rather than just move a row.
    let criterionMarkedDone = false;
    if (artifact.criterion_id) {
        const { error: criterionError } = await supabase
            .from('launch_criterion_status')
            .update({ status: 'DONE', last_updated_at: now, last_updated_by: actor.email })
            .eq('launch_id', artifact.launch_id)
            .eq('criterion_id', artifact.criterion_id);

        if (criterionError) warnings.push(`Criterion not marked done: ${criterionError.message}`);
        else criterionMarkedDone = true;
    } else {
        warnings.push('This artifact is not linked to a readiness criterion.');
    }

    // Gate criteria carry required_signoff_roles. Record the approver against
    // the first role they can satisfy rather than inventing one.
    const signoffRecorded = await recordSignoffIfGate(artifact, actor, supabase, warnings);

    return {
        artifact: updated as LaunchArtifact,
        criterionMarkedDone,
        signoffRecorded,
        unblocked: await findUnblocked(artifact, supabase),
        warnings,
    };
}

async function recordSignoffIfGate(
    artifact: LaunchArtifact,
    actor: { email: string; name?: string | null },
    supabase: Supabase,
    warnings: string[]
): Promise<boolean> {
    if (!artifact.criterion_id) return false;

    const { data: criterion } = await supabase
        .from('criterion')
        .select('gate, required_signoff_roles')
        .eq('id', artifact.criterion_id)
        .maybeSingle();

    const roles = (criterion as { required_signoff_roles?: string[] } | null)?.required_signoff_roles;
    if (!Array.isArray(roles) || roles.length === 0) return false;

    const { error } = await supabase.from('launch_criterion_signoff').upsert(
        {
            launch_id: artifact.launch_id,
            criterion_id: artifact.criterion_id,
            // The approver satisfies one role; the others stay outstanding,
            // which is the point of a multi-signature gate.
            role: roles[0],
            signer_name: actor.name ?? actor.email,
            signer_email: actor.email,
            signed_at: new Date().toISOString(),
        },
        { onConflict: 'launch_id,criterion_id,role' }
    );

    if (error) {
        warnings.push(`Sign-off not recorded: ${error.message}`);
        return false;
    }
    return true;
}

/** The artifact this approval releases, if it exists on the launch. */
async function findUnblocked(
    artifact: LaunchArtifact,
    supabase: Supabase
): Promise<ArtifactType | null> {
    const { data } = await supabase
        .from('launch_artifact')
        .select('artifact_type')
        .eq('launch_id', artifact.launch_id);

    for (const row of (data ?? []) as Array<{ artifact_type: ArtifactType }>) {
        if (getArtifactDefinition(row.artifact_type).dependsOn === artifact.artifact_type) {
            return row.artifact_type;
        }
    }
    return null;
}

/**
 * Send a draft back with a reason.
 *
 * The reason is stored on the row and fed verbatim into the next draft's
 * prompt — a rejection with nothing actionable in it produces an identical
 * redraft.
 */
export async function requestArtifactChanges(
    artifactId: string,
    reason: string,
    actorEmail: string,
    supabase: Supabase = createAdminClient()
): Promise<LaunchArtifact> {
    const trimmed = reason.trim();
    if (!trimmed) throw new Error('A change request needs a reason the next draft can act on.');

    const { data, error } = await supabase
        .from('launch_artifact')
        .update({
            status: 'CHANGES_REQUESTED' satisfies ArtifactStatus,
            change_request_note: trimmed,
            updated_at: new Date().toISOString(),
        })
        .eq('id', artifactId)
        .select('*')
        .single();

    if (error || !data) throw new Error(`Could not record the change request: ${error?.message}`);

    console.log(`[artifacts] ${actorEmail} sent back ${ARTIFACT_LABEL[(data as LaunchArtifact).artifact_type]}`);
    return data as LaunchArtifact;
}
