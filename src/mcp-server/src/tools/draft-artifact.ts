/**
 * Tool: draft-artifact
 *
 * Triggers the AI agent to draft (or re-draft) an artifact. The agent
 * crawls Aha, Jira, and existing context to produce the content.
 *
 * Calls the internal draft endpoint on the ClearGO app.
 */
import { z } from 'zod';
import { callInternalApi } from '../client.js';

const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type to draft'),
  sourceNotes: z.string().max(20_000).optional()
    .describe('Optional: PM notes, call transcript, or context to guide the draft'),
});

export async function draftArtifact(args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  try {
    const result = await callInternalApi('/api/internal/artifacts', {
      action: 'draft',
      launchId: parsed.data.launchId,
      artifact_type: parsed.data.artifactType,
      ...(parsed.data.sourceNotes ? { source_notes: parsed.data.sourceNotes } : {}),
    });

    return {
      success: true,
      message: `Draft triggered for ${parsed.data.artifactType}`,
      result,
    };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : 'Failed to trigger draft',
    };
  }
}