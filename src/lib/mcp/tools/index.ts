/**
 * Registering the launch-artifact tools on the MCP server.
 *
 * Every tool has the same shape — (supabase, args, actor) returning a plain
 * object — so registration is a table rather than fifteen near-identical blocks.
 * Each tool validates its own arguments against the schema advertised here, and
 * the write tools check the actor's ClearGO capabilities themselves; this file
 * only wires them up.
 *
 * These previously lived in a stdio server that ran on each person's laptop with
 * the Supabase service-role key and no authorization at all. Both problems are
 * fixed by where they now run, not by the tool code: the key stays on the server,
 * and `actor` is a real person resolved from an OAuth token.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodRawShape } from 'zod/v3';
import type { McpAuthInfo } from '@/lib/oauth/tokens';

import { listLaunches } from './list-launches';
import { searchLaunches, InputSchema as searchLaunchesSchema } from './search-launches';
import { getLaunch, InputSchema as getLaunchSchema } from './get-launch';
import { getLaunchContext, InputSchema as getLaunchContextSchema } from './get-launch-context';
import { listArtifacts, InputSchema as listArtifactsSchema } from './list-artifacts';
import { getArtifact, InputSchema as getArtifactSchema } from './get-artifact';
import { diffArtifact, InputSchema as diffArtifactSchema } from './diff-artifact';
import { explainClaim, InputSchema as explainClaimSchema } from './explain-claim';
import { artifactChat, InputSchema as artifactChatSchema } from './artifact-chat';
import { updateArtifact, InputSchema as updateArtifactSchema } from './update-artifact';
import { answerFlags, InputSchema as answerFlagsSchema } from './answer-flags';
import { reviewArtifact, InputSchema as reviewArtifactSchema } from './review-artifact';
import { draftArtifactTool, InputSchema as draftArtifactSchema } from './draft-artifact';
import { draftSection, InputSchema as draftSectionSchema } from './draft-section';
import { ensureArtifacts, InputSchema as ensureArtifactsSchema } from './ensure-artifacts';
import { getEpicCriteria, InputSchema as getEpicCriteriaSchema } from './get-epic-criteria';
import { getMyWorkTool, InputSchema as getMyWorkSchema } from './get-my-work';
import { getPendingGtmAccess } from './get-pending-gtm-access';
import { updateCriterionStatus, InputSchema as updateCriterionStatusSchema } from './update-criterion-status';
import { findEpicsTool, InputSchema as findEpicsSchema } from './find-epics';
import { getEpicTool, InputSchema as getEpicSchema } from './get-epic';
import { listReleases } from './list-releases';

type ToolHandler = (
    supabase: SupabaseClient,
    args: Record<string, unknown>,
    actor: McpAuthInfo
) => Promise<unknown>;

interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: ZodRawShape;
    /** readOnlyHint lets a client show a write tool differently, or confirm it. */
    readOnly: boolean;
    handler: ToolHandler;
}

