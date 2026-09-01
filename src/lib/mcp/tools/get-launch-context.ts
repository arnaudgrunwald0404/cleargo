/**
 * Tool: get-launch-context
 *
 * Gathers all the context the AI agent would need to draft an artifact:
 * launch details, epics, criteria, Aha data, and existing artifacts.
 * Useful for understanding what's known before drafting.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Shape of the joined launch_epic rows this tool selects. */
interface LaunchEpicRow {
  epic_id?: string;
  epic?: {
    name?: string;
    tier?: string | null;
    status?: string | null;
    aha_id?: string | null;
    aha_url?: string | null;
  } | null;
}

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .optional().describe('Optional: filter context to what this artifact needs'),
});

export async function getLaunchContext(supabase: SupabaseClient, args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }


  // Fetch launch with full context
  const { data: launch, error: launchError } = await supabase
    .from('launch')
    .select(`
      *,
      launch_epic(id, epic_id, epic:epic(id, name, tier, status))
    `)
    .eq('id', parsed.data.launchId)
    .single();

  if (launchError || !launch) {
    return { error: launchError?.message ?? 'Launch not found' };
  }

  // Fetch artifacts and their context snapshots
  const { data: artifacts } = await supabase
    .from('launch_artifact')
    .select('artifact_type, status, version, context_snapshot, validation_snapshot, generation, doc_url')
    .eq('launch_id', parsed.data.launchId);

  // Fetch criteria statuses
  const { data: criteria } = await supabase
    .from('launch_criterion_status')
    .select(`
      criterion_id, status, owner_email, due_date, notes,
      criterion:criterion_id(id, label, category, gate, phase)
    `)
    .eq('launch_id', parsed.data.launchId);

  return {
    launch: {
      id: launch.id,
      name: launch.name,
      tier: launch.tier,
      target_launch_date: launch.target_launch_date,
      status: launch.status,
      owner_email: launch.owner_email,
    },
    epics: launch.launch_epic?.map((e: LaunchEpicRow) => ({
      epic_id: e.epic_id,
      name: e.epic?.name,
      tier: e.epic?.tier,
      status: e.epic?.status,
      aha_id: e.epic?.aha_id,
      aha_url: e.epic?.aha_url,
    })) || [],
    artifacts: artifacts?.map((a) => ({
      artifact_type: a.artifact_type,
      status: a.status,
      version: a.version,
      generation: a.generation,
      doc_url: a.doc_url,
      context_snapshot: a.context_snapshot,
    })) || [],
    criteria: criteria || [],
  };
}