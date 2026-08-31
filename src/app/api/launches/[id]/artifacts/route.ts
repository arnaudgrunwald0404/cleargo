/**
 * Launch artifacts: list, draft, and move through review.
 *
 * The Google Doc is the system of record for content, so this route never
 * returns document text — it returns identity, workflow state, and the agent's
 * open questions. Content is read in the Doc.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canRolesPerform } from '@/lib/permissions';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { ensureLaunchArtifacts } from '@/lib/artifacts/docFactory';
import { draftArtifact } from '@/lib/artifacts/draftService';
import { getArtifactDefinition } from '@/lib/artifacts/registry';
import {
    ARTIFACT_TYPES,
    isDraftStalled,
    type ArtifactStatus,
    type ArtifactType,
    type LaunchArtifact,
} from '@/types/artifacts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function resolveRoles(
    supabase: ReturnType<typeof createClient>
): Promise<{ email: string; roles: string[] } | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const { data } = await supabase
        .from('app_user')
        .select('roles')
        .ilike('email', user.email)
        .maybeSingle();

    const raw = data?.roles;
    const roles = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    return { email: user.email, roles };
}

async function getHandler(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id: launchId } = await context.params;

    try {
        const supabase = createClient();
        const actor = await resolveRoles(supabase);
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const admin = createAdminClient();
        const { data: artifacts, error } = await admin
            .from('launch_artifact')
            .select('*')
            .eq('launch_id', launchId);

        if (error) {
            // The table may not exist yet in an environment where the migration
            // has not been applied. An empty list keeps the launch page working.
            console.warn('[artifacts] read failed:', error.message);
            return NextResponse.json({ artifacts: [], openQuestions: {} });
        }

        const ids = (artifacts ?? []).map((a) => a.id as string);
        const openQuestions: Record<string, number> = {};

        if (ids.length > 0) {
            const { data: flags } = await admin
                .from('launch_artifact_flag')
                .select('launch_artifact_id')
                .in('launch_artifact_id', ids)
                .in('status', ['open', 'asked']);

            for (const f of (flags ?? []) as Array<{ launch_artifact_id: string }>) {
                openQuestions[f.launch_artifact_id] = (openQuestions[f.launch_artifact_id] ?? 0) + 1;
            }
        }

        // Sorted in workback order rather than by insertion, so the list always
        // reads as the runway does.
        const ordered = (artifacts ?? []).sort(
            (a, b) =>
                ARTIFACT_TYPES.indexOf(a.artifact_type as ArtifactType) -
                ARTIFACT_TYPES.indexOf(b.artifact_type as ArtifactType)
        );

        return NextResponse.json({ artifacts: ordered, openQuestions });
    } catch (error) {
        console.error('GET /api/launches/[id]/artifacts:', error);
        return NextResponse.json({ error: 'Failed to load artifacts' }, { status: 500 });
    }
}

const postSchema = z.object({
    /**
     * `ensure` creates rows and documents for every artifact the tier calls for.
     * `draft` runs the agent for ONE artifact and hands it to its owner.
     */
    action: z.enum(['ensure', 'draft']).default('ensure'),
    artifact_type: z.enum(ARTIFACT_TYPES as [ArtifactType, ...ArtifactType[]]).optional(),
    /** Pasted PM notes or a call transcript — the richest source for what Aha and Jira cannot cover. */
    source_notes: z.string().max(20_000).optional(),
});

