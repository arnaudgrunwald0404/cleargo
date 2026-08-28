/**
 * Tool: review-artifact
 *
 * Moves an artifact through the review lifecycle:
 * - PENDING_REVIEW: Submit the draft for review
 * - CHANGES_REQUESTED: Send back with a reason
 * - APPROVED: Approve as v1.0 (marks the readiness criterion DONE)
 */
import { z } from 'zod';
import { createAdminClient } from '../client.js';
import { config } from '../config.js';

const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  status: z.enum(['PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'])
    .describe('The new status'),
  changeRequestNote: z.string().max(4000).optional()
    .describe('Required when status=CHANGES_REQUESTED: what the next draft should address'),
});

export async function reviewArtifact(args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (parsed.data.status === 'CHANGES_REQUESTED' && !parsed.data.changeRequestNote?.trim()) {
    return { error: 'A change request needs a reason the next draft can act on.' };
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const actorEmail = config.actorEmail || 'mcp-server@cleargo.local';

  // Read current artifact
  const { data: artifact, error: fetchError } = await supabase
    .from('launch_artifact')
    .select('*')
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .single();

  if (fetchError || !artifact) {
    return { error: fetchError?.message ?? 'Artifact not found' };
  }

  // Build update payload
  const update: Record<string, unknown> = { status: parsed.data.status, updated_at: now };

  if (parsed.data.status === 'APPROVED') {
    update.version = 'v1.0';
    update.approved_by = actorEmail;
    update.approved_at = now;
    update.change_request_note = null;
  }

  if (parsed.data.status === 'CHANGES_REQUESTED') {
    update.change_request_note = parsed.data.changeRequestNote?.trim() ?? null;
  }

  if (parsed.data.status === 'PENDING_REVIEW') {
    update.submitted_at = now;
  }

  // Apply update
  const { data: updated, error: updateError } = await supabase
    .from('launch_artifact')
    .update(update)
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .select('*')
    .single();

  if (updateError || !updated) {
    return { error: updateError?.message ?? 'Failed to update artifact' };
  }

  // If approved, mark the readiness criterion DONE
  if (parsed.data.status === 'APPROVED' && artifact.criterion_id) {
    const { error: criterionError } = await supabase
      .from('launch_criterion_status')
      .update({ status: 'DONE', last_updated_at: now, last_updated_by: actorEmail })
      .eq('launch_id', parsed.data.launchId)
      .eq('criterion_id', artifact.criterion_id);

    if (criterionError) {
      return {
        success: true,
        artifact: { id: updated.id, status: updated.status, version: updated.version },
        warning: `Criterion not marked done: ${criterionError.message}`,
      };
    }
  }

  return {
    success: true,
    message: `${parsed.data.artifactType} moved to ${parsed.data.status}`,
    artifact: {
      id: updated.id,
      artifact_type: parsed.data.artifactType,
      status: updated.status,
      version: updated.version,
    },
  };
}