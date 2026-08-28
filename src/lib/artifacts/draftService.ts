/**
 * One drafting run, end to end.
 *
 * Generate -> write into the Doc -> persist the audit trail -> turn ungrounded
 * claims into interview questions -> hand the artifact to its owner for review.
 *
 * Ordering matters. The document is written BEFORE the row is marked
 * PENDING_REVIEW, so an owner is never asked to review a document that has not
 * been updated. If the Doc write fails, the draft is still persisted and the
 * status says so — losing a 40-second LLM run because Drive blipped would be
 * the worst of both worlds.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { isGoogleConfigured } from '@/lib/google/auth';
import { getDocument, extractDocumentText, replaceTokens } from '@/lib/google/client';
import { generateArtifact } from './generator';
import { buildTokenMap } from './render';
import { getArtifactDefinition } from './registry';
import { syncArtifactFlags, renderAnsweredFlagsForPrompt } from './flags';
import { requestArtifactReview } from './reviewService';
import type { ArtifactStatus, ArtifactType, LaunchArtifact } from '@/types/artifacts';

type Supabase = ReturnType<typeof createAdminClient>;

export interface DraftArtifactResult {
    artifact: LaunchArtifact;
    status: ArtifactStatus;
    flagsRaised: number;
    docUpdated: boolean;
    /** Non-fatal problems worth surfacing (Doc write failed, upstream missing). */
    warnings: string[];
}

export async function draftArtifact(
    launchId: string,
    artifactType: ArtifactType,
    options: { sourceNotes?: string; actorEmail?: string; notify?: boolean } = {},
    supabase: Supabase = createAdminClient()
): Promise<DraftArtifactResult> {
    const def = getArtifactDefinition(artifactType);
    const warnings: string[] = [];

    const { data: existing, error } = await supabase
        .from('launch_artifact')
        .select('*')
        .eq('launch_id', launchId)
        .eq('artifact_type', artifactType)
        .single();

    if (error || !existing) {
        throw new Error(
            `No ${def.label} row for launch ${launchId}. Run ensureLaunchArtifacts first.`
        );
    }

    const artifact = existing as LaunchArtifact;
    const generation = (artifact.generation ?? 0) + 1;

    // Mark DRAFTING so a second concurrent request is visible rather than
    // silently racing. Best-effort: a failure here must not block the run.
    await supabase
        .from('launch_artifact')
        .update({ status: 'DRAFTING', updated_at: new Date().toISOString() })
        .eq('id', artifact.id);

    // The upstream document, read back from Drive rather than from our snapshot.
    // The Doc is the system of record, so a PMM's edits to the approved Story
    // Brief must reach the Messaging Brief — trusting our copy would reintroduce
    // exactly the drift this design avoids.
    let upstreamText: string | null = null;
    if (def.dependsOn) {
        const result = await loadUpstreamText(launchId, def.dependsOn, supabase);
        upstreamText = result.text;
        if (result.warning) warnings.push(result.warning);
    }

    // Questions the owner already answered become grounding, not re-asks.
    const answeredFlagsBlock = await renderAnsweredFlagsForPrompt(artifact.id, supabase);

    const result = await generateArtifact({
        launchId,
        artifactType,
        sourceNotes: options.sourceNotes,
        upstreamText,
        answeredFlagsBlock,
        changeRequestNote: artifact.change_request_note,
    });

    // Write into the document before anyone is asked to look at it.
    let docUpdated = false;
    if (artifact.doc_id && (await isGoogleConfigured())) {
        try {
            await replaceTokens(artifact.doc_id, buildTokenMap(artifactType, result.output));
            docUpdated = true;
        } catch (err) {
            warnings.push(
                `Draft saved but the document was not updated: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    } else if (!artifact.doc_id) {
        warnings.push('No document yet — the draft is stored in ClearGO and will fill the Doc once it exists.');
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
        .from('launch_artifact')
        .update({
            // ai_draft is never mutated after this, so a later draft can be
            // diffed against exactly what the model produced.
            ai_draft: result.output,
            context_snapshot: result.context,
            validation_snapshot: result.context.rollup,
            status: 'PENDING_REVIEW' satisfies ArtifactStatus,
            generation,
            last_drafted_at: now,
            submitted_at: now,
            // Cleared: this draft was written to address it.
            change_request_note: null,
            updated_at: now,
        })
        .eq('id', artifact.id)
        .select('*')
        .single();

    if (updateError) {
        throw new Error(`Draft generated but could not be saved: ${updateError.message}`);
    }

    // Ungrounded claims become the owner's interview queue. Deliberately before
    // the DM so the message can offer "Answer N questions" with a real count.
    const flags = await syncArtifactFlags(artifact.id, result.flags, generation, supabase);

    // Ask the owner. Non-fatal: a Slack outage must not undo a good draft — the
    // artifact is PENDING_REVIEW and visible in the app either way.
    if (options.notify !== false) {
        const asked = await requestArtifactReview(artifact.id, supabase);
        if (!asked.sent) warnings.push(`Review not requested in Slack: ${asked.reason}`);
    }

    return {
        artifact: updated as LaunchArtifact,
        status: 'PENDING_REVIEW',
        flagsRaised: flags.inserted,
        docUpdated,
        warnings,
    };
}

/**
 * Read the approved upstream document's text.
 *
 * Returns null with a warning rather than throwing when the upstream is missing
 * or unapproved: a Messaging Brief drafted without its Story Brief is worse than
 * one drafted with a loud flag saying so, but it is not worth refusing to draft
 * at all — the prompt tells the model to flag every claim that would have come
 * from it.
 */
async function loadUpstreamText(
    launchId: string,
    upstreamType: ArtifactType,
    supabase: Supabase
): Promise<{ text: string | null; warning?: string }> {
    const upstreamDef = getArtifactDefinition(upstreamType);

    const { data } = await supabase
        .from('launch_artifact')
        .select('status, doc_id')
        .eq('launch_id', launchId)
        .eq('artifact_type', upstreamType)
        .maybeSingle();

    const row = data as { status?: string; doc_id?: string | null } | null;

    if (!row) {
        return { text: null, warning: `No ${upstreamDef.label} exists yet.` };
    }
    if (row.status !== 'APPROVED') {
        return {
            text: null,
            warning: `${upstreamDef.label} is ${row.status ?? 'missing'}, not approved — nothing downstream should quote it yet.`,
        };
    }
    if (!row.doc_id || !(await isGoogleConfigured())) {
        return { text: null, warning: `${upstreamDef.label} is approved but has no readable document.` };
    }

    try {
        const doc = await getDocument(row.doc_id);
        const text = extractDocumentText(doc);
        return text
            ? { text }
            : { text: null, warning: `${upstreamDef.label} document is empty.` };
    } catch (err) {
        return {
            text: null,
            warning: `Could not read the ${upstreamDef.label} document: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
