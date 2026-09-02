/**
 * Tool: review-artifact
 *
 * Moves an artifact through the review lifecycle:
 * - PENDING_REVIEW: Submit the draft for review
 * - CHANGES_REQUESTED: Send back with a reason
 * - APPROVED: Approve as v1.0 (marks the readiness criterion DONE)
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { canRolesPerform } from '@/lib/permissions';
import { markLaunchCriterionDone } from '@/lib/artifacts/criterionCompletion';

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  status: z.enum(['PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'])
    .describe('The new status'),
  changeRequestNote: z.string().max(4000).optional()
    .describe('Required when status=CHANGES_REQUESTED: what the next draft should address'),
});

export async function reviewArtifact(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (parsed.data.status === 'CHANGES_REQUESTED' && !parsed.data.changeRequestNote?.trim()) {
    return { error: 'A change request needs a reason the next draft can act on.' };
  }

  // Approving is a higher bar than moving something through review, same split
  // the UI route makes (src/app/api/launches/[id]/artifacts/route.ts).
  const needed = parsed.data.status === 'APPROVED'
    ? 'launchArtifact.approve'
    : 'launchArtifact.review';
  if (!canRolesPerform(actor.roles, needed)) {
    return {
      error: parsed.data.status === 'APPROVED'
        ? 'You do not have permission to approve launch artifacts.'
        : 'You do not have permission to move launch artifacts through review.',
    };
  }

  const now = new Date().toISOString();
  // The OAuth subject, not a service account. approved_by is a record of who
  // signed off, and the stdio server used to stamp every approval with the same
  // placeholder address -- which made the field worthless as an audit trail.
  const actorEmail = actor.email;

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
    const completion = await markLaunchCriterionDone(
      supabase,
      {
        launchId: parsed.data.launchId,
        criterionId: artifact.criterion_id,
        actorEmail,
      },
      now
    );

    if (completion.warning) {
      return {
        success: true,
        artifact: { id: updated.id, status: updated.status, version: updated.version },
        warning: completion.warning,
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