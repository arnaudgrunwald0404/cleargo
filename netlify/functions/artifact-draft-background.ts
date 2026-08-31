/**
 * Netlify Background Function: draft one launch artifact (runs up to 15 min).
 *
 * Invoked by POST /api/launches/[id]/artifacts { action: 'draft' }. Drafting
 * chains an LLM call, a Drive read of the upstream doc, a Docs write and a
 * Slack DM; that is minutes of work, and netlify.toml caps a SYNCHRONOUS
 * function at 26s. The route's `maxDuration = 300` is not honoured there, so
 * running this inline would fail in production and only in production.
 *
 * There is no job table: `launch_artifact` already carries the state a job row
 * would. draftArtifact() sets status DRAFTING on entry and PENDING_REVIEW on
 * exit, so the artifact row IS the job record and the client polls the normal
 * GET endpoint.
 *
 * Env: NETLIFY_ARTIFACT_DRAFT_SECRET (falls back to NETLIFY_HEART_SETUP_SECRET).
 */

import { createClient } from '@supabase/supabase-js';
import { setOverrideAdminClient } from '../../src/lib/db';
import type { ArtifactStatus, ArtifactType } from '../../src/types/artifacts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;

interface Body {
    launchId: string;
    artifactType: ArtifactType;
    /** Status to restore if the run fails, so a crash cannot strand the row in DRAFTING. */
    previousStatus: ArtifactStatus;
    sourceNotes?: string;
    actorEmail?: string;
    secret?: string;
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

const handler = async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const { launchId, artifactType, previousStatus, sourceNotes, actorEmail, secret } = body;

    const expectedSecret =
        process.env.NETLIFY_ARTIFACT_DRAFT_SECRET || process.env.NETLIFY_HEART_SETUP_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
        return json({ error: 'Unauthorized' }, 401);
    }

    if (!launchId || !artifactType) {
        return json({ error: 'Missing launchId or artifactType' }, 400);
    }

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
        return json({ error: 'Server configuration error' }, 500);
    }

    const adminClient = createClient(supabaseUrl, supabaseKey);
    // Covers anything reached through getAdminClient() in src/lib/db. Note it
    // does NOT cover the artifacts chain itself, which calls createAdminClient()
    // from src/lib/supabase/server directly -- that builds its own client from
    // env, which works here. Kept for transitive consumers (settings, Slack).
    setOverrideAdminClient(adminClient);

    try {
        // Imported HERE, not at module scope, so that a failure to LOAD the
        // draft chain is caught by the handler below and written onto the row.
        // Netlify answers a background invocation with 202 immediately, so a
        // module-load crash is otherwise completely invisible: the artifact
        // sits in DRAFTING forever with nothing anywhere saying why.
        const { draftArtifact } = await import('../../src/lib/artifacts/draftService');

        const result = await draftArtifact(
            launchId,
            artifactType,
            { sourceNotes, actorEmail },
            adminClient as never
        );
        console.log(
            `[artifact-draft] ${artifactType} for ${launchId}: ${result.status}, ` +
                `${result.flagsRaised} questions, doc ${result.docUpdated ? 'updated' : 'not updated'}`
        );
        return json({ ok: true, status: result.status, warnings: result.warnings }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[artifact-draft] ${artifactType} for ${launchId} failed:`, message);

        // draftArtifact marks DRAFTING before the LLM call and has no catch of
        // its own, so without this the row stays DRAFTING forever and the UI
        // polls a spinner that never resolves. Restore what it was before.
        const { error: resetError } = await adminClient
            .from('launch_artifact')
            .update({
                status: previousStatus ?? 'NOT_STARTED',
                change_request_note: `Drafting failed: ${message}`,
                updated_at: new Date().toISOString(),
            })
            .eq('launch_id', launchId)
            .eq('artifact_type', artifactType);

        if (resetError) {
            console.error('[artifact-draft] could not reset status:', resetError.message);
        }

        return json({ ok: false, error: message }, 500);
    }
};

export default handler;
