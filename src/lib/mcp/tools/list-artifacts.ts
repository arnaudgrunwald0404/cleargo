/**
 * Tool: list-artifacts
 *
 * Lists all launch artifacts for a given launch, sorted in workback order.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type LaunchArtifact, type ArtifactType } from '@/types/artifacts';

const ARTIFACT_ORDER: Record<ArtifactType, number> = {
  gate_checklist: 0,
  story_brief: 1,
  messaging_brief: 2,
  enablement_guide: 3,
  marketing_brief: 4,
};

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
});

export async function listArtifacts(supabase: SupabaseClient, args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }


  const { data: artifacts, error } = await supabase
    .from('launch_artifact')
    .select('*')
    .eq('launch_id', parsed.data.launchId)
    .order('created_at', { ascending: true });

  if (error) {
    return { error: error.message };
  }

  const ordered = (artifacts || []).sort(
    (a, b) => (ARTIFACT_ORDER[a.artifact_type as ArtifactType] ?? 99) - (ARTIFACT_ORDER[b.artifact_type as ArtifactType] ?? 99)
  );

  return {
    artifacts: ordered.map((a: LaunchArtifact) => ({
      id: a.id,
      artifact_type: a.artifact_type,
      status: a.status,
      version: a.version,
      doc_url: a.doc_url,
      owner_email: a.owner_email,
      generation: a.generation,
      change_request_note: a.change_request_note,
      last_drafted_at: a.last_drafted_at,
      approved_at: a.approved_at,
    })),
    count: ordered.length,
  };
}