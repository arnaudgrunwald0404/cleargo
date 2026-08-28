#!/usr/bin/env node
/**
 * ClearGO MCP Server
 *
 * Exposes launch artifact management as MCP tools over stdio transport.
 * Callable from Claude Desktop, Claude Code, or any MCP client.
 *
 * Read tools:
 *   list-launches        — List active launches
 *   search-launches      — Search launches by name
 *   get-launch           — Fetch launch details (criteria, assets, epics)
 *   list-artifacts       — List artifacts for a launch
 *   get-artifact         — Read artifact content (ai_draft + flags)
 *   get-launch-context   — Gather all context for drafting
 *   diff-artifact        — Compare two generations of an artifact
 *
 * Write tools:
 *   update-artifact      — Edit ai_draft content (full or targeted)
 *   draft-artifact       — Trigger AI agent to draft an artifact
 *   draft-section        — Re-draft a single section (focused full pipeline)
 *   review-artifact      — Approve / request changes / submit for review
 *   ensure-artifacts     — Ensure artifact rows + Google Docs exist
 *   answer-flags         — Answer open interview flags
 *
 * Conversational tools:
 *   artifact-chat        — Multi-turn conversation about an artifact
 *   explain-claim        — Explain grounding behind a specific claim
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { listLaunches } from './tools/list-launches.js';
import { searchLaunches } from './tools/search-launches.js';
import { getLaunch } from './tools/get-launch.js';
import { listArtifacts } from './tools/list-artifacts.js';
import { getArtifact } from './tools/get-artifact.js';
import { getLaunchContext } from './tools/get-launch-context.js';
import { updateArtifact } from './tools/update-artifact.js';
import { draftArtifact } from './tools/draft-artifact.js';
import { reviewArtifact } from './tools/review-artifact.js';
import { ensureArtifacts } from './tools/ensure-artifacts.js';
import { answerFlags } from './tools/answer-flags.js';
import { explainClaim } from './tools/explain-claim.js';
import { diffArtifact } from './tools/diff-artifact.js';
import { draftSection } from './tools/draft-section.js';
import { artifactChat } from './tools/artifact-chat.js';

// ── Server setup ────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'cleargo',
  version: '0.1.0',
});

// ── Read tools ──────────────────────────────────────────────────────────────

server.tool(
  'list-launches',
  'List active GTM launches (name, tier, target date, status).',
  {},
  async () => {
    const result = await listLaunches({});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'search-launches',
  'Search launches by name. Returns matching launches with id, name, tier, and status.',
  {
    query: z.string().describe('Search term (matches against launch name)'),
    includeArchived: z.boolean().optional().describe('Include archived launches').default(false),
  },
  async ({ query, includeArchived }) => {
    const result = await searchLaunches({ query, includeArchived });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'get-launch',
  'Fetch a single launch by ID, including criteria statuses, assets, and linked epics.',
  {
    launchId: z.string().describe('The launch ID'),
  },
  async ({ launchId }) => {
    const result = await getLaunch({ launchId });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'list-artifacts',
  'List all launch artifacts for a given launch, sorted in workback order.',
  {
    launchId: z.string().describe('The launch ID'),
  },
  async ({ launchId }) => {
    const result = await listArtifacts({ launchId });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'get-artifact',
  'Read a single artifact including its ai_draft content, context snapshot, and open interview flags.',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type'),
  },
  async ({ launchId, artifactType }) => {
    const result = await getArtifact({ launchId, artifactType });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'get-launch-context',
  'Gather all context for a launch: epics, criteria, existing artifacts with context snapshots. Useful before drafting.',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .optional().describe('Optional: filter context to what this artifact needs'),
  },
  async ({ launchId, artifactType }) => {
    const result = await getLaunchContext({ launchId, artifactType });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Write tools ─────────────────────────────────────────────────────────────

server.tool(
  'update-artifact',
  'Update the ai_draft content of an artifact. Use `aiDraft` for full replacement or `updates` for targeted key-value merges. This is the primary way to edit content — the Google Doc cannot be round-tripped.',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type'),
    aiDraft: z.record(z.unknown()).optional().describe('Full replacement of ai_draft content (JSON object). Mutually exclusive with updates.'),
    updates: z.record(z.unknown()).optional().describe('Key-value pairs to merge into ai_draft. Mutually exclusive with aiDraft.'),
  },
  async ({ launchId, artifactType, aiDraft, updates }) => {
    const result = await updateArtifact({ launchId, artifactType, aiDraft, updates });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'draft-artifact',
  'Trigger the AI agent to draft (or re-draft) an artifact. The agent crawls Aha, Jira, and existing context to produce content. Optional sourceNotes provide additional guidance.',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type to draft'),
    sourceNotes: z.string().optional().describe('Optional: PM notes, call transcript, or context to guide the draft (max 20,000 chars)'),
  },
  async ({ launchId, artifactType, sourceNotes }) => {
    const result = await draftArtifact({ launchId, artifactType, sourceNotes });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'review-artifact',
  'Move an artifact through the review lifecycle: PENDING_REVIEW (submit), CHANGES_REQUESTED (send back with reason), or APPROVED (v1.0, marks criterion DONE).',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type'),
    status: z.enum(['PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'])
      .describe('The new status'),
    changeRequestNote: z.string().optional()
      .describe('Required when status=CHANGES_REQUESTED: what the next draft should address'),
  },
  async ({ launchId, artifactType, status, changeRequestNote }) => {
    const result = await reviewArtifact({ launchId, artifactType, status, changeRequestNote });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'ensure-artifacts',
  'Ensure artifact rows (and Google Docs, if configured) exist for a launch. Idempotent — safe to call multiple times.',
  {
    launchId: z.string().describe('The launch ID'),
  },
  async ({ launchId }) => {
    const result = await ensureArtifacts({ launchId });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Conversational tools ────────────────────────────────────────────────────

server.tool(
  'answer-flags',
  'Answer one or more open interview flags on an artifact. Flags are questions the AI raised during drafting because it could not ground a claim. Supports single-flag mode (flagKey + answer) or bulk mode (answers array).',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type'),
    flagKey: z.string().optional().describe('Answer a single flag by its flag_key. Mutually exclusive with answers.'),
    answer: z.string().optional().describe('Answer for the single flag (max 5,000 chars)'),
    answers: z
      .array(z.object({ flagKey: z.string(), answer: z.string().max(5000) }))
      .optional()
      .describe('Array of { flagKey, answer } pairs. Mutually exclusive with flagKey/answer.'),
  },
  async ({ launchId, artifactType, flagKey, answer, answers }) => {
    const result = await answerFlags({ launchId, artifactType, flagKey, answer, answers });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'explain-claim',
  'Look up a claim in an artifact and explain its grounding: source type, whether it is grounded, and what evidence supports it. Answers "how do you know that?" questions.',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type'),
    claim: z.string().describe('Partial or full text of the claim to look up'),
  },
  async ({ launchId, artifactType, claim }) => {
    const result = await explainClaim({ launchId, artifactType, claim });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'diff-artifact',
  'Compare two generations of an artifact and return a structured diff: sections added, removed, or modified. Useful for reviewing what changed between drafts.',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type'),
    fromGeneration: z.number().optional().describe('Starting generation (defaults to current - 1)'),
    toGeneration: z.number().optional().describe('Ending generation (defaults to current)'),
  },
  async ({ launchId, artifactType, fromGeneration, toGeneration }) => {
    const result = await diffArtifact({ launchId, artifactType, fromGeneration, toGeneration });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'draft-section',
  'Re-draft a single section of an artifact. Sends a targeted change request through the full AI pipeline (context loading, grounding checks) so consistency is preserved. More focused than draft-artifact, more thorough than update-artifact.',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type'),
    section: z.string().describe('The section key to re-draft (e.g., value_story, message_house, objection_handling)'),
    instructions: z.string().optional().describe('Specific instructions for this section (max 5,000 chars)'),
    sourceNotes: z.string().optional().describe('Additional context or research to inform this section (max 20,000 chars)'),
  },
  async ({ launchId, artifactType, section, instructions, sourceNotes }) => {
    const result = await draftSection({ launchId, artifactType, section, instructions, sourceNotes });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'artifact-chat',
  'Multi-turn conversational interface for working with launch artifacts. Ask questions, get reviews, or request summaries. Read-only — use update-artifact or draft-section for edits.',
  {
    launchId: z.string().describe('The launch ID'),
    artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
      .describe('The artifact type'),
    message: z.string().describe('Your question, request, or comment about the artifact'),
    mode: z.enum(['question', 'review', 'summary', 'free']).optional()
      .describe('Mode: question (ask about content), review (structured critique), summary (high-level state), free (open-ended)'),
  },
  async ({ launchId, artifactType, message, mode }) => {
    const result = await artifactChat({ launchId, artifactType, message, mode });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Start server ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ClearGO MCP server running (stdio)');
}

main().catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});