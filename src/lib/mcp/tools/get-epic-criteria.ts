/**
 * Tool: get-epic-criteria
 *
 * The readiness matrix for one epic, one row per criterion.
 *
 * This is the discovery step for update-criterion-status: the id it returns is
 * `epic_criterion_status.id`, which is what a score is written against. Nothing
 * in the MCP layer listed criteria before -- queryEpicDetail returns bucketed
 * counts only, and the epic page queries Supabase directly with no HTTP endpoint
 * behind it, so there was no per-criterion view to reuse.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic (release) UUID'),
  status: z
    .array(z.string())
    .optional()
    .describe('Optional filter, e.g. ["NOT_SET"] for unrated or ["NO_GO","CONDITIONAL"] for blockers'),
});

/** PostgREST embeds arrive as an object or a one-element array depending on the join. */
function embedded<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

interface CriterionEmbed {
  label?: string;
  category?: string | null;
  gate?: boolean;
  sort_order?: number | null;
  status_definition_go?: string | null;
  status_definition_conditional?: string | null;
  status_definition_no_go?: string | null;
}

interface OwnerEmbed {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export async function getEpicCriteria(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const { data: epic, error: epicError } = await supabase
    .from('epic')
    .select('id, name, tier, target_launch_date, readiness_score')
    .eq('id', parsed.data.epicId)
    .maybeSingle();

  if (epicError) return { error: epicError.message };
  if (!epic) return { error: 'Epic not found' };

  let query = supabase
    .from('epic_criterion_status')
    .select(
      `id, status, current_status_notes, condition, condition_due_date, last_updated_at,
       criterion:criterion_id(label, category, gate, sort_order,
         status_definition_go, status_definition_conditional, status_definition_no_go),
       decision_owner:decision_owner_id(email, first_name, last_name)`
    )
    .eq('epic_id', parsed.data.epicId);

  if (parsed.data.status?.length) {
    query = query.in('status', parsed.data.status.map((s) => s.toUpperCase()));
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const criteria = (data ?? []).map((row) => {
    const c = embedded<CriterionEmbed>(row.criterion);
    const owner = embedded<OwnerEmbed>(row.decision_owner);
    const ownerName = owner
      ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() || owner.email
      : null;

    return {
      // What update-criterion-status writes against.
      statusRowId: row.id as string,
      label: c?.label ?? 'Unknown criterion',
      category: c?.category ?? null,
      gate: c?.gate ?? false,
      status: (row.status as string | null) ?? 'NOT_SET',
      notes: (row.current_status_notes as string | null) ?? null,
      condition: (row.condition as string | null) ?? null,
      conditionDueDate: (row.condition_due_date as string | null) ?? null,
      lastUpdatedAt: (row.last_updated_at as string | null) ?? null,
      decisionOwner: ownerName,
      decisionOwnerEmail: owner?.email ?? null,
      sortOrder: c?.sort_order ?? null,
      definitions: {
        go: c?.status_definition_go ?? null,
        conditional: c?.status_definition_conditional ?? null,
        noGo: c?.status_definition_no_go ?? null,
      },
    };
  });

  criteria.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

  return {
    epic: {
      id: epic.id,
      name: epic.name,
      tier: epic.tier,
      targetLaunchDate: epic.target_launch_date,
      readinessScore: epic.readiness_score,
    },
    criteria,
    count: criteria.length,
  };
}
