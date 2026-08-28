/**
 * Tool: diff-artifact
 *
 * Compares two generations of an artifact's ai_draft and returns a structured
 * diff: sections that were added, removed, or changed, with claim-level detail.
 *
 * Generations are stored in the `launch_artifact_history` table (one row per
 * generation). If the history table is not available, falls back to comparing
 * the current generation against the `context_snapshot` (which often contains
 * the prior state).
 */
import { z } from 'zod';
import { createAdminClient } from '../client.js';

const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  /** Optional: compare against a specific generation. Defaults to generation - 1. */
  fromGeneration: z.number().optional().describe('Starting generation (defaults to current - 1)'),
  toGeneration: z.number().optional().describe('Ending generation (defaults to current)'),
});

type DiffChange = { path: string; change: 'added' | 'removed' | 'modified'; oldValue: unknown; newValue: unknown };

/** Deep-diff two objects and return a structured change list. */
function deepDiff(
  oldVal: unknown,
  newVal: unknown,
  path: string = ''
): DiffChange[] {
  if (oldVal === newVal) return [];

  const oldObj = oldVal && typeof oldVal === 'object' ? oldVal : null;
  const newObj = newVal && typeof newVal === 'object' ? newVal : null;

  // Both are arrays
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    const changes: DiffChange[] = [];
    const maxLen = Math.max(oldVal.length, newVal.length);
    for (let i = 0; i < maxLen; i++) {
      const itemPath = `${path}[${i}]`;
      if (i >= oldVal.length) {
        changes.push({ path: itemPath, change: 'added', oldValue: undefined, newValue: newVal[i] });
      } else if (i >= newVal.length) {
        changes.push({ path: itemPath, change: 'removed', oldValue: oldVal[i], newValue: undefined });
      } else {
        changes.push(...deepDiff(oldVal[i], newVal[i], itemPath));
      }
    }
    return changes;
  }

  // Both are plain objects (not null, not array)
  if (oldObj && newObj && !Array.isArray(oldVal) && !Array.isArray(newVal)) {
    const changes: DiffChange[] = [];
    const oldRecord = oldVal as Record<string, unknown>;
    const newRecord = newVal as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]);

    for (const key of allKeys) {
      const hasOld = key in oldRecord;
      const hasNew = key in newRecord;
      const itemPath = path ? `${path}.${key}` : key;

      if (!hasOld && hasNew) {
        const serialized = JSON.stringify(newRecord[key]);
        if (typeof newRecord[key] === 'object' && newRecord[key] !== null && serialized.length > 200) {
          changes.push({ path: itemPath, change: 'added', oldValue: undefined, newValue: '<nested object>' });
        } else {
          changes.push({ path: itemPath, change: 'added', oldValue: undefined, newValue: newRecord[key] });
        }
      } else if (hasOld && !hasNew) {
        const serialized = JSON.stringify(oldRecord[key]);
        if (typeof oldRecord[key] === 'object' && oldRecord[key] !== null && serialized.length > 200) {
          changes.push({ path: itemPath, change: 'removed', oldValue: '<nested object>', newValue: undefined });
        } else {
          changes.push({ path: itemPath, change: 'removed', oldValue: oldRecord[key], newValue: undefined });
        }
      } else {
        changes.push(...deepDiff(oldRecord[key], newRecord[key], itemPath));
      }
    }
    return changes;
  }

  // Leaf-level change
  if (path) {
    return [{ path, change: oldVal === undefined ? 'added' : newVal === undefined ? 'removed' : 'modified', oldValue: oldVal, newValue: newVal }];
  }

  return [];
}

/** Summarize changes at the section level for readability. */
function summarizeChanges(changes: ReturnType<typeof deepDiff>): {
  sectionsChanged: string[];
  additions: number;
  removals: number;
  modifications: number;
} {
  const sections = new Set<string>();
  let additions = 0, removals = 0, modifications = 0;

  for (const c of changes) {
    const section = c.path.split('.')[0];
    if (section) sections.add(section);
    if (c.change === 'added') additions++;
    else if (c.change === 'removed') removals++;
    else modifications++;
  }

  return { sectionsChanged: [...sections], additions, removals, modifications };
}

export async function diffArtifact(args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const supabase = createAdminClient();

  // Fetch current artifact
  const { data: artifact, error: fetchError } = await supabase
    .from('launch_artifact')
    .select('id, ai_draft, generation')
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .single();

  if (fetchError || !artifact) {
    return { error: fetchError?.message ?? 'Artifact not found' };
  }

  const toGen = parsed.data.toGeneration ?? artifact.generation;
  const fromGen = parsed.data.fromGeneration ?? toGen - 1;

  if (fromGen < 0) {
    return { error: 'fromGeneration cannot be negative. Generation 0 has no prior state to diff against.' };
  }

  if (fromGen === 0) {
    // Generation 0 = initial state (empty ai_draft). Diff against null.
    const changes = deepDiff(null, artifact.ai_draft);
    const summary = summarizeChanges(changes);
    return {
      artifact_type: parsed.data.artifactType,
      from_generation: 0,
      to_generation: toGen,
      summary: `Initial draft: ${summary.additions} additions`,
      changes: changes.slice(0, 50),
      total_changes: changes.length,
    };
  }

  // Fetch prior generation from history
  const { data: historyRow, error: historyError } = await supabase
    .from('launch_artifact_history')
    .select('ai_draft, generation')
    .eq('launch_artifact_id', artifact.id)
    .eq('generation', fromGen)
    .single();

  if (historyError || !historyRow) {
    return {
      error: 'Prior generation not found in history',
      hint: `No history row for generation ${fromGen}. The history table may not be populated for older artifacts.`,
      current_generation: artifact.generation,
    };
  }

  const changes = deepDiff(historyRow.ai_draft, artifact.ai_draft);
  const summary = summarizeChanges(changes);

  return {
    artifact_type: parsed.data.artifactType,
    from_generation: fromGen,
    to_generation: toGen,
    summary: summarizeChanges(changes),
    changes: changes.slice(0, 100),
    total_changes: changes.length,
    truncation_note: changes.length > 100 ? `Showing 100 of ${changes.length} changes` : undefined,
  };
}