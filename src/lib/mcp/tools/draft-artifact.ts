/**
 * Tool: draft-artifact
 *
 * Triggers the AI agent to draft (or re-draft) an artifact. The agent crawls
 * Aha, Jira, and existing context to produce the content.
 *
 * Runs through startArtifactDraft, which hands the work to a background function
 * rather than waiting for it — a full draft takes minutes and a synchronous
 * Netlify function is killed at 26 seconds. The tool returns immediately and the
 * caller polls get-artifact.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startArtifactDraft } from '@/lib/artifacts/startDraft';
import { canRolesPerform } from '@/lib/permissions';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import type { ArtifactType } from '@/types/artifacts';
import { describeDraftResult } from './draftResult';

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type to draft'),
  sourceNotes: z.string().max(20_000).optional()
    .describe('Optional: PM notes, call transcript, or context to guide the draft'),
});

export async function draftArtifactTool(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!canRolesPerform(actor.roles, 'launchArtifact.draft')) {
    return { error: 'You do not have permission to draft launch artifacts.' };
  }

  try {
    const result = await startArtifactDraft(
      parsed.data.launchId,
      parsed.data.artifactType as ArtifactType,
      { sourceNotes: parsed.data.sourceNotes, actorEmail: actor.email },
      supabase
    );

    return describeDraftResult(result, parsed.data.artifactType as ArtifactType);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to start draft' };
  }
}
