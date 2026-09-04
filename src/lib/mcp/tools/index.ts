/**
 * The ClearGO tool registry.
 *
 * Every tool has the same shape — (supabase, args, actor) returning a plain
 * object — so registration is a table rather than forty-five near-identical
 * blocks. Each tool validates its own arguments against the schema advertised
 * here, and the write tools check the actor's ClearGO capabilities themselves;
 * this file only wires them up.
 *
 * This table is the single source of truth for two transports: the MCP endpoint
 * (registerClearGoTools, below) and the in-app ClearGO assistant, which adapts
 * the same entries into Vercel AI SDK tools (src/lib/ai/mcpTools.ts). Register a
 * tool anywhere else and it exists on one surface and not the other, which is
 * exactly how the assistant ended up with its own divergent copy of the
 * criterion write -- one that skipped the capability check, the readiness
 * recompute and the status-history row.
 *
 * The artifact tools previously lived in a stdio server that ran on each
 * person's laptop with the Supabase service-role key and no authorization at
 * all. Both problems are fixed by where they now run, not by the tool code: the
 * key stays on the server, and `actor` is a real person resolved from an OAuth
 * token.
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
import { getMyNotifications, InputSchema as getMyNotificationsSchema } from './get-my-notifications';
import { updateCriterionStatus, InputSchema as updateCriterionStatusSchema } from './update-criterion-status';
import { findEpicsTool, InputSchema as findEpicsSchema } from './find-epics';
import { getEpicTool, InputSchema as getEpicSchema } from './get-epic';
import { listReleases } from './list-releases';
import { getSuccessMetrics, InputSchema as getSuccessMetricsSchema } from './get-success-metrics';
import { getSuccessScorecards, InputSchema as getSuccessScorecardsSchema } from './get-success-scorecards';
import { listRetros, InputSchema as listRetrosSchema } from './list-retros';
import { getHeartMetrics, InputSchema as getHeartMetricsSchema } from './get-heart-metrics';
import { listRoadmapSnapshots } from './list-roadmap-snapshots';
import { getRoadmapMovements, InputSchema as getRoadmapMovementsSchema } from './get-roadmap-movements';
import { getRoadmapDeliveryMetrics, InputSchema as getRoadmapDeliveryMetricsSchema } from './get-roadmap-delivery-metrics';
import { getStrategicItems, InputSchema as getStrategicItemsSchema } from './get-strategic-items';
import { getConfidenceRating, InputSchema as getConfidenceRatingSchema } from './get-confidence-rating';
import { adjustConfidence, InputSchema as adjustConfidenceSchema } from './adjust-confidence';
import { setImpactOverride, InputSchema as setImpactOverrideSchema } from './set-impact-override';
import { getAnalytics, InputSchema as getAnalyticsSchema } from './get-analytics';
import {
    listPapricoMeetings,
    getPapricoAgenda,
    listPapricoDecisions,
    listPapricoItems,
    getNextPapricoMeeting,
    createPapricoMeeting,
    addPapricoItem,
    publishPapricoAgenda,
    AgendaInputSchema,
    DecisionsInputSchema,
    ItemsInputSchema,
    NextMeetingInputSchema,
    CreateMeetingInputSchema,
    AddItemInputSchema,
    PublishInputSchema,
} from './paprico';
import { listForecasts, InputSchema as listForecastsSchema } from './list-forecasts';
import { generateForecast, InputSchema as generateForecastSchema } from './generate-forecast';
import { getForecastStatus, InputSchema as getForecastStatusSchema } from './get-forecast-status';
import { getForecast, InputSchema as getForecastSchema } from './get-forecast';
import { getEpicDecisions, InputSchema as getEpicDecisionsSchema } from './get-epic-decisions';
import { getEpicStoryBrief, InputSchema as getEpicStoryBriefSchema } from './get-epic-story-brief';
import {
    listTeamMembers,
    getOneOnOnePrep,
    listMemberEpics,
    listMemberBlockers,
    getEpicDetail,
    PersonSchema,
    MemberEpicsSchema,
    MemberSchema,
    EpicDetailSchema,
} from './team';

type ToolHandler = (
    supabase: SupabaseClient,
    args: Record<string, unknown>,
    actor: McpAuthInfo
) => Promise<unknown>;

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: ZodRawShape;
    /** readOnlyHint lets a client show a write tool differently, or confirm it. */
    readOnly: boolean;
    handler: ToolHandler;
}

