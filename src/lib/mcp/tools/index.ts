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
