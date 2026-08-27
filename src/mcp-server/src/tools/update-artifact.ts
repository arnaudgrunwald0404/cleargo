/**
 * Tool: update-artifact
 *
 * Updates the ai_draft content of an artifact. This is the primary way to
 * make content edits — the Google Doc can't be round-tripped, so changes go
 * through the ai_draft column. A subsequent draft will re-render to the Doc.
 *
 * Supports both full replacement and targeted section updates.
 */
import { z } from 'zod';
import { createAdminClient } from '../client.js';

const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  /** Full replacement of ai_draft. Mutually exclusive with updates. */
  aiDraft: z.record(z.unknown()).optional().describe('Full replacement of ai_draft content'),
  /** Targeted updates to specific keys in ai_draft. Merged with existing content. */
  updates: z.record(z.unknown()).optional().describe('Key-value pairs to merge into ai_draft'),
});

export async function updateArtifact(args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!parsed.data.aiDraft && !parsed.data.updates) {
    return { error: 'Provide either aiDraft (full replacement) or updates (targeted merge)' };
  }

  if (parsed.data.aiDraft && parsed.data.updates) {
    return { error: 'Provide aiDraft OR updates, not both' };
  }

  const supabase = createAdminClient();

  // Read current artifact
  const { data: artifact, error: fetchError } = await supabase
    .from('launch_artifact')
    .select('id, ai_draft, generation')
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .single();

  if (fetchError || !artifact) {
    return { error: fetchError?.message ?? 'Artifact not found' };
  }

  // Compute new ai_draft
  const newAiDraft = parsed.data.aiDraft
    ? parsed.data.aiDraft
    : { ...artifact.ai_draft, ...parsed.data.updates };

  // Increment generation to track that content changed
  const newGeneration = artifact.generation + 1;

  const { data: updated, error: updateError } = await supabase
    .from('launch_artifact')
    .update({
      ai_draft: newAiDraft,
      generation: newGeneration,
      status: 'DRAFTING',
      updated_at: new Date().toISOString(),
    })
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .select('id, artifact_type, status, generation, updated_at')
    .single();

  if (updateError || !updated) {
    return { error: updateError?.message ?? 'Failed to update artifact' };
  }

  return {
    success: true,
    id: updated.id,
    artifact_type: updated.artifact_type,
    status: updated.status,
    generation: updated.generation,
    message: `Updated ${parsed.data.artifactType} to generation ${newGeneration}`,
  };
}