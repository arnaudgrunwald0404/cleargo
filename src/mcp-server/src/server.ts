#!/usr/bin/env node
/**
 * ClearGO MCP Server
 *
 * Exposes launch artifact management as MCP tools over stdio transport.
 * Callable from Claude Desktop, Claude Code, or any MCP client.
 *
 * Tools:
 *   list-launches        — List active launches
 *   search-launches      — Search launches by name
 *   get-launch           — Fetch launch details (criteria, assets, epics)
 *   list-artifacts       — List artifacts for a launch
 *   get-artifact         — Read artifact content (ai_draft + flags)
 *   get-launch-context   — Gather all context for drafting
 *   update-artifact      — Edit ai_draft content (full or targeted)
 *   draft-artifact       — Trigger AI agent to draft an artifact
 *   review-artifact      — Approve / request changes / submit for review
 *   ensure-artifacts     — Ensure artifact rows + Google Docs exist
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