async function postHandler(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id: launchId } = await context.params;

    try {
        const supabase = createClient();
        const actor = await resolveRoles(supabase);
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!canRolesPerform(actor.roles, 'launchArtifact.draft')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = postSchema.parse(await request.json().catch(() => ({})));

        if (body.action === 'draft') {
            if (!body.artifact_type) {
                return NextResponse.json(
                    { error: 'artifact_type is required when drafting' },
                    { status: 400 }
                );
            }

            const admin = createAdminClient();

            // Read the row first for two reasons: a missing one is a 404 rather
            // than a background function that fails out of sight, and its
            // current status is what the worker restores if the run throws.
            const { data: row } = await admin
                .from('launch_artifact')
                .select('status, updated_at')
                .eq('launch_id', launchId)
                .eq('artifact_type', body.artifact_type)
                .maybeSingle();

            if (!row) {
                return NextResponse.json(
                    { error: 'No such artifact on this launch. Create the documents first.' },
                    { status: 404 }
                );
            }

            // Blocked only while a run could genuinely still be in flight. A
            // background function that was killed before its error handler ran
            // leaves the row DRAFTING forever, and refusing on that basis would
            // disable the artifact permanently.
            if (row.status === 'DRAFTING' && !isDraftStalled(row as LaunchArtifact)) {
                return NextResponse.json(
                    { error: 'A draft is already running for this artifact.' },
                    { status: 409 }
                );
            }

            // Drafting takes minutes; netlify.toml caps a SYNCHRONOUS function
            // at 26s, so the maxDuration above is not honoured in production and
            // this must hand off. Same shape as HEART setup
            // (api/epics/[id]/heart/route.ts:174-278): inline locally, 202 on Netlify.
            const baseUrl = (process.env.NETLIFY_URL || process.env.URL || '').replace(/\/$/, '');
            const secret =
                process.env.NETLIFY_ARTIFACT_DRAFT_SECRET || process.env.NETLIFY_HEART_SETUP_SECRET;
            const useBackground =
                Boolean(baseUrl) && !baseUrl.includes('localhost') && Boolean(secret);

            if (useBackground) {
                // Claim the row BEFORE dispatching. draftArtifact is what sets
                // DRAFTING, and it does not run until the background function
                // spins up a second or two later -- until then the row still
                // reads NOT_STARTED, so a second click sails past the guard
                // above and starts a concurrent run against the same document.
                await admin
                    .from('launch_artifact')
                    .update({ status: 'DRAFTING', updated_at: new Date().toISOString() })
                    .eq('launch_id', launchId)
                    .eq('artifact_type', body.artifact_type);

                const triggered = await fetch(
                    `${baseUrl}/.netlify/functions/artifact-draft-background`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            launchId,
                            artifactType: body.artifact_type,
                            previousStatus: row.status,
                            sourceNotes: body.source_notes,
                            actorEmail: actor.email,
                            secret,
                        }),
                    }
                ).catch((err) => {
                    console.error('[artifacts] background trigger failed:', err);
                    return null;
                });

                if (!triggered?.ok) {
                    // Nothing is going to run, so release the claim rather than
                    // leaving the row stuck in DRAFTING with no worker behind it.
                    await admin
                        .from('launch_artifact')
                        .update({ status: row.status, updated_at: new Date().toISOString() })
                        .eq('launch_id', launchId)
                        .eq('artifact_type', body.artifact_type);

                    return NextResponse.json(
                        { error: 'Could not start the draft. Try again.' },
                        { status: 502 }
                    );
                }

                // 202: accepted, not done. The client polls GET until the row
                // leaves DRAFTING -- launch_artifact already carries that state,
                // so there is no separate job table to read.
                return NextResponse.json(
                    { accepted: true, artifact_type: body.artifact_type, status: 'DRAFTING' },
                    { status: 202 }
                );
            }

            const draft = await draftArtifact(
                launchId,
                body.artifact_type,
                { sourceNotes: body.source_notes, actorEmail: actor.email },
                admin
            );

            // 207 when the draft landed but something adjacent did not (the
            // document could not be written, the upstream was unapproved) — the
            // caller needs to know the difference between "ready to review" and
            // "ready to review, but the Doc is stale".
            return NextResponse.json(draft, { status: draft.warnings.length > 0 ? 207 : 200 });
        }

        const result = await ensureLaunchArtifacts(launchId, createAdminClient());

        // Reported rather than thrown: partial success is the normal case before
        // the Google credentials land, and the caller needs to see which half
        // worked.
        return NextResponse.json(result, { status: result.errors.length > 0 ? 207 : 200 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid body', details: error.issues }, { status: 400 });
        }
        console.error('POST /api/launches/[id]/artifacts:', error);
        // Return the real message. Drafting chains an LLM call, a Drive read, a
        // Docs write and a Slack DM, so "Failed to create artifacts" tells the
        // person clicking the button nothing and tells the person debugging it
        // less -- the actual reason was reachable only in the server console.
        // Matches POST /api/launches, which already returns error.message.
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create artifacts' },
            { status: 500 }
        );
    }
}

/**
 * Review transitions. Approving is what clears the readiness criterion and
 * unblocks the next artifact, so it is gated more tightly than requesting
 * changes.
 */
const patchSchema = z.object({
    artifact_type: z.enum(ARTIFACT_TYPES as [ArtifactType, ...ArtifactType[]]),
    status: z.enum(['PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED']),
    /** Required when sending a draft back — a rejection with no reason cannot be acted on. */
    change_request_note: z.string().max(4000).optional(),
});

async function patchHandler(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id: launchId } = await context.params;

    try {
        const supabase = createClient();
        const actor = await resolveRoles(supabase);
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = patchSchema.parse(await request.json());

        const needed = body.status === 'APPROVED' ? 'launchArtifact.approve' : 'launchArtifact.review';
        if (!canRolesPerform(actor.roles, needed)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        if (body.status === 'CHANGES_REQUESTED' && !body.change_request_note?.trim()) {
            return NextResponse.json(
                { error: 'A change request needs a reason the next draft can act on.' },
                { status: 400 }
            );
        }

        const admin = createAdminClient();
        const now = new Date().toISOString();

        const update: Record<string, unknown> = { status: body.status, updated_at: now };
        if (body.status === 'APPROVED') {
            update.version = 'v1.0';
            update.approved_by = actor.email;
            update.approved_at = now;
            update.change_request_note = null;
        }
        if (body.status === 'CHANGES_REQUESTED') {
            update.change_request_note = body.change_request_note?.trim() ?? null;
        }
        if (body.status === 'PENDING_REVIEW') {
            update.submitted_at = now;
        }

        const { data: artifact, error } = await admin
            .from('launch_artifact')
            .update(update)
            .eq('launch_id', launchId)
            .eq('artifact_type', body.artifact_type)
            .select('*')
            .single();

        if (error || !artifact) {
            return NextResponse.json({ error: error?.message ?? 'Artifact not found' }, { status: 404 });
        }

        // Approval is what actually moves the launch: mark the runway row done
        // so readiness, the gate chain, and the workback timeline all reflect it.
        if (body.status === 'APPROVED' && artifact.criterion_id) {
            const { error: criterionError } = await admin
                .from('launch_criterion_status')
                .update({ status: 'DONE', last_updated_at: now, last_updated_by: actor.email })
                .eq('launch_id', launchId)
                .eq('criterion_id', artifact.criterion_id);

            if (criterionError) {
                console.warn('[artifacts] criterion not marked done:', criterionError.message);
            }
        }

        return NextResponse.json({
            artifact,
            label: getArtifactDefinition(body.artifact_type).label,
            status: body.status as ArtifactStatus,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid body', details: error.issues }, { status: 400 });
        }
        console.error('PATCH /api/launches/[id]/artifacts:', error);
        return NextResponse.json({ error: 'Failed to update artifact' }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.heavy);
export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
