/**
 * Tool: get-artifact
 *
 * Reads a single artifact including its ai_draft content, context_snapshot,
 * and any open flags (interview questions the agent still needs answered).
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
});

export async function getArtifact(supabase: SupabaseClient, args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }


  const { data: artifact, error } = await supabase
    .from('launch_artifact')
    .select('*')
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .single();

  if (error || !artifact) {
    return { error: error?.message ?? 'Artifact not found' };
  }

  // Fetch open flags (interview questions)
  const { data: flags } = await supabase
    .from('launch_artifact_flag')
    .select('*')
    .eq('launch_artifact_id', artifact.id)
    .in('status', ['open', 'asked']);

  // Fetch change request history (recent flags marked answered/deferred)
  const { data: history } = await supabase
    .from('launch_artifact_flag')
    .select('flag_key, claim, question, answer, status, answered_at')
    .eq('launch_artifact_id', artifact.id)
    .in('status', ['answered', 'deferred'])
    .order('updated_at', { ascending: false })
    .limit(10);

  return {
    id: artifact.id,
    artifact_type: artifact.artifact_type,
    status: artifact.status,
    version: artifact.version,
    generation: artifact.generation,
    doc_url: artifact.doc_url,
    owner_email: artifact.owner_email,
    ai_draft: artifact.ai_draft,
    context_snapshot: artifact.context_snapshot,
    change_request_note: artifact.change_request_note,
    open_flags: (flags || []).map((f) => ({
      flag_key: f.flag_key,
      section: f.section,
      claim: f.claim,
      question: f.question,
      status: f.status,
    })),
    recent_history: history || [],
    last_drafted_at: artifact.last_drafted_at,
    approved_at: artifact.approved_at,
    approved_by: artifact.approved_by,
  };
}