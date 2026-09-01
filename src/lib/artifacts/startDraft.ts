/**
 * Starting an artifact draft, from anywhere.
 *
 * Drafting takes minutes. netlify.toml caps a SYNCHRONOUS function at 26s, and
 * `maxDuration` is not honoured there, so any caller that waits for a draft to
 * finish will fail in production and only in production. The answer is a
 * background function (15 minutes) plus a claimed row the caller polls.
 *
 * That handoff had been written out twice already -- once for artifacts and once
 * for HEART setup (src/app/api/epics/[id]/heart/route.ts) -- and adding the MCP
 * tools would have made three. It lives here now, because the two details that
 * make it correct are easy to leave out of a re-implementation:
 *
 *   Claim before dispatch. draftArtifact is what sets DRAFTING, and it does not
 *   run until the background function spins up a second or two later. Until then
 *   the row still reads NOT_STARTED, so a second request sails past the
 *   already-running guard and starts a concurrent run against the same document.
 *
 *   Release on dispatch failure. If the trigger does not land, nothing is going
 *   to run, and a row left claimed is stuck in DRAFTING forever with no worker
 *   behind it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { draftArtifact, type DraftArtifactResult } from './draftService';
import { isDraftStalled, type ArtifactType, type LaunchArtifact } from '@/types/artifacts';

export type StartDraftResult =
    /** Handed to the background worker. The row reads DRAFTING; poll it. */
    | { outcome: 'accepted'; artifactType: ArtifactType }
    /** Ran inline (local dev, or no background target configured). */
    | { outcome: 'completed'; draft: DraftArtifactResult }
    /** No row for this artifact on this launch — the documents were never created. */
    | { outcome: 'not_found' }
    /** A run is genuinely still in flight. */
    | { outcome: 'already_running' }
    /** The trigger did not land; the claim has been released. */
    | { outcome: 'dispatch_failed' };

export interface StartDraftOptions {
    sourceNotes?: string;
    /**
     * Targeted revision instructions. Written to the row before dispatch because
     * that is where draftArtifact reads them from — which also means it works on
     * the background path, where nothing else is passed through.
     */
    changeRequestNote?: string;
    actorEmail: string;
}

/**
 * Is there a background worker to hand this to?
 *
 * Mirrors launchArtifactSetupTarget() in ./backgroundSetup — the two must agree,
 * because disagreeing means one path times out in production while the other
 * does not.
 */
function backgroundTarget(): { baseUrl: string; secret: string } | null {
    const baseUrl = (process.env.NETLIFY_URL || process.env.URL || '').replace(/\/$/, '');
    const secret =
        process.env.NETLIFY_ARTIFACT_DRAFT_SECRET || process.env.NETLIFY_HEART_SETUP_SECRET;

    if (!baseUrl || baseUrl.includes('localhost') || !secret) return null;
    return { baseUrl, secret };
}

export async function startArtifactDraft(
    launchId: string,
    artifactType: ArtifactType,
    options: StartDraftOptions,
    admin: SupabaseClient
): Promise<StartDraftResult> {
    // Read first: a missing row is a clean "not found" rather than a background
    // function failing out of sight, and the current status is what the worker
    // restores if the run throws.
    const { data: row } = await admin
        .from('launch_artifact')
        .select('status, updated_at')
        .eq('launch_id', launchId)
        .eq('artifact_type', artifactType)
        .maybeSingle();

    if (!row) return { outcome: 'not_found' };

    // Blocked only while a run could genuinely still be in flight. A background
    // function killed before its error handler ran leaves the row DRAFTING
    // forever, and refusing on that basis would disable the artifact permanently.
    if (row.status === 'DRAFTING' && !isDraftStalled(row as LaunchArtifact)) {
        return { outcome: 'already_running' };
    }

    if (options.changeRequestNote?.trim()) {
        await admin
            .from('launch_artifact')
            .update({ change_request_note: options.changeRequestNote.trim() })
            .eq('launch_id', launchId)
            .eq('artifact_type', artifactType);
    }

    const target = backgroundTarget();

    if (!target) {
        // No 26s cap in front of `next dev`, so inline is right locally and keeps
        // the full result available to the caller.
        const draft = await draftArtifact(
            launchId,
            artifactType,
            { sourceNotes: options.sourceNotes, actorEmail: options.actorEmail },
            admin
        );
        return { outcome: 'completed', draft };
    }

    await admin
        .from('launch_artifact')
        .update({ status: 'DRAFTING', updated_at: new Date().toISOString() })
        .eq('launch_id', launchId)
        .eq('artifact_type', artifactType);

    const triggered = await fetch(`${target.baseUrl}/.netlify/functions/artifact-draft-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            launchId,
            artifactType,
            previousStatus: row.status,
            sourceNotes: options.sourceNotes,
            actorEmail: options.actorEmail,
            secret: target.secret,
        }),
    }).catch((err) => {
        console.error('[artifacts] background trigger failed:', err);
        return null;
    });

    if (!triggered?.ok) {
        await admin
            .from('launch_artifact')
            .update({ status: row.status, updated_at: new Date().toISOString() })
            .eq('launch_id', launchId)
            .eq('artifact_type', artifactType);

        return { outcome: 'dispatch_failed' };
    }

    return { outcome: 'accepted', artifactType };
}