export const MCP_TOOLS: ToolDefinition[] = [
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
        name: 'get-my-notifications',
        description: 'What ClearGO has already told the caller and where: Slack and email nudges over a recent window, with counts by type and any failed deliveries. Use it before reminding someone about something they have already been chased about, or to explain why a nudge never arrived.',
        inputSchema: getMyNotificationsSchema.shape,
        readOnly: true,
        handler: getMyNotifications,
    },
    {
        name: 'get-pending-gtm-access',
        description: 'Epics where the caller still owes a GTM access confirmation. A per-epic queue, separate from the per-criterion items in get-my-work.',
        inputSchema: {},
        readOnly: true,
        handler: getPendingGtmAccess,
    },

    {
        name: 'get-heart-metrics',
        description: 'The HEART dashboard for an epic: categories, metrics, latest values and trend. Optionally as of a past date.',
        inputSchema: getHeartMetricsSchema.shape,
        readOnly: true,
        handler: getHeartMetrics,
    },
    {
        name: 'get-success-metrics',
        description: 'The success plan for an epic and its latest values. An unpublished plan is hidden unless the caller can configure success measurement -- the response says so rather than returning an empty list.',
        inputSchema: getSuccessMetricsSchema.shape,
        readOnly: true,
        handler: getSuccessMetrics,
    },
    {
        name: 'get-success-scorecards',
        description: 'Post-launch scorecard snapshots for an epic, newest first.',
        inputSchema: getSuccessScorecardsSchema.shape,
        readOnly: true,
        handler: getSuccessScorecards,
    },
    {
        name: 'list-retros',
        description: 'Retrospectives for an epic by day marker, with status and submitter.',
        inputSchema: listRetrosSchema.shape,
        readOnly: true,
        handler: listRetros,
    },

    {
        name: 'list-roadmap-snapshots',
        description: 'Which weekly roadmap snapshot dates exist. Other roadmap tools take an asOfDate; get a valid one here rather than guessing, since an unknown date returns nothing and looks like "nothing moved".',
        inputSchema: {},
        readOnly: true,
        handler: listRoadmapSnapshots,
    },
    {
        name: 'get-roadmap-movements',
        description: 'What moved on the roadmap over a horizon: weekly, quarterly, year to date, the full year, or categorised by PM-assessed impact.',
        inputSchema: getRoadmapMovementsSchema.shape,
        readOnly: true,
        handler: getRoadmapMovements,
    },
    {
        name: 'get-roadmap-delivery-metrics',
        description: 'Delivery metrics for a release, or across the priority goals.',
        inputSchema: getRoadmapDeliveryMetricsSchema.shape,
        readOnly: true,
        handler: getRoadmapDeliveryMetrics,
    },
    {
        name: 'get-strategic-items',
        description: 'Strategic roadmap items for a category (csm-priority, with-goals, combined) and period (last-release, quarter, year).',
        inputSchema: getStrategicItemsSchema.shape,
        readOnly: true,
        handler: getStrategicItems,
    },
    {
        name: 'get-confidence-rating',
        description: 'Confidence history for one Aha epic: the calculated score, any PM adjustment, and the final result, newest snapshot first.',
        inputSchema: getConfidenceRatingSchema.shape,
        readOnly: true,
        handler: getConfidenceRating,
    },

    {
        name: 'get-analytics',
        description: 'Run a ClearGO analytics report: success-plan-completion, criteria-timeliness, retro-completion, launch-hygiene or pm-timeliness, optionally filtered by tier, pod or date range.',
        inputSchema: getAnalyticsSchema.shape,
        readOnly: true,
        handler: getAnalytics,
    },
    {
        name: 'list-paprico-meetings',
        description: 'Paprico meetings, newest first, and which one is next.',
        inputSchema: {},
        readOnly: true,
        handler: listPapricoMeetings,
    },
    {
        name: 'get-paprico-agenda',
        description: 'The computed agenda for one Paprico meeting.',
        inputSchema: AgendaInputSchema.shape,
        readOnly: true,
        handler: getPapricoAgenda,
    },
    {
        name: 'list-paprico-decisions',
        description: 'Decisions recorded in Paprico, optionally for one meeting.',
        inputSchema: DecisionsInputSchema.shape,
        readOnly: true,
        handler: listPapricoDecisions,
    },
    {
        name: 'get-forecast',
        description: 'The current or a specific ARR forecast run for an epic, with assumptions, periods and narrative. Takes the Aha reference (CC-EPIC-123), not the epic UUID. Read only; generating a forecast is not exposed.',
        inputSchema: getForecastSchema.shape,
        readOnly: true,
        handler: getForecast,
    },
    {
        name: 'get-epic-decisions',
        description: 'Decisions recorded against an epic, newest first, with who took them.',
        inputSchema: getEpicDecisionsSchema.shape,
        readOnly: true,
        handler: getEpicDecisions,
    },
    {
        name: 'get-epic-story-brief',
        description: 'The Story Brief authored on an EPIC, with its change log. Distinct from the story_brief launch artifact that get-artifact returns: that one belongs to a GTM launch and is derived from these.',
        inputSchema: getEpicStoryBriefSchema.shape,
        readOnly: true,
        handler: getEpicStoryBrief,
    },


    // ── Team management ─────────────────────────────────────────────────────
    // snake_case on purpose: renaming would break existing consumers.
    {
        name: 'list_team_members',
        description: 'List the active direct reports of the authenticated caller, with a health snapshot (active epic count, open blocker count). Returns an empty list if the caller manages nobody.',
        inputSchema: {},
        readOnly: true,
        handler: listTeamMembers,
    },
    {
        name: 'get_1on1_prep',
        description: 'A structured 1:1 prep document for a team member: active epics, what shipped this week, escalations needed and suggested talking points.',
        inputSchema: PersonSchema.shape,
        readOnly: true,
        handler: getOneOnOnePrep,
    },
    {
        name: 'list_member_epics',
        description: 'Epics owned by a team member, optionally filtered by status.',
        inputSchema: MemberEpicsSchema.shape,
        readOnly: true,
        handler: listMemberEpics,
    },
    {
        name: 'list_member_blockers',
        description: 'Open blockers on the epics owned by a team member, with escalation flags pre-computed (needs_escalation when blocked 3+ days at high or critical severity).',
        inputSchema: MemberSchema.shape,
        readOnly: true,
        handler: listMemberBlockers,
    },
    {
        name: 'get_epic_detail',
        description: 'Full detail for one epic: owner, product, blockers, milestones and a readiness criteria summary.',
        inputSchema: EpicDetailSchema.shape,
        readOnly: true,
        handler: getEpicDetail,
    },

    {
        name: 'list-paprico-items',
        description: 'The PaPriCo backlog, optionally filtered by status (proposed, scheduled, decided, deferred). What is waiting to be discussed.',
        inputSchema: ItemsInputSchema.shape,
        readOnly: true,
        handler: listPapricoItems,
    },
    {
        name: 'get-next-paprico-meeting',
        description: 'The next matching event on the connected Google calendar, used to date a new PaPriCo meeting. Returns found:false rather than failing when Google is not connected or the calendar scope is missing.',
        inputSchema: NextMeetingInputSchema.shape,
        readOnly: true,
        handler: getNextPapricoMeeting,
    },
    {
        name: 'list-forecasts',
        description: 'Committed ARR forecast links across epics, newest first — the portfolio view of what has a forecast and what it projects.',
        inputSchema: listForecastsSchema.shape,
        readOnly: true,
        handler: listForecasts,
    },
    {
        name: 'get-forecast-status',
        description: 'Whether a backgrounded forecast run has finished. Poll this with the jobId from generate-forecast; it reports finished plus the runId once it succeeds.',
        inputSchema: getForecastStatusSchema.shape,
        readOnly: true,
        handler: getForecastStatus,
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
    {
        name: 'adjust-confidence',
        description: 'Apply a PM adjustment (-20 to +20 points) to an epic confidence rating for a snapshot, with a note. Recalculates the final score and records the change.',
        inputSchema: adjustConfidenceSchema.shape,
        readOnly: false,
        handler: adjustConfidence,
    },
    {
        name: 'set-impact-override',
        description: 'Record that a roadmap movement mattered more or less than the automatic assessment said, for a given week.',
        inputSchema: setImpactOverrideSchema.shape,
        readOnly: false,
        handler: setImpactOverride,
    },
    {
        name: 'create-paprico-meeting',
        description: 'Create a PaPriCo meeting for a date. It starts as a draft; use publish-paprico-agenda when the agenda is ready. Pair with get-next-paprico-meeting to pick the date.',
        inputSchema: CreateMeetingInputSchema.shape,
        readOnly: false,
        handler: createPapricoMeeting,
    },
    {
        name: 'add-paprico-item',
        description: 'Add an item to the PaPriCo backlog for a future meeting.',
        inputSchema: AddItemInputSchema.shape,
        readOnly: false,
        handler: addPapricoItem,
    },
    {
        name: 'publish-paprico-agenda',
        description: 'Freeze the computed agenda onto a draft meeting and mark it published, returning the Slack block for #paprico. Only a draft can publish, and publishing twice is refused rather than racing.',
        inputSchema: PublishInputSchema.shape,
        readOnly: false,
        handler: publishPapricoAgenda,
    },
    {
        name: 'generate-forecast',
        description: 'Run the live ARR forecast pipeline for an epic. Expensive: several AI agents, minutes of wall clock, and it replaces the current forecast. On production it returns a jobId to poll with get-forecast-status; locally it completes inline.',
        inputSchema: generateForecastSchema.shape,
        readOnly: false,
        handler: generateForecast,
    },
];

export function registerClearGoTools(
    server: McpServer,
    supabase: SupabaseClient,
    actor: McpAuthInfo
): void {
    for (const tool of MCP_TOOLS) {
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
