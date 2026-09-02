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
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { ensureLaunchArtifacts } from '@/lib/artifacts/docFactory';
import {
    dispatchLaunchArtifactSetup,
    hasMissingDocs,
    launchArtifactSetupTarget,
} from '@/lib/artifacts/backgroundSetup';
import { startArtifactDraft } from '@/lib/artifacts/startDraft';
import { getArtifactDefinition } from '@/lib/artifacts/registry';
import { isGoogleConfigured } from '@/lib/google/auth';
import {
    ARTIFACT_TYPES,
    type ArtifactStatus,
    type ArtifactType,
} from '@/types/artifacts';
import { markLaunchCriterionDone } from '@/lib/artifacts/criterionCompletion';

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

        // Effective rules, not DEFAULT_RULES. Every sibling launch route
        // (api/launches, api/launches/[id]/assets) already resolves the admin
        // overrides in app_settings.permissions; this one did not, so the same
        // capability was enforced two different ways depending on which
        // endpoint you hit.
        const rules = await getEffectivePermissionRules();
        if (!canRolesPerformWithRules(actor.roles, 'launchArtifact.draft', rules)) {
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

            // The 26s cap, the claim-before-dispatch race, and the release on a
            // failed trigger all live in startArtifactDraft -- shared with the MCP
            // draft tools so the two cannot drift apart.
            const started = await startArtifactDraft(
                launchId,
                body.artifact_type,
                { sourceNotes: body.source_notes, actorEmail: actor.email },
                admin
            );

            switch (started.outcome) {
                case 'not_found':
                    return NextResponse.json(
                        { error: 'No such artifact on this launch. Create the documents first.' },
                        { status: 404 }
                    );

                case 'already_running':
                    return NextResponse.json(
                        { error: 'A draft is already running for this artifact.' },
                        { status: 409 }
                    );

                case 'dispatch_failed':
                    return NextResponse.json(
                        { error: 'Could not start the draft. Try again.' },
                        { status: 502 }
                    );

                case 'accepted':
                    // 202: accepted, not done. The client polls GET until the row
                    // leaves DRAFTING -- launch_artifact already carries that
                    // state, so there is no separate job table to read.
                    return NextResponse.json(
                        { accepted: true, artifact_type: started.artifactType, status: 'DRAFTING' },
                        { status: 202 }
                    );

                case 'completed':
                    // 207 when the draft landed but something adjacent did not (the
                    // document could not be written, the upstream was unapproved) --
                    // the caller needs to know the difference between "ready to
                    // review" and "ready to review, but the Doc is stale".
                    return NextResponse.json(started.draft, {
                        status: started.draft.warnings.length > 0 ? 207 : 200,
                    });
            }
        }

        // Same handoff as drafting, and for the same reason: filling in five
        // missing documents is ~20 sequential Google calls against a 26s cap.
        // This is fast when everything already exists, which is exactly why the
        // exposure went unnoticed -- the slow case is a launch whose documents
        // were never created.
        //
        // Only hand off when there is real Google work to do, though. Pressing
        // this on a complete launch is the common case, and ensureLaunchArtifacts
        // makes no Drive copies then, so answering it with a 202 would trade a
        // truthful "nothing missing" for a spinner and two minutes of polling.
        // Same for an environment with no Google connection: nothing slow can
        // happen, and inline keeps the "connect Google" message that explains why
        // rows appeared without documents.
        const admin = createAdminClient();
        const needsSlowPath =
            (await isGoogleConfigured()) && (await hasMissingDocs(launchId, admin));
        const setupTarget = needsSlowPath ? launchArtifactSetupTarget() : null;

        if (setupTarget) {
            const started = await dispatchLaunchArtifactSetup(launchId, setupTarget);
            if (!started) {
                return NextResponse.json(
                    { error: 'Could not start document setup. Try again.' },
                    { status: 502 }
                );
            }
            // 202: accepted, not done. The client polls the normal GET, where a
            // filled-in doc_id is the completion signal.
            return NextResponse.json({ accepted: true }, { status: 202 });
        }

        const result = await ensureLaunchArtifacts(launchId, admin);

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
        const rules = await getEffectivePermissionRules();
        if (!canRolesPerformWithRules(actor.roles, needed, rules)) {
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
            const completion = await markLaunchCriterionDone(
                admin,
                { launchId, criterionId: artifact.criterion_id, actorEmail: actor.email },
                now
            );
            if (completion.warning) {
                console.warn('[artifacts]', completion.warning);
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