const TOOLS: ToolDefinition[] = [
    // ── Read ────────────────────────────────────────────────────────────────
    {
        name: 'list-launches',
        description: 'List active (non-archived) launches with tier, target date, status, and owner.',
        inputSchema: {},
        readOnly: true,
        handler: listLaunches,
    },
    {
        name: 'search-launches',
        description: 'Find launches by name. Use when the user names a launch but you do not have its ID.',
        inputSchema: searchLaunchesSchema.shape,
        readOnly: true,
        handler: searchLaunches,
    },
    {
        name: 'get-launch',
        description: 'Fetch one launch in full — readiness criteria, assets, and linked epics.',
        inputSchema: getLaunchSchema.shape,
        readOnly: true,
        handler: getLaunch,
    },
    {
        name: 'get-launch-context',
        description: 'Gather everything the drafting agent would see for a launch. Use before writing or critiquing artifact content.',
        inputSchema: getLaunchContextSchema.shape,
        readOnly: true,
        handler: getLaunchContext,
    },
    {
        name: 'list-artifacts',
        description: 'List a launch\'s artifacts with status, version, owner, and document links.',
        inputSchema: listArtifactsSchema.shape,
        readOnly: true,
        handler: listArtifacts,
    },
    {
        name: 'get-artifact',
        description: 'Read one artifact: drafted content, open interview flags, and recent history. Also how you check whether a draft has finished — status leaves DRAFTING when it is done.',
        inputSchema: getArtifactSchema.shape,
        readOnly: true,
        handler: getArtifact,
    },
    {
        name: 'diff-artifact',
        description: 'Compare two generations of an artifact to see what a re-draft changed.',
        inputSchema: diffArtifactSchema.shape,
        readOnly: true,
        handler: diffArtifact,
    },
    {
        name: 'explain-claim',
        description: 'Explain the grounding behind a specific claim in an artifact — where it came from and how well supported it is.',
        inputSchema: explainClaimSchema.shape,
        readOnly: true,
        handler: explainClaim,
    },
    {
        name: 'artifact-chat',
        description: 'Ask a question, request a structured review, or get a summary of an artifact. Read-only — use update-artifact or draft-section to change anything.',
        inputSchema: artifactChatSchema.shape,
        readOnly: true,
        handler: artifactChat,
    },

    {
        name: 'find-epics',
        description: 'Find epics (releases) by name, status, tier, owner or release. Start here when the user names something and you need its id. Note: epics are the delivery record; launches are the GTM record -- use search-launches for those.',
        inputSchema: findEpicsSchema.shape,
        readOnly: true,
        handler: findEpicsTool,
    },
    {
        name: 'get-epic',
        description: 'One epic in full, including the derived release status the app displays (which is computed, not stored) and optionally the GTM launches holding it back.',
        inputSchema: getEpicSchema.shape,
        readOnly: true,
        handler: getEpicTool,
    },
    {
        name: 'list-releases',
        description: 'The active release train with GA and cohort-2 dates. These are the anchors every criterion due date is derived from.',
        inputSchema: {},
        readOnly: true,
        handler: listReleases,
    },
    {
        name: 'get-epic-criteria',
        description: 'The readiness matrix for one epic, one row per criterion, with status, gate flag, owner and notes. Returns the statusRowId that update-criterion-status writes against, so call this first.',
        inputSchema: getEpicCriteriaSchema.shape,
        readOnly: true,
        handler: getEpicCriteria,
    },
    {
        name: 'get-my-work',
        description: 'Everything waiting on the authenticated caller: criteria they owe a decision on, criteria they have marked as blocking, GTM launch artifacts and Story Brief questions. Needs no arguments -- it is scoped to whoever is signed in.',
        inputSchema: getMyWorkSchema.shape,
        readOnly: true,
        handler: getMyWorkTool,
    },
    {
        name: 'get-pending-gtm-access',
        description: 'Epics where the caller still owes a GTM access confirmation. A per-epic queue, separate from the per-criterion items in get-my-work.',
        inputSchema: {},
        readOnly: true,
        handler: getPendingGtmAccess,
    },

    // ── Write ───────────────────────────────────────────────────────────────
    {
        name: 'update-artifact',
        description: 'Edit drafted artifact content directly, either replacing it wholesale or merging specific sections.',
        inputSchema: updateArtifactSchema.shape,
        readOnly: false,
        handler: updateArtifact,
    },
    {
        name: 'answer-flags',
        description: 'Answer the open interview questions an artifact draft raised.',
        inputSchema: answerFlagsSchema.shape,
        readOnly: false,
        handler: answerFlags,
    },
    {
        name: 'review-artifact',
        description: 'Move an artifact through review: submit it, send it back with a reason, or approve it as v1.0.',
        inputSchema: reviewArtifactSchema.shape,
        readOnly: false,
        handler: reviewArtifact,
    },
    {
        name: 'draft-artifact',
        description: 'Run the AI agent to draft or re-draft an artifact. Returns as soon as the work starts — it runs in the background for one to three minutes, so poll get-artifact until status leaves DRAFTING.',
        inputSchema: draftArtifactSchema.shape,
        readOnly: false,
        handler: draftArtifactTool,
    },
    {
        name: 'draft-section',
        description: 'Re-draft one section of an artifact with targeted instructions. Like draft-artifact, it returns immediately and runs in the background.',
        inputSchema: draftSectionSchema.shape,
        readOnly: false,
        handler: draftSection,
    },
    {
        name: 'ensure-artifacts',
        description: 'Create any artifact rows and Google Docs a launch is missing for its tier. Idempotent. May run in the background when there are documents to create.',
        inputSchema: ensureArtifactsSchema.shape,
        readOnly: false,
        handler: ensureArtifacts,
    },
    {
        name: 'update-criterion-status',
        description: 'Score a readiness criterion on an epic: GO, CONDITIONAL (same as CONDITIONAL_GO), NO_GO, NOT_SET or NOT_APPLICABLE, with optional notes and a Conditional Go condition. Get the statusRowId from get-epic-criteria or get-my-work. Recomputes the release readiness score and records who made the change.',
        inputSchema: updateCriterionStatusSchema.shape,
        readOnly: false,
        handler: updateCriterionStatus,
    },
];

export function registerArtifactTools(
    server: McpServer,
    supabase: SupabaseClient,
    actor: McpAuthInfo
): void {
    for (const tool of TOOLS) {
        server.registerTool(
            tool.name,
            {
                description: tool.description,
                inputSchema: tool.inputSchema,
                annotations: { readOnlyHint: tool.readOnly },
            },
            async (args: Record<string, unknown>) => {
                try {
                    const result = await tool.handler(supabase, args ?? {}, actor);
                    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
                } catch (err) {
                    // The message can carry database detail, so it is logged in
                    // full and generalised for the caller.
                    console.error(`[mcp] ${tool.name} error:`, err);
                    return {
                        content: [
                            { type: 'text' as const, text: JSON.stringify({ error: 'Internal server error' }) },
                        ],
                        isError: true,
                    };
                }
            }
        );
    }
}
